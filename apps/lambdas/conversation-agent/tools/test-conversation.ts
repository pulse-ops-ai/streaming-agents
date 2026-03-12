/**
 * Manual integration test for the conversation agent.
 *
 * Seeds LocalStack DynamoDB with test asset/incident data, then invokes
 * each intent handler directly (bypassing NestJS DI) and prints
 * formatted PlainText + SSML output.
 *
 * Usage:
 *   npx tsx tools/test-conversation.ts
 *
 * Requires:
 *   - LocalStack running with DynamoDB on http://localhost:4566
 */

// Set AWS env vars early so all SDK clients pick up LocalStack credentials
process.env.AWS_ACCESS_KEY_ID = 'test'
process.env.AWS_SECRET_ACCESS_KEY = 'test' // pragma: allowlist secret
process.env.AWS_REGION = 'us-east-1'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

const ENDPOINT = 'http://localhost:4566'
const REGION = 'us-east-1'
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' }

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: ENDPOINT, region: REGION, credentials: CREDS })
)

const ASSET_TABLE = 'streaming-agents-asset-state'
const INCIDENTS_TABLE = 'streaming-agents-incidents'

// ---------- seed data ----------

const seedAssets = [
  {
    asset_id: 'R-17',
    risk_state: 'critical',
    composite_risk: 0.95,
    threshold_breach: 'pressure_seal',
    last_values: { board_temperature_c: 85, accel_magnitude_ms2: 12.5 },
    z_scores: { position_error_z: 3.2, accel_z: 2.8, gyro_z: 1.1, temperature_z: 2.5 },
    updated_at: new Date().toISOString(),
  },
  {
    asset_id: 'R-50',
    risk_state: 'nominal',
    composite_risk: 0.12,
    threshold_breach: null,
    last_values: { board_temperature_c: 42, accel_magnitude_ms2: 5.0 },
    z_scores: { position_error_z: 0.3, accel_z: 0.5, gyro_z: 0.2, temperature_z: 0.4 },
    updated_at: new Date().toISOString(),
  },
  {
    asset_id: 'R-8',
    risk_state: 'elevated',
    composite_risk: 0.65,
    threshold_breach: 'temperature',
    last_values: { board_temperature_c: 72, accel_magnitude_ms2: 8.3 },
    z_scores: { position_error_z: 1.1, accel_z: 1.8, gyro_z: 0.9, temperature_z: 2.1 },
    updated_at: new Date().toISOString(),
  },
]

const seedIncidents = [
  {
    incident_id: 'inc-test-001',
    asset_id: 'R-17',
    status: 'escalated',
    severity: 'critical',
    root_cause: 'Pressure seal degradation detected in joint assembly',
    opened_at: new Date().toISOString(),
    escalated_at: new Date().toISOString(),
    resolved_at: null,
    acknowledged_at: null,
    updated_at: new Date().toISOString(),
    expires_at: null,
    last_diagnosis_event_id: 'diag-test-001',
    last_action_event_id: 'act-test-001',
    action_history: [
      { action: 'alert', timestamp: new Date().toISOString(), event_id: 'act-test-001' },
    ],
  },
  {
    incident_id: 'inc-test-002',
    asset_id: 'R-8',
    status: 'opened',
    severity: 'warning',
    root_cause:
      'Thermal anomaly detected. Board temperature trending above normal operating range.',
    opened_at: new Date().toISOString(),
    escalated_at: null,
    resolved_at: null,
    acknowledged_at: null,
    updated_at: new Date().toISOString(),
    expires_at: null,
    last_diagnosis_event_id: 'diag-test-010',
    last_action_event_id: 'act-test-010',
    action_history: [
      { action: 'alert', timestamp: new Date().toISOString(), event_id: 'act-test-010' },
    ],
  },
]

// ---------- helpers ----------

async function seedDynamo() {
  console.log('\n--- Seeding DynamoDB ---')
  for (const asset of seedAssets) {
    await ddb.send(new PutCommand({ TableName: ASSET_TABLE, Item: asset }))
    console.log(`  Asset: ${asset.asset_id} (${asset.risk_state})`)
  }
  for (const incident of seedIncidents) {
    await ddb.send(new PutCommand({ TableName: INCIDENTS_TABLE, Item: incident }))
    console.log(
      `  Incident: ${incident.incident_id} on ${incident.asset_id} [${incident.status}/${incident.severity}]`
    )
  }
}

function loadFixture(name: string) {
  const fixturePath = resolve(import.meta.dirname, '..', 'fixtures', `${name}.json`)
  return JSON.parse(readFileSync(fixturePath, 'utf-8'))
}

