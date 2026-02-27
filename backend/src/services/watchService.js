import cron from 'node-cron'
import { getDb } from '../config/database.js'
import { decrypt } from '../utils/crypto.js'
import { getAdapter } from './platformAdapters/index.js'
import logger from '../utils/logger.js'

// taskId -> node-cron ScheduledTask
const scheduledJobs = new Map()

async function executeWatchTask(taskId) {
  const db = getDb()

  const task = db.prepare('SELECT * FROM watch_tasks WHERE id = ? AND enabled = 1').get(taskId)
  if (!task) return

  // 查询该任务监控的容器（含平台信息以获取 API key）
  const rows = db.prepare(`
    SELECT c.id as container_id, c.container_id as remote_id, c.container_name,
           c.status, c.platform_id,
           p.platform_type, p.api_key, p.extra_config
    FROM watch_task_containers wtc
    JOIN containers c ON wtc.container_id = c.id
    JOIN platforms p ON c.platform_id = p.id
    WHERE wtc.task_id = ?
  `).all(taskId)

  logger.info(`定时监测任务 [${task.name}] 开始，共 ${rows.length} 个容器`)

  for (const row of rows) {
    try {
      const apiKey = decrypt(row.api_key)
      const extraConfig = row.extra_config ? JSON.parse(row.extra_config) : {}
      const adapter = getAdapter(row.platform_type, apiKey, extraConfig)

      // 从平台拉取最新状态
      const detail = await adapter.getContainer(row.remote_id)
      const currentStatus = detail?.status ?? row.status

      // 同步状态到 DB
      db.prepare('UPDATE containers SET status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?')
        .run(currentStatus, row.container_id)

      if (['stopped', 'error'].includes(currentStatus)) {
        logger.warn(`监测任务 [${task.name}]: 容器 "${row.container_name}" 状态为 ${currentStatus}，尝试重启`)
        await adapter.startContainer(row.remote_id)

        db.prepare(
          'INSERT INTO watch_logs (task_id, container_id, action, result, message) VALUES (?, ?, ?, ?, ?)'
        ).run(taskId, row.container_id, 'restart', 'success',
          `容器状态为 ${currentStatus}，已执行重启`)

        logger.info(`监测任务 [${task.name}]: 容器 "${row.container_name}" 重启指令已发送`)
      } else {
        db.prepare(
          'INSERT INTO watch_logs (task_id, container_id, action, result, message) VALUES (?, ?, ?, ?, ?)'
        ).run(taskId, row.container_id, 'check', 'ok',
          `容器状态正常: ${currentStatus}`)
      }
    } catch (err) {
      logger.error(`监测任务 [${task.name}]: 容器 "${row.container_name}" 处理失败`, { error: err.message })
      try {
        db.prepare(
          'INSERT INTO watch_logs (task_id, container_id, action, result, message) VALUES (?, ?, ?, ?, ?)'
        ).run(taskId, row.container_id, 'check', 'error', err.message)
      } catch { /* ignore log write failure */ }
    }
  }
}

export const watchService = {
  // 启动单个任务的 cron 调度
  scheduleTask(task) {
    if (scheduledJobs.has(task.id)) {
      scheduledJobs.get(task.id).stop()
    }
    if (!task.enabled) return
    if (!cron.validate(task.cron_expr)) {
      logger.warn(`监测任务 [${task.name}] cron 表达式无效: ${task.cron_expr}`)
      return
    }

    const job = cron.schedule(task.cron_expr, () => executeWatchTask(task.id))
    scheduledJobs.set(task.id, job)
    logger.info(`监测任务 [${task.name}] 已调度，cron: ${task.cron_expr}`)
  },

  // 停止单个任务
  unscheduleTask(taskId) {
    if (scheduledJobs.has(taskId)) {
      scheduledJobs.get(taskId).stop()
      scheduledJobs.delete(taskId)
    }
  },

  // 应用启动时加载所有已启用任务
  loadAll() {
    const db = getDb()
    const tasks = db.prepare('SELECT * FROM watch_tasks WHERE enabled = 1').all()
    for (const task of tasks) {
      this.scheduleTask(task)
    }
    logger.info(`已加载 ${tasks.length} 个定时监测任务`)
  }
}
