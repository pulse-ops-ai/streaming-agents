import { z } from 'zod'

/** Zod schema for validating the Bedrock LLM response. */
export const DiagnosisResponseSchema = z.object({
  root_cause: z.string().min(1),
  evidence: z.array(
    z.object({
      signal: z.string().min(1),
      observation: z.string().min(1),
      z_score: z.number(),
    })
  ),
  confidence: z.enum(['low', 'medium', 'high']),
  recommended_actions: z.array(z.string().min(1)),
  severity: z.enum(['info', 'warning', 'critical']),
})

export type DiagnosisResponse = z.infer<typeof DiagnosisResponseSchema>

/**
 * Parse and validate a raw Bedrock response string into a DiagnosisResponse.
 *
 * Handles:
 * - Markdown fence stripping (```json ... ```)
 * - JSON parse
 * - Zod validation
 *
 * Returns null on any failure.
 */
export function parseDiagnosisResponse(raw: string): DiagnosisResponse | null {
  try {
    const stripped = stripMarkdownFences(raw.trim())
    const parsed = JSON.parse(stripped)
    const result = DiagnosisResponseSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Strip markdown code fences if present. */
function stripMarkdownFences(text: string): string {
  const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/
  const match = fenceRegex.exec(text)
  return match ? match[1].trim() : text
}
