import express from 'express'
import cron from 'node-cron'
import { getDb } from '../config/database.js'
import { authMiddleware } from '../middleware/auth.js'
import { watchService } from '../services/watchService.js'

const router = express.Router()
router.use(authMiddleware)

// 获取任务列表（含每个任务绑定的容器）
router.get('/', (req, res) => {
  const db = getDb()
  const tasks = db.prepare('SELECT * FROM watch_tasks WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)

  const result = tasks.map(task => {
    const containers = db.prepare(`
      SELECT c.id, c.container_name, c.status,
             p.name as platform_name, p.platform_type
      FROM watch_task_containers wtc
      JOIN containers c ON wtc.container_id = c.id
      JOIN platforms p ON c.platform_id = p.id
      WHERE wtc.task_id = ?
    `).all(task.id)
    return { ...task, containers }
  })

  res.json(result)
})

// 创建任务
router.post('/', (req, res, next) => {
  try {
    const { name, cron_expr, container_ids = [], enabled = 1 } = req.body
    if (!name || !cron_expr) return res.status(400).json({ error: '缺少必填参数' })
    if (!cron.validate(cron_expr)) return res.status(400).json({ error: 'cron 表达式无效' })

    const db = getDb()
    const taskResult = db.prepare(
      'INSERT INTO watch_tasks (user_id, name, cron_expr, enabled) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, name, cron_expr, enabled ? 1 : 0)

    const taskId = taskResult.lastInsertRowid

    // 绑定容器（校验容器属于当前用户）
    const insertContainer = db.prepare(
      'INSERT OR IGNORE INTO watch_task_containers (task_id, container_id) VALUES (?, ?)'
    )
    for (const cid of container_ids) {
      const owned = db.prepare(`
        SELECT c.id FROM containers c
        JOIN platforms p ON c.platform_id = p.id
        WHERE c.id = ? AND p.user_id = ?
      `).get(cid, req.user.id)
      if (owned) insertContainer.run(taskId, cid)
    }

    if (enabled) {
      watchService.scheduleTask({ id: taskId, name, cron_expr, enabled: 1 })
    }

    res.status(201).json({ id: taskId, name, cron_expr, enabled: enabled ? 1 : 0, containers: [] })
  } catch (err) {
    next(err)
  }
})

// 更新任务
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM watch_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    const { name, cron_expr, enabled } = req.body
    if (cron_expr && !cron.validate(cron_expr)) return res.status(400).json({ error: 'cron 表达式无效' })

    const newName = name ?? existing.name
    const newCron = cron_expr ?? existing.cron_expr
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled

    db.prepare('UPDATE watch_tasks SET name = ?, cron_expr = ?, enabled = ? WHERE id = ?')
      .run(newName, newCron, newEnabled, existing.id)

    const updated = { ...existing, name: newName, cron_expr: newCron, enabled: newEnabled }
    if (newEnabled) {
      watchService.scheduleTask(updated)
    } else {
      watchService.unscheduleTask(existing.id)
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// 删除任务
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM watch_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    watchService.unscheduleTask(existing.id)
    db.prepare('DELETE FROM watch_tasks WHERE id = ?').run(existing.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// 更新任务绑定的容器列表
router.put('/:id/containers', (req, res, next) => {
  try {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM watch_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    const { container_ids = [] } = req.body

    db.prepare('DELETE FROM watch_task_containers WHERE task_id = ?').run(existing.id)

    const insertContainer = db.prepare(
      'INSERT OR IGNORE INTO watch_task_containers (task_id, container_id) VALUES (?, ?)'
    )
    for (const cid of container_ids) {
      const owned = db.prepare(`
        SELECT c.id FROM containers c
        JOIN platforms p ON c.platform_id = p.id
        WHERE c.id = ? AND p.user_id = ?
      `).get(cid, req.user.id)
      if (owned) insertContainer.run(existing.id, cid)
    }

    const containers = db.prepare(`
      SELECT c.id, c.container_name, c.status,
             p.name as platform_name, p.platform_type
      FROM watch_task_containers wtc
      JOIN containers c ON wtc.container_id = c.id
      JOIN platforms p ON c.platform_id = p.id
      WHERE wtc.task_id = ?
    `).all(existing.id)

    res.json({ containers })
  } catch (err) {
    next(err)
  }
})

// 获取任务执行日志
router.get('/:id/logs', (req, res, next) => {
  try {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM watch_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    const { page = 1, limit = 50 } = req.query
    const offset = (Number(page) - 1) * Number(limit)

    const logs = db.prepare(`
      SELECT wl.*, c.container_name
      FROM watch_logs wl
      JOIN containers c ON wl.container_id = c.id
      WHERE wl.task_id = ?
      ORDER BY wl.created_at DESC
      LIMIT ? OFFSET ?
    `).all(existing.id, Number(limit), offset)

    const total = db.prepare('SELECT COUNT(*) as count FROM watch_logs WHERE task_id = ?').get(existing.id).count

    res.json({ logs, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    next(err)
  }
})

export default router
