import { getDb } from '../config/database.js'
import { decrypt } from '../utils/crypto.js'
import { getAdapter } from './platformAdapters/index.js'
import { alertService } from './alertService.js'
import logger from '../utils/logger.js'

export const monitorService = {
  async checkAllContainers() {
    const db = getDb()
    // 获取所有用户的所有启用平台
    const platforms = db.prepare('SELECT * FROM platforms WHERE enabled = 1').all()

    for (const platform of platforms) {
      try {
        const apiKey = decrypt(platform.api_key)
        const extraConfig = platform.extra_config ? JSON.parse(platform.extra_config) : {}
        const adapter = getAdapter(platform.platform_type, apiKey, extraConfig)
        const remoteContainers = await adapter.listContainers()
        const remoteIds = remoteContainers.map(r => r.id)

        for (const remote of remoteContainers) {
          const existing = db.prepare(
            'SELECT * FROM containers WHERE platform_id = ? AND container_id = ?'
          ).get(platform.id, remote.id)

          const prevStatus = existing?.status
          const newStatus = remote.status

          if (existing) {
            db.prepare(
              'UPDATE containers SET container_name = ?, status = ?, last_check = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?'
            ).run(remote.name, newStatus, JSON.stringify(remote.metadata || {}), existing.id)

            // 状态变化且变为异常时触发告警
            if (prevStatus !== newStatus && ['error', 'stopped'].includes(newStatus)) {
              await alertService.triggerAlert({
                containerId: existing.id,
                alertType: 'status_change',
                message: `容器 "${remote.name}" 状态从 ${prevStatus} 变为 ${newStatus}`,
                userId: platform.user_id
              })
            }
          } else {
            db.prepare(
              'INSERT INTO containers (platform_id, container_id, container_name, status, last_check, metadata) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)'
            ).run(platform.id, remote.id, remote.name, newStatus, JSON.stringify(remote.metadata || {}))
          }
        }

        // 删除远端已不存在的本地容器记录
        const localContainers = db.prepare('SELECT id, container_id FROM containers WHERE platform_id = ?').all(platform.id)
        for (const row of localContainers) {
          if (!remoteIds.includes(row.container_id)) {
            db.prepare('DELETE FROM containers WHERE id = ?').run(row.id)
          }
        }

        logger.debug(`平台 ${platform.name} 监控完成，共 ${remoteContainers.length} 个容器`)
      } catch (err) {
        logger.error(`监控平台 ${platform.name} 失败`, { error: err.message })
      }
    }
  }
}
