import axios from 'axios'
import { BasePlatformAdapter } from './BaseAdapter.js'

const BASE_URL = 'https://app.koyeb.com/v1'

export class KoyebAdapter extends BasePlatformAdapter {
  constructor(apiKey) {
    super(apiKey)
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 15000
    })
  }

  async testConnection() {
    await this.client.get('/services', { params: { limit: '1' } })
  }

  async listContainers() {
    const res = await this.client.get('/services', { params: { limit: '100' } })
    const services = res.data?.services || []

    // 收集所有不重复的 app_id，批量查域名
    const appIds = [...new Set(services.map(s => s.app_id).filter(Boolean))]
    const domainMap = {}
    await Promise.all(appIds.map(async (appId) => {
      try {
        const dr = await this.client.get('/domains', { params: { app_id: appId, limit: '50' } })
        domainMap[appId] = (dr.data?.domains || [])
          .filter(d => d.status === 'ACTIVE')
          .map(d => d.name)
      } catch {
        domainMap[appId] = []
      }
    }))

    return services.map(svc => ({
      id: svc.id,
      name: svc.name,
      status: this._normalizeStatus(svc.status),
      metadata: {
        app_id: svc.app_id,
        created_at: svc.created_at,
        domains: domainMap[svc.app_id] || []
      }
    }))
  }

  async getContainer(serviceId) {
    const res = await this.client.get(`/services/${serviceId}`)
    const svc = res.data?.service
    return {
      id: svc.id,
      name: svc.name,
      status: this._normalizeStatus(svc.status),
      metadata: { app_id: svc.app_id }
    }
  }

  async restartContainer(serviceId) {
    await this.client.post(`/services/${serviceId}/redeploy`)
    return { success: true }
  }

  async stopContainer(serviceId) {
    await this.client.post(`/services/${serviceId}/pause`)
    return { success: true }
  }

  async startContainer(serviceId) {
    await this.client.post(`/services/${serviceId}/resume`)
    return { success: true }
  }

  async deleteContainer(serviceId) {
    await this.client.delete(`/services/${serviceId}`)
    return { success: true }
  }

  async getContainerLogs(serviceId, { lines = 100 } = {}) {
    const res = await this.client.get('/streams/logs/query', {
      params: {
        service_id: serviceId,
        type: 'runtime',
        limit: lines
      },
      timeout: 15000
    })
    return (res.data?.data || []).map(entry => ({
      timestamp: entry.created_at,
      message: entry.msg,
      stream: entry.labels?.stream
    }))
  }

  _normalizeStatus(status) {
    const map = {
      STARTING: 'deploying',
      HEALTHY: 'running',
      DEGRADED: 'error',
      UNHEALTHY: 'error',
      PAUSING: 'stopped',
      PAUSED: 'stopped',
      RESUMING: 'deploying',
      UPDATING: 'deploying',
      DELETING: 'stopped',
      DELETED: 'stopped',
      ERROR: 'error'
    }
    return map[status] || status?.toLowerCase() || 'unknown'
  }
}
