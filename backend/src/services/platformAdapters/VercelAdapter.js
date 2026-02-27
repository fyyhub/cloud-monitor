import axios from 'axios'
import { BasePlatformAdapter } from './BaseAdapter.js'

const BASE_URL = 'https://api.vercel.com'

export class VercelAdapter extends BasePlatformAdapter {
  constructor(apiKey, extraConfig = {}) {
    super(apiKey, extraConfig)
    this.teamId = extraConfig.teamId || null
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 15000
    })
  }

  // 拼装带 teamId 的 params
  _params(extra = {}) {
    return this.teamId ? { teamId: this.teamId, ...extra } : extra
  }

  async testConnection() {
    await this.client.get('/v2/user')
  }

  // Vercel 以项目+最新部署为容器概念
  async listContainers() {
    const res = await this.client.get('/v9/projects', { params: this._params() })
    const projects = res.data?.projects || []

    const containers = []
    for (const project of projects) {
      try {
        const depRes = await this.client.get('/v6/deployments', {
          params: this._params({ projectId: project.id, limit: 1, target: 'production' })
        })
        const latest = depRes.data?.deployments?.[0]
        let aliases = []
        try {
          const domainRes = await this.client.get(`/v9/projects/${project.id}/domains`, { params: this._params() })
          aliases = (domainRes.data?.domains || []).map(d => d.name).filter(Boolean)
        } catch { /* 获取域名失败不影响主流程 */ }
        containers.push({
          id: project.id,
          name: project.name,
          status: latest ? this._normalizeStatus(latest.readyState) : 'unknown',
          metadata: {
            latestDeploymentId: latest?.uid,
            url: latest?.url ? `https://${latest.url}` : null,
            framework: project.framework,
            domains: aliases
          }
        })
      } catch {
        containers.push({
          id: project.id,
          name: project.name,
          status: 'unknown',
          metadata: { framework: project.framework }
        })
      }
    }
    return containers
  }

  async getContainer(projectId) {
    const res = await this.client.get(`/v9/projects/${projectId}`, { params: this._params() })
    const project = res.data
    // 获取最新部署状态
    try {
      const depRes = await this.client.get('/v6/deployments', {
        params: this._params({ projectId, limit: 1, target: 'production' })
      })
      const latest = depRes.data?.deployments?.[0]
      let aliases = []
      try {
        const domainRes = await this.client.get(`/v9/projects/${projectId}/domains`, { params: this._params() })
        aliases = (domainRes.data?.domains || []).map(d => d.name).filter(Boolean)
      } catch { /* ignore */ }
      return {
        id: project.id,
        name: project.name,
        status: latest ? this._normalizeStatus(latest.readyState) : 'unknown',
        metadata: { framework: project.framework, url: latest?.url ? `https://${latest.url}` : null, domains: aliases }
      }
    } catch {
      return { id: project.id, name: project.name, status: 'unknown', metadata: { framework: project.framework, domains: [] } }
    }
  }

  // Vercel 重启 = 用 deploymentId 触发重新部署
  async restartContainer(projectId) {
    const depRes = await this.client.get('/v6/deployments', {
      params: this._params({ projectId, limit: 1 })
    })
    const latest = depRes.data?.deployments?.[0]
    if (!latest) throw new Error('未找到可重新部署的版本')

    await this.client.post(`/v13/deployments?forceNew=1${this.teamId ? `&teamId=${this.teamId}` : ''}`, {
      name: latest.name,
      deploymentId: latest.uid
    })
    return { success: true }
  }

  // Vercel 停止 = 取消当前正在构建的部署（只能取消 building 状态）
  async stopContainer(projectId) {
    const depRes = await this.client.get('/v6/deployments', {
      params: this._params({ projectId, limit: 1, state: 'BUILDING' })
    })
    const latest = depRes.data?.deployments?.[0]
    if (!latest) throw new Error('没有正在构建的部署可以取消')

    await this.client.patch(`/v12/deployments/${latest.uid}/cancel${this.teamId ? `?teamId=${this.teamId}` : ''}`)
    return { success: true }
  }

  // Vercel 启动 = 重新触发最新部署
  async startContainer(projectId) {
    return this.restartContainer(projectId)
  }

  async deleteContainer(projectId) {
    await this.client.delete(`/v9/projects/${projectId}`, { params: this._params() })
    return { success: true }
  }

  async getContainerLogs(projectId, { lines = 100 } = {}) {
    const depRes = await this.client.get('/v6/deployments', {
      params: this._params({ projectId, limit: 1 })
    })
    const latest = depRes.data?.deployments?.[0]
    if (!latest) return []

    const logRes = await this.client.get(`/v2/deployments/${latest.uid}/events`, {
      params: { direction: 'backward', builds: 1 }
    })
    const events = logRes.data || []
    return events.slice(-lines)
  }

  _normalizeStatus(readyState) {
    const map = {
      READY: 'running',
      ERROR: 'error',
      BUILDING: 'deploying',
      INITIALIZING: 'deploying',
      QUEUED: 'deploying',
      CANCELED: 'stopped'
    }
    return map[readyState] || readyState?.toLowerCase() || 'unknown'
  }
}
