/**
 * Generates JSON Schema files from Zod schemas.
 * Output: packages/schemas/generated/*.schema.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  R17RiskUpdateSchema,
  R17TelemetryEventSchema,
  R17TelemetryEventV2Schema,
} from '../src/index.js'

const outDir = resolve(dirname(new URL(import.meta.url).pathname), '../generated')
mkdirSync(outDir, { recursive: true })

const schemas = [
  { name: 'r17-telemetry-v1', schema: R17TelemetryEventSchema },
  { name: 'r17-risk-update-v1', schema: R17RiskUpdateSchema },
  { name: 'r17-telemetry-v2', schema: R17TelemetryEventV2Schema },
] as const

for (const { name, schema } of schemas) {
  const jsonSchema = zodToJsonSchema(schema, { name, target: 'jsonSchema7' })
  const outPath = resolve(outDir, `${name}.schema.json`)
  writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`)
  console.log(`wrote ${outPath}`)
}
