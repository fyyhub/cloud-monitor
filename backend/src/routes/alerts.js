import express from 'express'
import { getDb } from '../config/database.js'
import { authMiddleware } from '../middleware/auth.js'

const router = express.Router()
router.use(authMiddleware)

// 获取告警列表
router.get('/', (req, res) => {
  const db = getDb()
  const { page = 1, limit = 20 } = req.query
  const offset = (page - 1) * limit

  const alerts = db.prepare(`
    SELECT a.*, c.container_name, p.platform_type, p.name as platform_name
    FROM alerts a
    JOIN containers c ON a.container_id = c.id
    JOIN platforms p ON c.platform_id = p.id
    WHERE p.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, Number(limit), Number(offset))

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM alerts a
    JOIN containers c ON a.container_id = c.id
    JOIN platforms p ON c.platform_id = p.id
    WHERE p.user_id = ?
  `).get(req.user.id).count

  res.json({ alerts, total, page: Number(page), limit: Number(limit) })
})

// 获取告警配置列表
router.get('/configs', (req, res) => {
  const db = getDb()
  const configs = db.prepare('SELECT * FROM alert_configs WHERE user_id = ?').all(req.user.id)
  res.json(configs.map(c => ({ ...c, config: JSON.parse(c.config) })))
})

// 添加告警配置
router.post('/configs', (req, res, next) => {
  try {
    const { notification_type, config } = req.body
    const validTypes = ['email', 'webhook']
    if (!validTypes.includes(notification_type) || !config) {
      return res.status(400).json({ error: '参数错误' })
    }

    const db = getDb()
    const result = db.prepare(
      'INSERT INTO alert_configs (user_id, notification_type, config) VALUES (?, ?, ?)'
    ).run(req.user.id, notification_type, JSON.stringify(config))

    res.status(201).json({ id: result.lastInsertRowid, notification_type, config, enabled: 1 })
  } catch (err) {
    next(err)
  }
})

// 更新告警配置
router.put('/configs/:id', (req, res, next) => {
  try {
    const { config, enabled } = req.body
    const db = getDb()
    const existing = db.prepare('SELECT * FROM alert_configs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) return res.status(404).json({ error: '配置不存在' })

    const newConfig = config ? JSON.stringify(config) : existing.config
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled
    db.prepare('UPDATE alert_configs SET config = ?, enabled = ? WHERE id = ?').run(newConfig, newEnabled, existing.id)

    res.json({ id: existing.id, notification_type: existing.notification_type, config: JSON.parse(newConfig), enabled: newEnabled })
  } catch (err) {
    next(err)
  }
})

// 删除告警配置
router.delete('/configs/:id', (req, res, next) => {
  try {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM alert_configs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) return res.status(404).json({ error: '配置不存在' })

    db.prepare('DELETE FROM alert_configs WHERE id = ?').run(existing.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

export default router
