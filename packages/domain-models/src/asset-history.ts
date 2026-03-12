import { z } from 'zod'
import { RiskStateSchema } from './common.js'
import { SignalValuesSchema } from './fleet.js'

// ---------------------------------------------------------------------------
// Asset History — /api/assets/:id/history
// ---------------------------------------------------------------------------

/** A single time-series data point from the history table. */
export const AssetHistoryPointSchema = z.object({
  timestamp: z.string(),
  composite_risk: z.number().min(0).max(1),
  risk_state: RiskStateSchema,
  z_scores: z.object({
    position_error_z: z.number(),
    accel_z: z.number(),
    gyro_z: z.number(),
    temperature_z: z.number(),
  }),
  last_values: SignalValuesSchema,
  threshold_breach: z.number(),
  contributing_signals: z.array(z.string()),
})
export type AssetHistoryPoint = z.infer<typeof AssetHistoryPointSchema>

/** GET /api/assets/:id/history response. */
export const AssetHistoryResponseSchema = z.object({
  asset_id: z.string(),
  from: z.string(),
  to: z.string(),
  count: z.number().int().nonnegative(),
  points: z.array(AssetHistoryPointSchema),
})
export type AssetHistoryResponse = z.infer<typeof AssetHistoryResponseSchema>
