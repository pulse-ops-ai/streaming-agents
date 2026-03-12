import { z } from 'zod'

/** Base config required by every Lambda. */
export const baseLambdaConfigSchema = z.object({
  NODE_ENV: z.enum(['local', 'development', 'sandbox', 'production']).default('local'),
  AWS_REGION: z.string().min(1),
  OTEL_SERVICE_NAME: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})

export type BaseLambdaConfig = z.infer<typeof baseLambdaConfigSchema>
