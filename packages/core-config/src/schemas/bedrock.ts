import { z } from 'zod'

/** Config for Lambdas that invoke Amazon Bedrock models. */
export const bedrockConfigSchema = z.object({
  BEDROCK_MODEL_ID: z.string().min(1).default('anthropic.claude-sonnet-4-20250514'),
  BEDROCK_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  BEDROCK_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
  BEDROCK_REGION: z.string().min(1).optional(),
  DIAGNOSIS_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(30000),
})

export type BedrockConfig = z.infer<typeof bedrockConfigSchema>
