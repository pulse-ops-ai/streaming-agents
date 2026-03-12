import { describe, expect, it } from 'vitest'
import { type SpeechContext, enhanceForSpeech, xmlEscape } from '../../lex/ssml.js'

describe('xmlEscape', () => {
  it('escapes ampersands', () => {
    expect(xmlEscape('R-17 & R-50')).toBe('R-17 &amp; R-50')
  })

  it('escapes angle brackets', () => {
    expect(xmlEscape('temp < 80 > 20')).toBe('temp &lt; 80 &gt; 20')
  })

  it('escapes double quotes', () => {
    expect(xmlEscape('called "critical"')).toBe('called &quot;critical&quot;')
  })

  it('escapes all special characters together', () => {
    expect(xmlEscape('A & B < C > D "E"')).toBe('A &amp; B &lt; C &gt; D &quot;E&quot;')
  })
})

describe('enhanceForSpeech', () => {
  const infoCtx: SpeechContext = { severity: 'info', intentName: 'AssetStatus', hasIncident: false }
  const warningCtx: SpeechContext = {
    severity: 'warning',
    intentName: 'AssetStatus',
    hasIncident: false,
  }
  const criticalCtx: SpeechContext = {
    severity: 'critical',
    intentName: 'ExplainRisk',
    hasIncident: true,
  }

  it('returns empty speak tags for empty text', () => {
    expect(enhanceForSpeech('', infoCtx)).toBe('<speak></speak>')
  })

  it('wraps info severity in plain speak tags', () => {
    const result = enhanceForSpeech('All systems normal.', infoCtx)
    expect(result).toBe('<speak>All systems normal.</speak>')
    expect(result).not.toContain('<emphasis')
    expect(result).not.toContain('<break')
  })

  it('applies prosody-based emphasis and 200ms break for warning severity', () => {
    const result = enhanceForSpeech(
      'Temperature is elevated. Check the cooling system.',
      warningCtx
    )
    expect(result).toContain('<prosody rate="98%">')
    expect(result).toContain('</prosody>')
    expect(result).toContain('<break time="200ms"/>')
    expect(result).toContain('Check the cooling system.')
    expect(result).toMatch(/^<speak>/)
    expect(result).toMatch(/<\/speak>$/)
  })

  it('applies loud prosody and 400ms break for critical severity', () => {
    const result = enhanceForSpeech(
      'Pressure seal failure detected. Shutdown recommended.',
      criticalCtx
    )
    expect(result).toContain('<prosody volume="loud" rate="95%">')
    expect(result).toContain('</prosody>')
    expect(result).toContain('<break time="400ms"/>')
    expect(result).toContain('Shutdown recommended.')
    expect(result).toMatch(/^<speak>/)
    expect(result).toMatch(/<\/speak>$/)
  })

  it('formats robot IDs with say-as characters', () => {
    const result = enhanceForSpeech('R-17 is nominal.', infoCtx)
    expect(result).toContain('<say-as interpret-as="characters">R</say-as> 17')
  })

  it('formats multiple robot IDs', () => {
    const result = enhanceForSpeech('R-17 and R-50 are both critical.', infoCtx)
    expect(result).toContain('<say-as interpret-as="characters">R</say-as> 17')
    expect(result).toContain('<say-as interpret-as="characters">R</say-as> 50')
  })

  it('formats decimal numbers with say-as number', () => {
    const result = enhanceForSpeech('Risk score is 0.92.', infoCtx)
    expect(result).toContain('<say-as interpret-as="number">0.92</say-as>')
  })

  it('XML-escapes special characters before applying transforms', () => {
    const result = enhanceForSpeech('Temp > 80 & rising.', infoCtx)
    expect(result).toContain('&gt;')
    expect(result).toContain('&amp;')
    expect(result).not.toContain('> 80 &')
  })

  it('wraps AcknowledgeIncident responses in prosody', () => {
    const ackCtx: SpeechContext = {
      severity: 'info',
      intentName: 'AcknowledgeIncident',
      hasIncident: true,
    }
    const result = enhanceForSpeech('Got it. Incident acknowledged.', ackCtx)
    expect(result).toContain('<prosody rate="105%">')
    expect(result).toContain('</prosody>')
    expect(result).toMatch(/^<speak><prosody/)
  })

  it('applies combined transforms: critical severity with robot IDs and numbers', () => {
    const result = enhanceForSpeech(
      'R-17 risk score is 0.95. Immediate attention required.',
      criticalCtx
    )
    expect(result).toContain('<say-as interpret-as="characters">R</say-as> 17')
    expect(result).toContain('<say-as interpret-as="number">0.95</say-as>')
    expect(result).toContain('<prosody volume="loud" rate="95%">')
    expect(result).toContain('<break time="400ms"/>')
  })

  it('handles single sentence with prosody emphasis correctly', () => {
    const result = enhanceForSpeech('Critical failure detected.', criticalCtx)
    expect(result).toContain(
      '<prosody volume="loud" rate="95%">Critical failure detected.</prosody>'
    )
    expect(result).toContain('<break time="400ms"/>')
  })
})
