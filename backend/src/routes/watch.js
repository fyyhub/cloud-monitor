import express from 'express'
import cron from 'node-cron'
import { getDb } from '../config/database.js'
import { authMiddleware } from '../middleware/auth.js'
import { watchService } from '../services/watchService.js'

const router = express.Router()
router.use(authMiddleware)

// 获取任务列表（含每个任务绑定的容器）
router.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    const tasks = await db.all('SELECT * FROM watch_tasks WHERE user_id = ? ORDER BY created_at DESC', [req.user.id])

    const result = await Promise.all(tasks.map(async task => {
      const containers = await db.all(`
        SELECT c.id, c.container_name, c.status,
               p.name as platform_name, p.platform_type
        FROM watch_task_containers wtc
        JOIN containers c ON wtc.container_id = c.id
        JOIN platforms p ON c.platform_id = p.id
        WHERE wtc.task_id = ?
      `, [task.id])
      return { ...task, containers }
    }))

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// 创建任务
router.post('/', async (req, res, next) => {
  try {
    const { name, cron_expr, container_ids = [], enabled = 1 } = req.body
    if (!name || !cron_expr) return res.status(400).json({ error: '缺少必填参数' })
    if (!cron.validate(cron_expr)) return res.status(400).json({ error: 'cron 表达式无效' })

    const db = getDb()
    const taskResult = await db.run(
      'INSERT INTO watch_tasks (user_id, name, cron_expr, enabled) VALUES (?, ?, ?, ?)',
      [req.user.id, name, cron_expr, enabled ? 1 : 0]
    )

    const taskId = taskResult.lastInsertRowid

    // 绑定容器（校验容器属于当前用户）
    for (const cid of container_ids) {
      const owned = await db.get(`
        SELECT c.id FROM containers c
        JOIN platforms p ON c.platform_id = p.id
        WHERE c.id = ? AND p.user_id = ?
      `, [cid, req.user.id])
      if (owned) {
        // 检查是否已存在，避免唯一约束冲突
        const exists = await db.get(
          'SELECT id FROM watch_task_containers WHERE task_id = ? AND container_id = ?',
          [taskId, cid]
        )
        if (!exists) {
          await db.run(
            'INSERT INTO watch_task_containers (task_id, container_id) VALUES (?, ?)',
            [taskId, cid]
          )
        }
      }
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
router.put('/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const existing = await db.get('SELECT * FROM watch_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    const { name, cron_expr, enabled } = req.body
    if (cron_expr && !cron.validate(cron_expr)) return res.status(400).json({ error: 'cron 表达式无效' })

    const newName = name ?? existing.name
    const newCron = cron_expr ?? existing.cron_expr
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled

    await db.run('UPDATE watch_tasks SET name = ?, cron_expr = ?, enabled = ? WHERE id = ?',
      [newName, newCron, newEnabled, existing.id])

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
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const existing = await db.get('SELECT id FROM watch_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    watchService.unscheduleTask(existing.id)
    await db.run('DELETE FROM watch_tasks WHERE id = ?', [existing.id])
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// 更新任务绑定的容器列表
router.put('/:id/containers', async (req, res, next) => {
  try {
    const db = getDb()
    const existing = await db.get('SELECT id FROM watch_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    const { container_ids = [] } = req.body

    await db.run('DELETE FROM watch_task_containers WHERE task_id = ?', [existing.id])

    for (const cid of container_ids) {
      const owned = await db.get(`
        SELECT c.id FROM containers c
        JOIN platforms p ON c.platform_id = p.id
        WHERE c.id = ? AND p.user_id = ?
      `, [cid, req.user.id])
      if (owned) {
        const exists = await db.get(
          'SELECT id FROM watch_task_containers WHERE task_id = ? AND container_id = ?',
          [existing.id, cid]
        )
        if (!exists) {
          await db.run(
            'INSERT INTO watch_task_containers (task_id, container_id) VALUES (?, ?)',
            [existing.id, cid]
          )
        }
      }
    }

    const containers = await db.all(`
      SELECT c.id, c.container_name, c.status,
             p.name as platform_name, p.platform_type
      FROM watch_task_containers wtc
      JOIN containers c ON wtc.container_id = c.id
      JOIN platforms p ON c.platform_id = p.id
      WHERE wtc.task_id = ?
    `, [existing.id])

    res.json({ containers })
  } catch (err) {
    next(err)
  }
})

// 获取任务执行日志
router.get('/:id/logs', async (req, res, next) => {
  try {
    const db = getDb()
    const existing = await db.get('SELECT id FROM watch_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!existing) return res.status(404).json({ error: '任务不存在' })

    const { page = 1, limit = 50 } = req.query
    const offset = (Number(page) - 1) * Number(limit)

    const logs = await db.all(`
      SELECT wl.*, c.container_name
      FROM watch_logs wl
      JOIN containers c ON wl.container_id = c.id
      WHERE wl.task_id = ?
      ORDER BY wl.created_at DESC
      LIMIT ? OFFSET ?
    `, [existing.id, Number(limit), offset])

    const countRow = await db.get('SELECT COUNT(*) as count FROM watch_logs WHERE task_id = ?', [existing.id])
    const total = countRow?.count ?? 0

    res.json({ logs, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    next(err)
  }
})

export default router
