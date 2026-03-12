import { z } from 'zod'
import { IncidentStatusSchema, SeveritySchema } from './common.js'

// ---------------------------------------------------------------------------
// Incidents — /api/incidents
// ---------------------------------------------------------------------------

/** Single active incident for display. */
export const ActiveIncidentSummarySchema = z.object({
  incident_id: z.string(),
  asset_id: z.string(),
  status: IncidentStatusSchema,
  severity: SeveritySchema,
  root_cause: z.string(),
  opened_at: z.string(),
  escalated_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  /** Human-readable duration for display (e.g., "8m 14s"). */
  duration: z.string(),
})
export type ActiveIncidentSummary = z.infer<typeof ActiveIncidentSummarySchema>

/** GET /api/incidents response. */
export const IncidentsResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  incidents: z.array(ActiveIncidentSummarySchema),
})
export type IncidentsResponse = z.infer<typeof IncidentsResponseSchema>
