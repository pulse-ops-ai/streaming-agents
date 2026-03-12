import { describe, expect, it } from 'vitest'
import { bedrockConfigSchema } from '../schemas/bedrock.js'
import { dlqConfigSchema } from '../schemas/dlq.js'
import { dynamodbConfigSchema } from '../schemas/dynamodb.js'
import { incidentsConfigSchema } from '../schemas/incidents.js'
import { kinesisConsumerConfigSchema, kinesisProducerConfigSchema } from '../schemas/kinesis.js'

describe('bedrockConfigSchema', () => {
  it('applies defaults for all optional fields', () => {
    const result = bedrockConfigSchema.parse({})
    expect(result).toEqual({
      BEDROCK_MODEL_ID: 'anthropic.claude-sonnet-4-20250514',
      BEDROCK_MAX_TOKENS: 1024,
      BEDROCK_TEMPERATURE: 0.2,
      DIAGNOSIS_DEBOUNCE_MS: 30000,
    })
  })

  it('accepts custom values', () => {
    const result = bedrockConfigSchema.parse({
      BEDROCK_MODEL_ID: 'anthropic.claude-haiku-4-5-20251001',
      BEDROCK_MAX_TOKENS: '512',
      BEDROCK_TEMPERATURE: '0.5',
      BEDROCK_REGION: 'us-west-2',
      DIAGNOSIS_DEBOUNCE_MS: '10000',
    })
    expect(result.BEDROCK_MODEL_ID).toBe('anthropic.claude-haiku-4-5-20251001')
    expect(result.BEDROCK_MAX_TOKENS).toBe(512)
    expect(result.BEDROCK_TEMPERATURE).toBe(0.5)
    expect(result.BEDROCK_REGION).toBe('us-west-2')
    expect(result.DIAGNOSIS_DEBOUNCE_MS).toBe(10000)
  })

  it('coerces string values to numbers', () => {
    const result = bedrockConfigSchema.parse({
      BEDROCK_MAX_TOKENS: '2048',
      BEDROCK_TEMPERATURE: '0.1',
      DIAGNOSIS_DEBOUNCE_MS: '60000',
    })
    expect(result.BEDROCK_MAX_TOKENS).toBe(2048)
    expect(result.BEDROCK_TEMPERATURE).toBe(0.1)
    expect(result.DIAGNOSIS_DEBOUNCE_MS).toBe(60000)
  })

  it('rejects temperature out of range', () => {
    const result = bedrockConfigSchema.safeParse({ BEDROCK_TEMPERATURE: '1.5' })
    expect(result.success).toBe(false)
  })

  it('rejects negative max tokens', () => {
    const result = bedrockConfigSchema.safeParse({ BEDROCK_MAX_TOKENS: '-1' })
    expect(result.success).toBe(false)
  })

  it('rejects negative debounce', () => {
    const result = bedrockConfigSchema.safeParse({ DIAGNOSIS_DEBOUNCE_MS: '-100' })
    expect(result.success).toBe(false)
  })

  it('allows zero debounce (disable)', () => {
    const result = bedrockConfigSchema.parse({ DIAGNOSIS_DEBOUNCE_MS: '0' })
    expect(result.DIAGNOSIS_DEBOUNCE_MS).toBe(0)
  })
})

describe('incidentsConfigSchema', () => {
  it('requires INCIDENTS_TABLE', () => {
    const result = incidentsConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('applies defaults for threshold and TTL', () => {
    const result = incidentsConfigSchema.parse({ INCIDENTS_TABLE: 'streaming-agents-incidents' })
    expect(result).toEqual({
      INCIDENTS_TABLE: 'streaming-agents-incidents',
      ESCALATION_THRESHOLD_MS: 60000,
      RESOLVED_TTL_HOURS: 72,
    })
  })

  it('accepts custom values', () => {
    const result = incidentsConfigSchema.parse({
      INCIDENTS_TABLE: 'my-incidents',
      ESCALATION_THRESHOLD_MS: '120000',
      RESOLVED_TTL_HOURS: '24',
    })
    expect(result.INCIDENTS_TABLE).toBe('my-incidents')
    expect(result.ESCALATION_THRESHOLD_MS).toBe(120000)
    expect(result.RESOLVED_TTL_HOURS).toBe(24)
  })

  it('rejects empty table name', () => {
    const result = incidentsConfigSchema.safeParse({ INCIDENTS_TABLE: '' })
    expect(result.success).toBe(false)
  })

  it('rejects non-positive threshold', () => {
    const result = incidentsConfigSchema.safeParse({
      INCIDENTS_TABLE: 'test',
      ESCALATION_THRESHOLD_MS: '0',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-positive TTL', () => {
    const result = incidentsConfigSchema.safeParse({
      INCIDENTS_TABLE: 'test',
      RESOLVED_TTL_HOURS: '0',
    })
    expect(result.success).toBe(false)
  })
})

describe('existing schemas still work', () => {
  it('dynamodbConfigSchema requires DYNAMODB_TABLE', () => {
    const result = dynamodbConfigSchema.safeParse({})
    expect(result.success).toBe(false)

    const valid = dynamodbConfigSchema.parse({ DYNAMODB_TABLE: 'r17-asset-state' })
    expect(valid.DYNAMODB_TABLE).toBe('r17-asset-state')
  })

  it('dlqConfigSchema requires DLQ_QUEUE_URL', () => {
    const result = dlqConfigSchema.safeParse({})
    expect(result.success).toBe(false)

    const valid = dlqConfigSchema.parse({
      DLQ_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/000/dlq',
    })
    expect(valid.DLQ_QUEUE_URL).toBe('https://sqs.us-east-1.amazonaws.com/000/dlq')
  })

  it('kinesisConsumerConfigSchema requires KINESIS_INPUT_STREAM', () => {
    const valid = kinesisConsumerConfigSchema.parse({ KINESIS_INPUT_STREAM: 'r17-telemetry' })
    expect(valid.KINESIS_INPUT_STREAM).toBe('r17-telemetry')
  })

  it('kinesisProducerConfigSchema applies default BATCH_SIZE', () => {
    const valid = kinesisProducerConfigSchema.parse({ KINESIS_OUTPUT_STREAM: 'r17-risk-events' })
    expect(valid.BATCH_SIZE).toBe(25)
  })
})