// ---------- wire up components without NestJS ----------

// Inline mock ConfigService
const mockConfig = {
  get: (key: string) => {
    const env: Record<string, string> = {
      AWS_REGION: REGION,
      NODE_ENV: 'local',
      DYNAMODB_ASSET_TABLE: ASSET_TABLE,
      DYNAMODB_INCIDENTS_TABLE: INCIDENTS_TABLE,
    }
    return env[key]
  },
}

// Inline mock TelemetryService
const mockTelemetry = {
  startSpan: () => ({ setAttribute: () => {}, recordException: () => {}, end: () => {} }),
}

// Dynamic import to avoid top-level decorator issues with tsx
async function buildRouter() {
  const { AssetStateAdapter } = await import('../src/adapters/asset-state.adapter.js')
  const { IncidentAdapter } = await import('../src/adapters/incident.adapter.js')
  const { MockBedrockAdapter } = await import('../src/adapters/mock-bedrock.adapter.js')
  const { AssetStatusHandler } = await import('../src/intents/asset-status.handler.js')
  const { FleetOverviewHandler } = await import('../src/intents/fleet-overview.handler.js')
  const { ExplainRiskHandler } = await import('../src/intents/explain-risk.handler.js')
  const { RecommendActionHandler } = await import('../src/intents/recommend-action.handler.js')
  const { AcknowledgeIncidentHandler } = await import('../src/intents/acknowledge.handler.js')
  const { FallbackHandler } = await import('../src/intents/fallback.handler.js')
  const { IntentRouter } = await import('../src/router.js')
  const { buildLexResponse } = await import('../src/lex/response-builder.js')

  // Construct adapters with mock config
  const assetState = new AssetStateAdapter(mockConfig as never)
  const incidents = new IncidentAdapter(mockConfig as never)
  const bedrock = new MockBedrockAdapter(mockTelemetry as never)

  // Construct handlers
  const assetStatus = new AssetStatusHandler(assetState, bedrock)
  const fleetOverview = new FleetOverviewHandler(assetState, bedrock)
  const explainRisk = new ExplainRiskHandler(assetState, incidents, bedrock)
  const recommendAction = new RecommendActionHandler(incidents, bedrock)
  const acknowledge = new AcknowledgeIncidentHandler(incidents)
  const fallback = new FallbackHandler()

  // Construct router
  const router = new IntentRouter(
    assetStatus,
    fleetOverview,
    explainRisk,
    recommendAction,
    acknowledge,
    fallback,
    mockTelemetry as never
  )

  return { router, buildLexResponse }
}

// ---------- main ----------

async function main() {
  await seedDynamo()

  const { router } = await buildRouter()

  const fixtures = [
    'asset-status',
    'fleet-overview',
    'explain-risk',
    'recommend-action',
    'acknowledge',
    'fallback',
  ]

  let allPassed = true

  for (const name of fixtures) {
    const event = loadFixture(name)
    console.log(`\n=== ${name.toUpperCase()} ===`)
    console.log(`Input: "${event.inputTranscript}"`)

    try {
      const response = await router.route(event)
      const ssmlMsg = response.messages?.find((m) => m.contentType === 'SSML')
      const textMsg = response.messages?.find((m) => m.contentType === 'PlainText')

      console.log(`PlainText: ${textMsg?.content ?? '(none)'}`)
      console.log(`SSML:      ${ssmlMsg?.content ?? '(none)'}`)

      // Validation
      if (!textMsg) {
        console.error('  FAIL: No PlainText message')
        allPassed = false
      }
      if (!ssmlMsg) {
        console.error('  FAIL: No SSML message')
        allPassed = false
      }
      if (ssmlMsg && !ssmlMsg.content.startsWith('<speak>')) {
        console.error('  FAIL: SSML does not start with <speak>')
        allPassed = false
      }
      if (ssmlMsg && !ssmlMsg.content.endsWith('</speak>')) {
        console.error('  FAIL: SSML does not end with </speak>')
        allPassed = false
      }
      if (response.sessionState.intent.state !== 'Fulfilled') {
        console.error(
          `  FAIL: Intent state is ${response.sessionState.intent.state}, expected Fulfilled`
        )
        allPassed = false
      }
    } catch (err) {
      console.error(`  ERROR: ${(err as Error).message}`)
      allPassed = false
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  if (allPassed) {
    console.log('ALL FIXTURES PASSED')
  } else {
    console.log('SOME FIXTURES FAILED')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
