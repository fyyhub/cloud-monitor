import nodemailer from 'nodemailer'
import { getDb } from '../config/database.js'
import logger from '../utils/logger.js'

export const alertService = {
  async triggerAlert({ containerId, alertType, message, userId }) {
    const db = getDb()

    // 写入告警记录
    const result = db.prepare(
      'INSERT INTO alerts (container_id, alert_type, message) VALUES (?, ?, ?)'
    ).run(containerId, alertType, message)

    logger.warn('触发告警', { containerId, alertType, message })

    // 获取该用户的告警配置
    const configs = db.prepare(
      'SELECT * FROM alert_configs WHERE user_id = ? AND enabled = 1'
    ).all(userId)

    for (const cfg of configs) {
      const config = JSON.parse(cfg.config)
      try {
        if (cfg.notification_type === 'email') {
          await this._sendEmail(config, message)
        } else if (cfg.notification_type === 'webhook') {
          await this._sendWebhook(config, { alertType, message, containerId })
        }
        db.prepare('UPDATE alerts SET notified = 1 WHERE id = ?').run(result.lastInsertRowid)
      } catch (err) {
        logger.error('发送告警通知失败', { type: cfg.notification_type, error: err.message })
      }
    }
  },

  async _sendEmail(config, message) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: config.email,
      subject: '[云容器监控] 容器状态告警',
      text: message
    })

    logger.info('邮件告警已发送', { to: config.email })
  },

  async _sendWebhook(config, payload) {
    const { default: axios } = await import('axios')
    await axios.post(config.url, payload, { timeout: 10000 })
    logger.info('Webhook 告警已发送', { url: config.url })
  }
}
