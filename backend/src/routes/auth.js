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
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username])
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const result = await db.run(
      'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
      [username, passwordHash, email || null]
    )

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
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username])
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
    res.json({
      token,
      username: user.username,
      mustChangePassword: !!user.must_change_password
    })
  } catch (err) {
    next(err)
  }
})

// 获取当前用户信息
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb()
    const user = await db.get('SELECT id, username, email, created_at FROM users WHERE id = ?', [req.user.id])
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// 修改密码
router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' })
    }

    const db = getDb()
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id])

    const valid = await bcrypt.compare(oldPassword, user.password_hash)
    if (!valid) {
      return res.status(400).json({ error: '旧密码错误' })
    }

    const newHash = await bcrypt.hash(newPassword, 10)
    await db.run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, req.user.id])

    logger.info('用户修改密码', { username: req.user.username })
    res.json({ message: '密码修改成功' })
  } catch (err) {
    next(err)
  }
})

// 修改用户名
router.post('/change-username', authMiddleware, async (req, res, next) => {
  try {
    const { newUsername, password } = req.body
    if (!newUsername || !password) {
      return res.status(400).json({ error: '新用户名和密码不能为空' })
    }

    const db = getDb()
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id])

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(400).json({ error: '密码错误' })
    }

    const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, req.user.id])
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    await db.run('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newUsername, req.user.id])

    logger.info('用户修改用户名', { oldUsername: user.username, newUsername })
    res.json({ message: '用户名修改成功', username: newUsername })
  } catch (err) {
    next(err)
  }
})

export default router
