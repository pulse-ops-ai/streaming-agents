import { z } from 'zod'

// ---------------------------------------------------------------------------
// Common types shared across dashboard API responses
// ---------------------------------------------------------------------------

/** Risk states used across all responses. */
export const RiskStateSchema = z.enum(['nominal', 'elevated', 'critical'])
export type RiskState = z.infer<typeof RiskStateSchema>

/** Severity levels used in incidents. */
export const SeveritySchema = z.enum(['info', 'warning', 'critical'])
export type Severity = z.infer<typeof SeveritySchema>

/** Incident lifecycle states. */
export const IncidentStatusSchema = z.enum(['opened', 'escalated', 'resolved'])
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>

/** Standard error response from the Dashboard API. */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  status: z.number().int(),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
