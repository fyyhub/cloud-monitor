import jwt from 'jsonwebtoken'
import logger from '../utils/logger.js'

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权，缺少 Token' })
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.userId, username: payload.username }
    next()
  } catch (err) {
    logger.warn('Token 验证失败', { error: err.message })
    return res.status(401).json({ error: 'Token 无效或已过期' })
  }
}
