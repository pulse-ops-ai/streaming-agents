import { z } from 'zod'

/** Config for Lambdas that manage the incidents DynamoDB table. */
export const incidentsConfigSchema = z.object({
  INCIDENTS_TABLE: z.string().min(1),
  ESCALATION_THRESHOLD_MS: z.coerce.number().int().positive().default(60000),
  RESOLVED_TTL_HOURS: z.coerce.number().int().positive().default(72),
})

export type IncidentsConfig = z.infer<typeof incidentsConfigSchema>
