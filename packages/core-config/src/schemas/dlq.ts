import { z } from 'zod'

/** Config for Lambdas that publish to a dead-letter queue. */
export const dlqConfigSchema = z.object({
  DLQ_QUEUE_URL: z.string().min(1),
})

export type DlqConfig = z.infer<typeof dlqConfigSchema>
