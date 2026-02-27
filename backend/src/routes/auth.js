import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getDb } from '../config/database.js'
import logger from '../utils/logger.js'
import { authMiddleware } from '../middleware/auth.js'

const router = express.Router()

// 注册
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, email } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    const db = getDb()
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)'
    ).run(username, passwordHash, email || null)

    logger.info('新用户注册', { username })
    res.status(201).json({ id: result.lastInsertRowid, username })
  } catch (err) {
    next(err)
  }
})

// 登录
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    )

    logger.info('用户登录', { username })
    res.json({ token, username: user.username })
  } catch (err) {
    next(err)
  }
})

// 获取当前用户信息
router.get('/profile', authMiddleware, (req, res) => {
  const db = getDb()
  const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.user.id)
  res.json(user)
})

export default router
