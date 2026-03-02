import { getDb } from '../config/database.js'
import { decrypt } from '../utils/crypto.js'
import { getAdapter } from './platformAdapters/index.js'
import { alertService } from './alertService.js'
import logger from '../utils/logger.js'

export const monitorService = {
  async checkAllContainers() {
    const db = getDb()
    // 获取所有用户的所有启用平台
    const platforms = await db.all('SELECT * FROM platforms WHERE enabled = 1', [])

    for (const platform of platforms) {
      try {
        const apiKey = decrypt(platform.api_key)
        const extraConfig = platform.extra_config ? JSON.parse(platform.extra_config) : {}
        const adapter = getAdapter(platform.platform_type, apiKey, extraConfig)
        const remoteContainers = await adapter.listContainers()
        const remoteIds = remoteContainers.map(r => r.id)

        for (const remote of remoteContainers) {
          const existing = await db.get(
            'SELECT * FROM containers WHERE platform_id = ? AND container_id = ?',
            [platform.id, remote.id]
          )

          const prevStatus = existing?.status
          const newStatus = remote.status

          if (existing) {
            await db.run(
              'UPDATE containers SET container_name = ?, status = ?, last_check = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?',
              [remote.name, newStatus, JSON.stringify(remote.metadata || {}), existing.id]
            )

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
            await db.run(
              'INSERT INTO containers (platform_id, container_id, container_name, status, last_check, metadata) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
              [platform.id, remote.id, remote.name, newStatus, JSON.stringify(remote.metadata || {})]
            )
          }
        }

        // 删除远端已不存在的本地容器记录
        const localContainers = await db.all('SELECT id, container_id FROM containers WHERE platform_id = ?', [platform.id])
        for (const row of localContainers) {
          if (!remoteIds.includes(row.container_id)) {
            await db.run('DELETE FROM containers WHERE id = ?', [row.id])
          }
        }

        logger.debug(`平台 ${platform.name} 监控完成，共 ${remoteContainers.length} 个容器`)
      } catch (err) {
        logger.error(`监控平台 ${platform.name} 失败`, { error: err.message })
      }
    }
  }
}
