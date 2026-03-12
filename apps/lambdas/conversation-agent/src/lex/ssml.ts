import type { Severity } from '@streaming-agents/core-contracts'

export interface SpeechContext {
  severity: Severity
  intentName: string
  hasIncident: boolean
}

/** Escapes XML special characters for safe embedding in SSML. */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Spells out robot ID prefixes: R-17 → <say-as interpret-as="characters">R</say-as> 17 */
function formatRobotIds(text: string): string {
  return text.replace(/\bR-(\d+)\b/g, '<say-as interpret-as="characters">R</say-as> $1')
}

/** Wraps decimal numbers in say-as for correct pronunciation. */
function formatNumbers(text: string): string {
  return text.replace(/\b(\d+\.\d+)\b/g, '<say-as interpret-as="number">$1</say-as>')
}

/**
 * Wraps the first sentence with prosody-based emphasis and inserts a break after it.
 * Uses <prosody> instead of <emphasis> because Polly neural voices don't support <emphasis>.
 */
function applyEmphasis(text: string, level: 'strong' | 'moderate', breakMs: number): string {
  const prosodyAttrs = level === 'strong' ? 'volume="loud" rate="95%"' : 'rate="98%"'

  // Find the first sentence boundary (period, exclamation, or question mark followed by space or end)
  const match = text.match(/^(.*?[.!?])(\s|$)/)
  if (!match) {
    // No sentence boundary found — wrap the entire text
    return `<prosody ${prosodyAttrs}>${text}</prosody><break time="${breakMs}ms"/>`
  }

  const firstSentence = match[1]
  const rest = text.slice(match[0].length)
  const emphasized = `<prosody ${prosodyAttrs}>${firstSentence}</prosody><break time="${breakMs}ms"/>`

  return rest.length > 0 ? `${emphasized} ${rest}` : emphasized
}

/**
 * Transforms plain text into Polly-neural-compatible SSML.
 *
 * Order of operations:
 * 1. XML-escape the raw text
 * 2. Regex transforms (robot IDs, decimal numbers)
 * 3. Structural SSML (emphasis, breaks) based on severity
 * 4. Prosody wrapper for AcknowledgeIncident
 * 5. <speak> wrapper
 */
export function enhanceForSpeech(text: string, context: SpeechContext): string {
  if (!text) {
    return '<speak></speak>'
  }

  // 1. XML-escape
  let ssml = xmlEscape(text)

  // 2. Regex transforms
  ssml = formatRobotIds(ssml)
  ssml = formatNumbers(ssml)

  // 3. Structural SSML based on severity
  if (context.severity === 'critical') {
    ssml = applyEmphasis(ssml, 'strong', 400)
  } else if (context.severity === 'warning') {
    ssml = applyEmphasis(ssml, 'moderate', 200)
  }

  // 4. AcknowledgeIncident prosody
  if (context.intentName === 'AcknowledgeIncident') {
    ssml = `<prosody rate="105%">${ssml}</prosody>`
  }

  // 5. Wrap in <speak>
  return `<speak>${ssml}</speak>`
}
