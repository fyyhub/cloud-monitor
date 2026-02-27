import { ZeaburAdapter } from './ZeaburAdapter.js'
import { RenderAdapter } from './RenderAdapter.js'
import { KoyebAdapter } from './KoyebAdapter.js'
import { VercelAdapter } from './VercelAdapter.js'

const ADAPTERS = {
  zeabur: ZeaburAdapter,
  render: RenderAdapter,
  koyeb: KoyebAdapter,
  vercel: VercelAdapter
}

export function getAdapter(platformType, apiKey, extraConfig = {}) {
  const AdapterClass = ADAPTERS[platformType]
  if (!AdapterClass) throw new Error(`不支持的平台类型: ${platformType}`)
  return new AdapterClass(apiKey, extraConfig)
}
