import { z } from 'zod'
import { AssetHistoryPointSchema } from './asset-history.js'
import { RiskStateSchema } from './common.js'
import { SignalValuesSchema } from './fleet.js'
import { ActiveIncidentSummarySchema } from './incidents.js'

// ---------------------------------------------------------------------------
// Asset Detail — /api/assets/:id
// ---------------------------------------------------------------------------

/** Per-signal z-score breakdown. */
export const ZScoreBreakdownSchema = z.object({
  position_error_z: z.number(),
  accel_z: z.number(),
  gyro_z: z.number(),
  temperature_z: z.number(),
})
export type ZScoreBreakdown = z.infer<typeof ZScoreBreakdownSchema>

/** GET /api/assets/:id response. */
export const AssetDetailResponseSchema = z.object({
  asset_id: z.string(),
  risk_state: RiskStateSchema,
  composite_risk: z.number().min(0).max(1),
  reading_count: z.number().int().nonnegative(),
  updated_at: z.string(),
  z_scores: ZScoreBreakdownSchema,
  threshold_breach: z.number(),
  contributing_signals: z.array(z.string()),
  last_values: SignalValuesSchema,
  /** Most recent ~60 history points for sparkline/mini chart. */
  recent_history: z.array(AssetHistoryPointSchema),
  /** Active incident for this asset, if any. */
  active_incident: ActiveIncidentSummarySchema.nullable(),
})
export type AssetDetailResponse = z.infer<typeof AssetDetailResponseSchema>
