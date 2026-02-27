import axios from 'axios'
import { BasePlatformAdapter } from './BaseAdapter.js'

const GRAPHQL_URL = 'https://api.zeabur.com/graphql'

export class ZeaburAdapter extends BasePlatformAdapter {
  constructor(apiKey) {
    super(apiKey)
    this.client = axios.create({
      baseURL: GRAPHQL_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    })
  }

  async _query(query, variables = {}) {
    const res = await this.client.post('', { query, variables })
    if (res.data.errors) {
      throw new Error(res.data.errors[0].message)
    }
    return res.data.data
  }

  async testConnection() {
    await this._query(`query { me { username } }`)
  }

  // 获取项目列表及其默认环境ID
  async _getProjectsWithEnv() {
    const data = await this._query(`
      query {
        projects(limit: 100) {
          edges {
            node {
              _id
              name
              environments {
                _id
                name
              }
            }
          }
        }
      }
    `)
    return data.projects?.edges || []
  }

  async listContainers() {
    const projectEdges = await this._getProjectsWithEnv()
    const containers = []

    for (const projectEdge of projectEdges) {
      const project = projectEdge.node
      const envId = project.environments?.[0]?._id
      if (!envId) continue

      // 按项目查询服务列表
      const svcData = await this._query(`
        query($projectID: ObjectID!, $environmentID: ObjectID!) {
          services(projectID: $projectID, limit: 100) {
            edges {
              node {
                _id
                name
                status(environmentID: $environmentID)
                domains(environmentID: $environmentID) {
                  domain
                }
              }
            }
          }
        }
      `, { projectID: project._id, environmentID: envId })

      for (const svcEdge of svcData.services?.edges || []) {
        const svc = svcEdge.node
        containers.push({
          id: `${svc._id}:${envId}`,  // 复合ID，供后续操作拆分使用
          name: svc.name,
          status: this._normalizeStatus(svc.status),
          metadata: {
            projectId: project._id,
            projectName: project.name,
            environmentId: envId,
            domains: (svc.domains || []).map(d => d.domain)
          }
        })
      }
    }
    return containers
  }

  async getContainer(serviceId) {
    // serviceId 格式: "serviceId:environmentId"（由 listContainers metadata 传入）
    const [svcId, envId] = serviceId.split(':')
    const data = await this._query(`
      query($id: ObjectID!, $environmentID: ObjectID!) {
        service(_id: $id) {
          _id
          name
          status(environmentID: $environmentID)
        }
      }
    `, { id: svcId, environmentID: envId })
    const svc = data.service
    return { id: svc._id, name: svc.name, status: this._normalizeStatus(svc.status) }
  }

  async restartContainer(serviceId) {
    const [svcId, envId] = serviceId.split(':')
    await this._query(`
      mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
        restartService(serviceID: $serviceID, environmentID: $environmentID)
      }
    `, { serviceID: svcId, environmentID: envId })
    return { success: true }
  }

  async stopContainer(serviceId) {
    const [svcId, envId] = serviceId.split(':')
    await this._query(`
      mutation($serviceID: ObjectID!, $environmentID: ObjectID!) {
        suspendService(serviceID: $serviceID, environmentID: $environmentID)
      }
    `, { serviceID: svcId, environmentID: envId })
    return { success: true }
  }

  async startContainer(serviceId) {
    // Zeabur 无独立的 resume 接口，用 restartService 恢复已暂停的服务
    return this.restartContainer(serviceId)
  }

  async deleteContainer(serviceId) {
    const [svcId, envId] = serviceId.split(':')
    await this._query(`
      mutation($id: ObjectID!, $environmentID: ObjectID!) {
        deleteService(_id: $id, environmentID: $environmentID)
      }
    `, { id: svcId, environmentID: envId })
    return { success: true }
  }

  async getContainerLogs(serviceId, { lines = 100 } = {}) {
    const [svcId, envId] = serviceId.split(':')
    // 先取 projectId（存在 metadata 里，这里通过查询服务所属项目获取）
    const svcData = await this._query(`
      query($id: ObjectID!) {
        service(_id: $id) { project { _id } }
      }
    `, { id: svcId })
    const projectId = svcData.service?.project?._id
    const data = await this._query(`
      query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!) {
        runtimeLogs(projectID: $projectID, serviceID: $serviceID, environmentID: $environmentID) {
          timestamp
          message
        }
      }
    `, { projectID: projectId, serviceID: svcId, environmentID: envId })
    return (data.runtimeLogs || []).slice(-lines)
  }

  _normalizeStatus(status) {
    const map = {
      RUNNING: 'running',
      STOPPED: 'stopped',
      DEPLOYING: 'deploying',
      SUSPENDED: 'stopped',
      ERROR: 'error'
    }
    return map[status] || status?.toLowerCase() || 'unknown'
  }
}
