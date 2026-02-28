import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { initDb } from './config/initDb.js'
import { errorHandler } from './middleware/errorHandler.js'
import logger from './utils/logger.js'
import { monitorService } from './services/monitorService.js'
import { watchService } from './services/watchService.js'

import authRoutes from './routes/auth.js'
import platformRoutes from './routes/platforms.js'
import containerRoutes from './routes/containers.js'
import alertRoutes from './routes/alerts.js'
import watchRoutes from './routes/watch.js'
import statusRoutes from './routes/status.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 确保 logs 目录存在
const logsDir = path.join(__dirname, '../logs')
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })

// 初始化数据库
initDb()

// 确保 JWT_SECRET 存在
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'cloud-monitor-default-secret-change-me'
  logger.warn('未设置 JWT_SECRET 环境变量，使用默认值，请在生产环境中配置')
}

const app = express()

// 信任反向代理（nginx / docker）
app.set('trust proxy', 1)

// 基础中间件
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())

// 请求日志
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`)
  next()
})

// 登录限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '请求过于频繁，请 15 分钟后再试' }
})

// 路由
app.use('/api/status', statusRoutes)
app.use('/api/auth', loginLimiter, authRoutes)
app.use('/api/platforms', platformRoutes)
app.use('/api/containers', containerRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/watch', watchRoutes)

// 健康检查
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// 错误处理
app.use(errorHandler)

// 定时监控任务（每 5 分钟）
cron.schedule('*/5 * * * *', async () => {
  logger.info('开始定时监控检查')
  await monitorService.checkAllContainers()
})

// 加载用户自定义定时监测任务
watchService.loadAll()

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  logger.info(`服务器已启动，端口: ${PORT}`)
})
