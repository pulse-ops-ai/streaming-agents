/**
 * Environment-aware secret resolution.
 *
 * - local/development: no-op (secrets expected in process.env via .env file)
 * - sandbox/production: fetches from AWS Secrets Manager, hydrates process.env
 *
 * The Secrets Manager client is lazy-loaded so it's never imported in local mode.
 */

const LOCAL_ENVS = new Set(['local', 'development'])

function getNodeEnv(): string {
  return process.env.NODE_ENV ?? 'local'
}

/**
 * Resolve secrets from AWS Secrets Manager and hydrate process.env.
 *
 * Must be called BEFORE Zod validation so schemas never know the source.
 * In local/development mode this is a no-op.
 */
export async function resolveSecrets(secretKeys: string[]): Promise<void> {
  if (secretKeys.length === 0) return

  const nodeEnv = getNodeEnv()
  if (LOCAL_ENVS.has(nodeEnv)) return

  // Lazy-load the Secrets Manager client only when actually needed
  let smClient: import('@aws-sdk/client-secrets-manager').SecretsManagerClient
  let GetSecretValueCommand: typeof import('@aws-sdk/client-secrets-manager').GetSecretValueCommand

  try {
    const sm = await import('@aws-sdk/client-secrets-manager')
    smClient = new sm.SecretsManagerClient({
      region: process.env.AWS_REGION,
    })
    GetSecretValueCommand = sm.GetSecretValueCommand
  } catch {
    console.warn(
      '[core-config] @aws-sdk/client-secrets-manager not available — skipping secret resolution'
    )
    return
  }

  for (const key of secretKeys) {
    // Skip if already set in the environment
    if (process.env[key]) continue

    const secretId = `streaming-agents/${nodeEnv}/${key}` // pragma: allowlist secret
    try {
      const result = await smClient.send(new GetSecretValueCommand({ SecretId: secretId }))
      if (result.SecretString) {
        process.env[key] = result.SecretString
      }
    } catch (err) {
      console.error(`[core-config] Failed to resolve secret "${secretId}":`, err)
      throw new Error(`Failed to resolve secret: ${secretId}`)
    }
  }
}
