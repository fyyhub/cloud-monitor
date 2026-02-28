import express from 'express'
import { getDb } from '../config/database.js'

const router = express.Router()

// 公开接口：获取所有容器状态（无需登录）
router.get('/', (req, res) => {
  const db = getDb()
  const containers = db.prepare(`
    SELECT c.container_name, c.status, c.metadata, c.last_check,
           p.platform_type, p.name as platform_name
    FROM containers c
    JOIN platforms p ON c.platform_id = p.id
    WHERE p.enabled = 1
    ORDER BY c.status ASC, c.container_name ASC
  `).all()

  res.json(containers.map(c => ({
    container_name: c.container_name,
    status: c.status,
    platform_type: c.platform_type,
    platform_name: c.platform_name,
    last_check: c.last_check,
    domains: extractDomains(c.metadata)
  })))
})

function extractDomains(metadataStr) {
  if (!metadataStr) return []
  try {
    const meta = JSON.parse(metadataStr)
    const raw = meta.domains || meta.domain || meta.bindings || meta.urls || []
    if (typeof raw === 'string') return [raw]
    if (Array.isArray(raw)) return raw
  } catch {}
  return []
}

export default router
