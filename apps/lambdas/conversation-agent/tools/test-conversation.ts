/**
 * Manual integration test for the conversation agent.
 *
 * Seeds LocalStack DynamoDB with test asset/incident data, then invokes
 * the handler with each fixture and prints formatted PlainText + SSML output.
 *
 * Usage:
 *   npx tsx tools/test-conversation.ts
 *
 * Requires:
 *   - LocalStack running with DynamoDB on http://localhost:4566
 *   - NODE_ENV=local or NODE_ENV=localstack
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

// Force local/mock mode
process.env.NODE_ENV = 'local'
process.env.DYNAMODB_ASSET_TABLE = 'streaming-agents-asset-state'
process.env.DYNAMODB_INCIDENTS_TABLE = 'streaming-agents-incidents'

const ENDPOINT = 'http://localhost:4566'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: ENDPOINT, region: 'us-east-1' })
)

const assetTable = process.env.DYNAMODB_ASSET_TABLE
const incidentTable = process.env.DYNAMODB_INCIDENTS_TABLE

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
    status: 'opened',
    severity: 'critical',
    root_cause: 'Pressure seal degradation detected in joint assembly',
    opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// ---------- helpers ----------

async function seedDynamo() {
  console.log('\n--- Seeding DynamoDB ---')
  for (const asset of seedAssets) {
    await ddb.send(new PutCommand({ TableName: assetTable, Item: asset }))
    console.log(`  Asset: ${asset.asset_id} (${asset.risk_state})`)
  }
  for (const incident of seedIncidents) {
    await ddb.send(new PutCommand({ TableName: incidentTable, Item: incident }))
    console.log(`  Incident: ${incident.incident_id} on ${incident.asset_id}`)
  }
}

function loadFixture(name: string) {
  const path = resolve(import.meta.dirname, '..', 'fixtures', `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// ---------- main ----------

async function main() {
  await seedDynamo()

  // Dynamic import to ensure env vars are set before NestJS bootstrap
  const { handler } = await import('../src/main.js')

  const fixtures = [
    'asset-status',
    'fleet-overview',
    'explain-risk',
    'recommend-action',
    'acknowledge',
    'fallback',
  ]

  for (const name of fixtures) {
    const event = loadFixture(name)
    console.log(`\n=== ${name.toUpperCase()} ===`)
    console.log(`Input: "${event.inputTranscript}"`)

    const response = await handler(event)
    const ssmlMsg = response.messages?.find((m) => m.contentType === 'SSML')
    const textMsg = response.messages?.find((m) => m.contentType === 'PlainText')

    console.log(`PlainText: ${textMsg?.content ?? '(none)'}`)
    console.log(`SSML:      ${ssmlMsg?.content ?? '(none)'}`)
  }
}

main().catch(console.error)
