import axios from 'axios'
import { BasePlatformAdapter } from './BaseAdapter.js'

const BASE_URL = 'https://api.render.com/v1'

export class RenderAdapter extends BasePlatformAdapter {
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
    await this.client.get('/services?limit=1')
  }

  async listContainers() {
    const res = await this.client.get('/services', { params: { limit: 100 } })
    const services = (res.data || []).map(item => item.service || item)

    const results = await Promise.all(services.map(async svc => {
      let domains = []
      try {
        const dr = await this.client.get(`/services/${svc.id}/custom-domains`)
        const list = dr.data || []
        domains = list
          .map(d => (d.customDomain || d).domainName || (d.customDomain || d).name)
          .filter(Boolean)
      } catch (_) {}

      // 若有自定义域名则用自定义域名，否则回退到 Render 默认域名
      const defaultUrl = svc.serviceDetails?.url
      if (!domains.length && defaultUrl) {
        domains = [defaultUrl.replace(/^https?:\/\//, '')]
      }

      return {
        id: svc.id,
        name: svc.name,
        status: this._normalizeStatus(svc.serviceDetails?.status, svc.suspended),
        metadata: {
          type: svc.type,
          region: svc.serviceDetails?.region,
          url: defaultUrl,
          domains,
          suspended: svc.suspended
        }
      }
    }))

    return results
  }

  async getContainer(serviceId) {
    const [res, dr] = await Promise.allSettled([
      this.client.get(`/services/${serviceId}`),
      this.client.get(`/services/${serviceId}/custom-domains`)
    ])
    const svc = res.value.data
    const list = dr.status === 'fulfilled' ? (dr.value.data || []) : []
    let domains = list
      .map(d => (d.customDomain || d).domainName || (d.customDomain || d).name)
      .filter(Boolean)
    const defaultUrl = svc.serviceDetails?.url
    if (!domains.length && defaultUrl) {
      domains = [defaultUrl.replace(/^https?:\/\//, '')]
    }
    return {
      id: svc.id,
      name: svc.name,
      status: this._normalizeStatus(svc.serviceDetails?.status, svc.suspended),
      metadata: { type: svc.type, url: defaultUrl, domains }
    }
  }

  async restartContainer(serviceId) {
    await this.client.post(`/services/${serviceId}/restart`)
    return { success: true }
  }

  async stopContainer(serviceId) {
    await this.client.post(`/services/${serviceId}/suspend`)
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
    const res = await this.client.get('/logs', {
      params: {
        'resourceIds[]': serviceId,
        limit: lines,
        direction: 'backward'
      }
    })
    return res.data?.logs || []
  }

  _normalizeStatus(detailStatus, suspended) {
    // 优先使用 serviceDetails.status（更精确）
    if (detailStatus) {
      const map = {
        live: 'running',
        build_failed: 'error',
        suspended: 'stopped',
        not_found: 'error',
        deactivated: 'stopped',
        unknown: 'unknown'
      }
      return map[detailStatus] || 'unknown'
    }
    // 回退到顶层 suspended 字段
    if (suspended === 'suspended') return 'stopped'
    if (suspended === 'not_suspended') return 'running'
    return 'unknown'
  }
}
