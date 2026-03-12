import { z } from 'zod'
import { RiskStateSchema } from './common.js'

// ---------------------------------------------------------------------------
// Fleet Overview — /api/fleet
// ---------------------------------------------------------------------------

/** Summary of signal values shown on each asset card. */
export const SignalValuesSchema = z.object({
  board_temperature_c: z.number(),
  accel_magnitude_ms2: z.number(),
  gyro_magnitude_rads: z.number(),
  joint_position_error_deg: z.number(),
  control_loop_freq_hz: z.number(),
})
export type SignalValues = z.infer<typeof SignalValuesSchema>

/** Per-asset card for the fleet grid. */
export const FleetAssetCardSchema = z.object({
  asset_id: z.string(),
  risk_state: RiskStateSchema,
  composite_risk: z.number().min(0).max(1),
  last_values: SignalValuesSchema,
  updated_at: z.string(),
  has_active_incident: z.boolean(),
})
export type FleetAssetCard = z.infer<typeof FleetAssetCardSchema>

/** GET /api/fleet response. */
export const FleetOverviewResponseSchema = z.object({
  timestamp: z.string(),
  total_assets: z.number().int().nonnegative(),
  risk_summary: z.object({
    nominal: z.number().int().nonnegative(),
    elevated: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  }),
  active_incidents: z.number().int().nonnegative(),
  assets: z.array(FleetAssetCardSchema),
})
export type FleetOverviewResponse = z.infer<typeof FleetOverviewResponseSchema>
