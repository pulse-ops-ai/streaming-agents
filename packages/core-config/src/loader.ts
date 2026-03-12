import type { ZodError, ZodSchema } from 'zod'
import { resolveSecrets } from './secrets.js'

export interface LoadConfigOptions {
  /** Secret keys to resolve from Secrets Manager before validation. */
  secrets?: string[]
}

/**
 * Load and validate environment configuration.
 *
 * 1. Resolves secrets (if provided) — hydrates process.env in non-local envs
 * 2. Validates process.env against the Zod schema
 * 3. Returns a frozen config object
 *
 * Throws immediately on missing or invalid env vars.
 */
export async function loadConfig<T>(
  schema: ZodSchema<T>,
  opts?: LoadConfigOptions
): Promise<Readonly<T>> {
  if (opts?.secrets?.length) {
    await resolveSecrets(opts.secrets)
  }

  const result = schema.safeParse(process.env)

  if (!result.success) {
    const message = formatZodError(result.error)
    throw new Error(`[core-config] Invalid configuration:\n${message}`)
  }

  return Object.freeze(result.data)
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      if (issue.code === 'invalid_type' && issue.received === 'undefined') {
        return `  Missing required env var: ${path}`
      }
      return `  ${path}: ${issue.message}`
    })
    .join('\n')
}
