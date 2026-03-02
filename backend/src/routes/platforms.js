import express from 'express'
import { getDb } from '../config/database.js'
import { authMiddleware } from '../middleware/auth.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { getAdapter } from '../services/platformAdapters/index.js'
import logger from '../utils/logger.js'

const router = express.Router()
router.use(authMiddleware)

// 获取平台列表
router.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    const platforms = await db.all(
      'SELECT id, platform_type, name, enabled, extra_config, created_at FROM platforms WHERE user_id = ?',
      [req.user.id]
    )
    res.json(platforms.map(p => ({
      ...p,
      extra_config: p.extra_config ? JSON.parse(p.extra_config) : null
    })))
  } catch (err) {
    next(err)
  }
})

// 添加平台
router.post('/', async (req, res, next) => {
  try {
    const { platform_type, name, api_key, extra_config } = req.body
    if (!platform_type || !name || !api_key) {
      return res.status(400).json({ error: 'platform_type、name、api_key 均为必填项' })
    }

    const validTypes = ['zeabur', 'render', 'koyeb', 'vercel']
    if (!validTypes.includes(platform_type)) {
      return res.status(400).json({ error: '不支持的平台类型' })
    }

    const db = getDb()
    const encryptedKey = encrypt(api_key)
    const extraConfigStr = extra_config ? JSON.stringify(extra_config) : null
    const result = await db.run(
      'INSERT INTO platforms (user_id, platform_type, name, api_key, extra_config) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, platform_type, name, encryptedKey, extraConfigStr]
    )

    logger.info('添加平台配置', { userId: req.user.id, platform_type, name })
    res.status(201).json({ id: result.lastInsertRowid, platform_type, name, enabled: 1 })
  } catch (err) {
    next(err)
  }
})

// 更新平台配置
router.put('/:id', async (req, res, next) => {
  try {
    const { name, api_key, enabled, extra_config } = req.body
    const db = getDb()
    const platform = await db.get('SELECT * FROM platforms WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!platform) return res.status(404).json({ error: '平台不存在' })

    const newName = name ?? platform.name
    const newKey = api_key ? encrypt(api_key) : platform.api_key
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : platform.enabled
    const newExtraConfig = extra_config !== undefined ? (extra_config ? JSON.stringify(extra_config) : null) : platform.extra_config

    await db.run('UPDATE platforms SET name = ?, api_key = ?, enabled = ?, extra_config = ? WHERE id = ?',
      [newName, newKey, newEnabled, newExtraConfig, platform.id])

    res.json({ id: platform.id, platform_type: platform.platform_type, name: newName, enabled: newEnabled })
  } catch (err) {
    next(err)
  }
})

// 删除平台
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const platform = await db.get('SELECT id FROM platforms WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!platform) return res.status(404).json({ error: '平台不存在' })

    await db.run('DELETE FROM platforms WHERE id = ?', [platform.id])
    logger.info('删除平台配置', { platformId: platform.id, userId: req.user.id })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// 查看平台明文 API Key
router.get('/:id/apikey', async (req, res, next) => {
  try {
    const db = getDb()
    const platform = await db.get('SELECT * FROM platforms WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!platform) return res.status(404).json({ error: '平台不存在' })
    res.json({ api_key: decrypt(platform.api_key) })
  } catch (err) {
    next(err)
  }
})

// 测试平台连接
router.get('/:id/test', async (req, res, next) => {
  try {
    const db = getDb()
    const platform = await db.get('SELECT * FROM platforms WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!platform) return res.status(404).json({ error: '平台不存在' })

    const apiKey = decrypt(platform.api_key)
    const extraConfig = platform.extra_config ? JSON.parse(platform.extra_config) : {}
    const adapter = getAdapter(platform.platform_type, apiKey, extraConfig)
    await adapter.testConnection()

    res.json({ success: true, message: '连接成功' })
  } catch (err) {
    res.json({ success: false, message: err.message })
  }
})

export default router
