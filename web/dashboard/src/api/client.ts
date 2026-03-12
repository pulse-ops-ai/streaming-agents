import {
  AssetDetailResponseSchema,
  AssetHistoryResponseSchema,
  FleetOverviewResponseSchema,
  IncidentsResponseSchema,
} from '@streaming-agents/domain-models'
import type {
  AssetDetailResponse,
  AssetHistoryResponse,
  FleetOverviewResponse,
  IncidentsResponse,
  RecentConversationItem,
} from '@streaming-agents/domain-models'

const BASE = '/api'

async function get<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `API error: ${res.status}`)
  }
  const json = await res.json()
  return schema.parse(json)
}

export function fetchFleetOverview(): Promise<FleetOverviewResponse> {
  return get('/fleet', FleetOverviewResponseSchema)
}

export function fetchAssetDetail(assetId: string): Promise<AssetDetailResponse> {
  return get(`/assets/${encodeURIComponent(assetId)}`, AssetDetailResponseSchema)
}

export function fetchAssetHistory(assetId: string, minutes = 5): Promise<AssetHistoryResponse> {
  return get(
    `/assets/${encodeURIComponent(assetId)}/history?minutes=${minutes}`,
    AssetHistoryResponseSchema
  )
}

export function fetchActiveIncidents(): Promise<IncidentsResponse> {
  return get('/incidents/active', IncidentsResponseSchema)
}

// ── Admin API ───────────────────────────────────────────

async function post(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `API error: ${res.status}`)
  }
  return res.json()
}

async function postJson(
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? `API error: ${res.status}`)
  }
  return res.json()
}

export function runSimulator(): Promise<Record<string, unknown>> {
  return post('/admin/simulator/run')
}

export function enableCron(): Promise<Record<string, unknown>> {
  return post('/admin/cron/enable')
}

export function disableCron(): Promise<Record<string, unknown>> {
  return post('/admin/cron/disable')
}

export async function fetchCronStatus(): Promise<{ state: string }> {
  const res = await fetch(`${BASE}/admin/cron/status`)
  if (!res.ok) throw new Error('Failed to fetch cron status')
  return res.json()
}

export function resetBaselines(assetId: string): Promise<Record<string, unknown>> {
  return post(`/admin/baselines/reset/${encodeURIComponent(assetId)}`)
}

export async function fetchRecentConversations(): Promise<{
  conversations: RecentConversationItem[]
}> {
  const res = await fetch(`${BASE}/conversations/recent?limit=10`)
  if (!res.ok) return { conversations: [] }
  return res.json()
}

// ── Demo Fleet ──────────────────────────────────────────

export interface DemoFleetAsset {
  asset_id: string
  scenario: string
  source: string
  intended_state: string
}

export async function fetchDemoFleetManifest(): Promise<{
  fleet: DemoFleetAsset[]
  scenarios: string[]
}> {
  const res = await fetch(`${BASE}/admin/demo/fleet`)
  if (!res.ok) throw new Error('Failed to fetch demo fleet manifest')
  return res.json()
}

export function bootstrapDemoFleet(): Promise<Record<string, unknown>> {
  return post('/admin/demo/bootstrap')
}

export interface DemoReadinessAsset {
  asset_id: string
  intended_state: string
  actual_state: string | null
  match: boolean
  has_data: boolean
}

export interface DemoReadiness {
  ready: boolean
  checked_at: string
  assets: DemoReadinessAsset[]
  incident_count: number
}

export async function fetchDemoReadiness(): Promise<DemoReadiness> {
  const res = await fetch(`${BASE}/admin/demo/readiness`)
  if (!res.ok) throw new Error('Failed to fetch demo readiness')
  return res.json()
}

export function runScenario(
  assetId: string,
  scenario: string,
  burstCount = 240
): Promise<Record<string, unknown>> {
  return postJson('/admin/demo/run-scenario', {
    asset_id: assetId,
    scenario,
    burst_count: burstCount,
  })
}

// ── Cleanup ─────────────────────────────────────────────

export function clearIncidents(assetId: string): Promise<Record<string, unknown>> {
  return post(`/admin/incidents/clear/${encodeURIComponent(assetId)}`)
}

export function clearDemoIncidents(): Promise<Record<string, unknown>> {
  return post('/admin/incidents/clear-demo')
}

export function clearHistory(assetId: string): Promise<Record<string, unknown>> {
  return post(`/admin/history/clear/${encodeURIComponent(assetId)}`)
}

export function clearDemoHistory(): Promise<Record<string, unknown>> {
  return post('/admin/history/clear-demo')
}
