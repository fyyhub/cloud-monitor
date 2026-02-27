import logger from '../utils/logger.js'

export function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method })

  const status = err.status || 500
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? '服务器内部错误'
    : err.message

  res.status(status).json({ error: message })
}
