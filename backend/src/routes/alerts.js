import express from 'express'
import { getDb } from '../config/database.js'
import { authMiddleware } from '../middleware/auth.js'

const router = express.Router()
router.use(authMiddleware)

// 获取告警列表
router.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    const { page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    const alerts = await db.all(`
      SELECT a.*, c.container_name, p.platform_type, p.name as platform_name
      FROM alerts a
      JOIN containers c ON a.container_id = c.id
      JOIN platforms p ON c.platform_id = p.id
      WHERE p.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, Number(limit), Number(offset)])

    const countRow = await db.get(`
      SELECT COUNT(*) as count FROM alerts a
      JOIN containers c ON a.container_id = c.id
      JOIN platforms p ON c.platform_id = p.id
      WHERE p.user_id = ?
    `, [req.user.id])
    const total = countRow?.count ?? 0

    res.json({ alerts, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    next(err)
  }
})

// 获取告警配置列表
router.get('/configs', async (req, res, next) => {
  try {
    const db = getDb()
    const configs = await db.all('SELECT * FROM alert_configs WHERE user_id = ?', [req.user.id])
    res.json(configs.map(c => ({ ...c, config: JSON.parse(c.config) })))
  } catch (err) {
    next(err)
  }
})

// 添加告警配置
router.post('/configs', async (req, res, next) => {
  try {
    const { notification_type, config } = req.body
    const validTypes = ['email', 'webhook']
    if (!validTypes.includes(notification_type) || !config) {
      return res.status(400).json({ error: '参数错误' })
    }

    const db = getDb()
    const result = await db.run(
      'INSERT INTO alert_configs (user_id, notification_type, config) VALUES (?, ?, ?)',
      [req.user.id, notification_type, JSON.stringify(config)]
    )

    res.status(201).json({ id: result.lastInsertRowid, notification_type, config, enabled: 1 })
  } catch (err) {
    next(err)
  }
})

// 更新告警配置
router.put('/configs/:id', async (req, res, next) => {
  try {
    const { config, enabled } = req.body
    const db = getDb()
    const existing = await db.get('SELECT * FROM alert_configs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!existing) return res.status(404).json({ error: '配置不存在' })

    const newConfig = config ? JSON.stringify(config) : existing.config
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled
    await db.run('UPDATE alert_configs SET config = ?, enabled = ? WHERE id = ?', [newConfig, newEnabled, existing.id])

    res.json({ id: existing.id, notification_type: existing.notification_type, config: JSON.parse(newConfig), enabled: newEnabled })
  } catch (err) {
    next(err)
  }
})

// 删除告警配置
router.delete('/configs/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const existing = await db.get('SELECT id FROM alert_configs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!existing) return res.status(404).json({ error: '配置不存在' })

    await db.run('DELETE FROM alert_configs WHERE id = ?', [existing.id])
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

export default router
