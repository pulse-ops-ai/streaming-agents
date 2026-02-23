import { describe, expect, it } from 'vitest'
import { parseDiagnosisResponse } from '../parser.js'

const validResponse = {
  root_cause: 'Joint bearing wear causing increased position error',
  evidence: [
    {
      signal: 'joint_position_error_deg',
      observation: 'Position error exceeds 2.5 standard deviations',
      z_score: 2.8,
    },
  ],
  confidence: 'high' as const,
  recommended_actions: ['reduce joint velocity', 'inspect servo motor'],
  severity: 'warning' as const,
}

describe('parseDiagnosisResponse', () => {
  it('parses valid JSON into DiagnosisResponse', () => {
    const result = parseDiagnosisResponse(JSON.stringify(validResponse))
    expect(result).toEqual(validResponse)
  })

  it('parses JSON wrapped in markdown fences', () => {
    const raw = `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``
    const result = parseDiagnosisResponse(raw)
    expect(result).toEqual(validResponse)
  })

  it('parses JSON wrapped in plain markdown fences', () => {
    const raw = `\`\`\`\n${JSON.stringify(validResponse)}\n\`\`\``
    const result = parseDiagnosisResponse(raw)
    expect(result).toEqual(validResponse)
  })

  it('returns null for malformed JSON', () => {
    const result = parseDiagnosisResponse('not valid json {{{')
    expect(result).toBeNull()
  })

  it('returns null for empty string', () => {
    const result = parseDiagnosisResponse('')
    expect(result).toBeNull()
  })

  it('returns null when root_cause is missing', () => {
    const incomplete = { ...validResponse }
    // biome-ignore lint/performance/noDelete: test requires property removal
    delete (incomplete as Record<string, unknown>).root_cause
    const result = parseDiagnosisResponse(JSON.stringify(incomplete))
    expect(result).toBeNull()
  })

  it('returns null when evidence is missing', () => {
    const incomplete = { ...validResponse }
    // biome-ignore lint/performance/noDelete: test requires property removal
    delete (incomplete as Record<string, unknown>).evidence
    const result = parseDiagnosisResponse(JSON.stringify(incomplete))
    expect(result).toBeNull()
  })

  it('returns null for invalid severity value', () => {
    const invalid = { ...validResponse, severity: 'extreme' }
    const result = parseDiagnosisResponse(JSON.stringify(invalid))
    expect(result).toBeNull()
  })

  it('returns null for invalid confidence value', () => {
    const invalid = { ...validResponse, confidence: 'very_high' }
    const result = parseDiagnosisResponse(JSON.stringify(invalid))
    expect(result).toBeNull()
  })

  it('returns null when recommended_actions is missing', () => {
    const incomplete = { ...validResponse }
    // biome-ignore lint/performance/noDelete: test requires property removal
    delete (incomplete as Record<string, unknown>).recommended_actions
    const result = parseDiagnosisResponse(JSON.stringify(incomplete))
    expect(result).toBeNull()
  })

  it('handles extra whitespace around markdown fences', () => {
    const raw = `  \`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\`  `
    const result = parseDiagnosisResponse(raw)
    expect(result).toEqual(validResponse)
  })

  it('accepts multiple evidence items', () => {
    const multi = {
      ...validResponse,
      evidence: [
        { signal: 'joint_position_error_deg', observation: 'High error', z_score: 2.8 },
        { signal: 'board_temperature_c', observation: 'Overheating', z_score: 2.3 },
      ],
    }
    const result = parseDiagnosisResponse(JSON.stringify(multi))
    expect(result?.evidence).toHaveLength(2)
  })

  it('accepts empty evidence array', () => {
    const empty = { ...validResponse, evidence: [] }
    const result = parseDiagnosisResponse(JSON.stringify(empty))
    expect(result?.evidence).toHaveLength(0)
  })
})
