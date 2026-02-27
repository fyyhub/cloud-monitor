/**
 * 平台适配器基类，定义统一接口
 */
export class BasePlatformAdapter {
  constructor(apiKey, extraConfig = {}) {
    this.apiKey = apiKey
    this.extraConfig = extraConfig
  }

  async listContainers() { throw new Error('未实现') }
  async getContainer(containerId) { throw new Error('未实现') }
  async startContainer(containerId) { throw new Error('未实现') }
  async restartContainer(containerId) { throw new Error('未实现') }
  async stopContainer(containerId) { throw new Error('未实现') }
  async deleteContainer(containerId) { throw new Error('未实现') }
  async getContainerLogs(containerId, options) { throw new Error('未实现') }
  async testConnection() { throw new Error('未实现') }
}
