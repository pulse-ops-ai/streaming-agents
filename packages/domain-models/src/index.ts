// Domain models — shared Zod schemas + inferred types for Dashboard API + React frontend

// --- Common ---
export {
  RiskStateSchema,
  SeveritySchema,
  IncidentStatusSchema,
  ErrorResponseSchema,
} from './common.js'
export type { RiskState, Severity, IncidentStatus, ErrorResponse } from './common.js'

// --- Fleet Overview ---
export {
  SignalValuesSchema,
  FleetAssetCardSchema,
  FleetOverviewResponseSchema,
} from './fleet.js'
export type { SignalValues, FleetAssetCard, FleetOverviewResponse } from './fleet.js'

// --- Asset Detail ---
export { ZScoreBreakdownSchema, AssetDetailResponseSchema } from './asset-detail.js'
export type { ZScoreBreakdown, AssetDetailResponse } from './asset-detail.js'

// --- Asset History ---
export { AssetHistoryPointSchema, AssetHistoryResponseSchema } from './asset-history.js'
export type { AssetHistoryPoint, AssetHistoryResponse } from './asset-history.js'

// --- Incidents ---
export { ActiveIncidentSummarySchema, IncidentsResponseSchema } from './incidents.js'
export type { ActiveIncidentSummary, IncidentsResponse } from './incidents.js'

// --- Conversation ---
export { RecentConversationItemSchema } from './conversation.js'
export type { RecentConversationItem } from './conversation.js'
