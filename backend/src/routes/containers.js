import express from 'express'
import { getDb } from '../config/database.js'
import { authMiddleware } from '../middleware/auth.js'
import { decrypt } from '../utils/crypto.js'
import { getAdapter } from '../services/platformAdapters/index.js'
import logger from '../utils/logger.js'

const router = express.Router()
router.use(authMiddleware)

// 获取当前用户所有容器
router.get('/', (req, res) => {
  const db = getDb()
  const containers = db.prepare(`
    SELECT c.*, p.platform_type, p.name as platform_name
    FROM containers c
    JOIN platforms p ON c.platform_id = p.id
    WHERE p.user_id = ?
    ORDER BY c.last_check DESC
  `).all(req.user.id)

  res.json(containers.map(c => ({
    ...c,
    metadata: c.metadata ? JSON.parse(c.metadata) : null
  })))
})

// 手动刷新所有容器状态
router.post('/refresh', async (req, res, next) => {
  try {
    const db = getDb()
    const platforms = db.prepare('SELECT * FROM platforms WHERE user_id = ? AND enabled = 1').all(req.user.id)

    for (const platform of platforms) {
      const apiKey = decrypt(platform.api_key)
      const extraConfig = platform.extra_config ? JSON.parse(platform.extra_config) : {}
      const adapter = getAdapter(platform.platform_type, apiKey, extraConfig)
      try {
        const containers = await adapter.listContainers()
        const remoteIds = containers.map(c => c.id)
        for (const c of containers) {
          const existing = db.prepare('SELECT id FROM containers WHERE platform_id = ? AND container_id = ?').get(platform.id, c.id)
          if (existing) {
            db.prepare('UPDATE containers SET container_name = ?, status = ?, last_check = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?')
              .run(c.name, c.status, JSON.stringify(c.metadata || {}), existing.id)
          } else {
            db.prepare('INSERT INTO containers (platform_id, container_id, container_name, status, last_check, metadata) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)')
              .run(platform.id, c.id, c.name, c.status, JSON.stringify(c.metadata || {}))
          }
        }
        // 删除远端已不存在的本地容器记录
        const local = db.prepare('SELECT id, container_id FROM containers WHERE platform_id = ?').all(platform.id)
        for (const row of local) {
          if (!remoteIds.includes(row.container_id)) {
            db.prepare('DELETE FROM containers WHERE id = ?').run(row.id)
          }
        }
      } catch (err) {
        logger.error(`刷新平台 ${platform.name} 失败`, { error: err.message })
      }
    }

    res.json({ success: true, message: '刷新完成' })
  } catch (err) {
    next(err)
  }
})

// 获取容器详情
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const container = db.prepare(`
      SELECT c.*, p.platform_type, p.api_key, p.extra_config, p.name as platform_name
      FROM containers c JOIN platforms p ON c.platform_id = p.id
      WHERE c.id = ? AND p.user_id = ?
    `).get(req.params.id, req.user.id)
    if (!container) return res.status(404).json({ error: '容器不存在' })

    const apiKey = decrypt(container.api_key)
    const extraConfig = container.extra_config ? JSON.parse(container.extra_config) : {}
    const adapter = getAdapter(container.platform_type, apiKey, extraConfig)
    const detail = await adapter.getContainer(container.container_id)

    res.json({ ...container, detail, metadata: container.metadata ? JSON.parse(container.metadata) : null })
  } catch (err) {
    next(err)
  }
})

// 容器操作（restart / stop / start / delete）
async function containerAction(req, res, next, action) {
  try {
    const db = getDb()
    const container = db.prepare(`
      SELECT c.*, p.platform_type, p.api_key, p.extra_config
      FROM containers c JOIN platforms p ON c.platform_id = p.id
      WHERE c.id = ? AND p.user_id = ?
    `).get(req.params.id, req.user.id)
    if (!container) return res.status(404).json({ error: '容器不存在' })

    const apiKey = decrypt(container.api_key)
    const extraConfig = container.extra_config ? JSON.parse(container.extra_config) : {}
    const adapter = getAdapter(container.platform_type, apiKey, extraConfig)
    const result = await adapter[action](container.container_id)

    // 操作成功后同步数据库状态
    const statusMap = {
      stopContainer: 'stopped',
      restartContainer: 'running',
      startContainer: 'running'
    }
    if (statusMap[action]) {
      db.prepare('UPDATE containers SET status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?')
        .run(statusMap[action], container.id)
    }

    logger.info(`容器操作: ${action}`, { containerId: container.id, userId: req.user.id })
    res.json({ success: true, result })
  } catch (err) {
    next(err)
  }
}

router.post('/:id/start', (req, res, next) => containerAction(req, res, next, 'startContainer'))
router.post('/:id/restart', (req, res, next) => containerAction(req, res, next, 'restartContainer'))
router.post('/:id/stop', (req, res, next) => containerAction(req, res, next, 'stopContainer'))
router.delete('/:id', (req, res, next) => containerAction(req, res, next, 'deleteContainer'))

// 获取容器日志
router.get('/:id/logs', async (req, res, next) => {
  try {
    const db = getDb()
    const container = db.prepare(`
      SELECT c.*, p.platform_type, p.api_key, p.extra_config
      FROM containers c JOIN platforms p ON c.platform_id = p.id
      WHERE c.id = ? AND p.user_id = ?
    `).get(req.params.id, req.user.id)
    if (!container) return res.status(404).json({ error: '容器不存在' })

    const apiKey = decrypt(container.api_key)
    const extraConfig = container.extra_config ? JSON.parse(container.extra_config) : {}
    const adapter = getAdapter(container.platform_type, apiKey, extraConfig)
    const logs = await adapter.getContainerLogs(container.container_id, {
      lines: req.query.lines || 100
    })

    res.json({ logs })
  } catch (err) {
    next(err)
  }
})

// 批量操作
router.post('/batch', async (req, res, next) => {
  try {
    const { ids, action } = req.body
    const validActions = ['restart', 'stop', 'delete']
    if (!validActions.includes(action) || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '参数错误' })
    }

    const results = []
    const db = getDb()
    const methodMap = { restart: 'restartContainer', stop: 'stopContainer', delete: 'deleteContainer' }
    const statusMap = { restart: 'running', stop: 'stopped' }

    for (const id of ids) {
      try {
        const container = db.prepare(`
          SELECT c.*, p.platform_type, p.api_key, p.extra_config
          FROM containers c JOIN platforms p ON c.platform_id = p.id
          WHERE c.id = ? AND p.user_id = ?
        `).get(id, req.user.id)
        if (!container) { results.push({ id, success: false, error: '不存在' }); continue }

        const apiKey = decrypt(container.api_key)
        const extraConfig = container.extra_config ? JSON.parse(container.extra_config) : {}
        const adapter = getAdapter(container.platform_type, apiKey, extraConfig)
        await adapter[methodMap[action]](container.container_id)

        if (statusMap[action]) {
          db.prepare('UPDATE containers SET status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?')
            .run(statusMap[action], id)
        }

        results.push({ id, success: true })
      } catch (err) {
        results.push({ id, success: false, error: err.message })
      }
    }

    res.json({ results })
  } catch (err) {
    next(err)
  }
})

export default router
