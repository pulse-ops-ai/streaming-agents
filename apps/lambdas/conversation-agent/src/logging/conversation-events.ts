/**
 * Structured log event types for the conversation-agent router.
 *
 * These interfaces define the stable, CloudWatch-queryable fields
 * emitted at the router boundary. All events share a common base
 * and add event-specific fields.
 *
 * Privacy rules:
 *  - transcript_text is gated by LOG_TRANSCRIPT (default: true in demo, false in prod)
 *  - Raw audio is never logged.
 *  - Full Bedrock prompts/responses are never logged at info level.
 *  - response_summary is truncated to 120 chars.
 */

// ---------------------------------------------------------------------------
// Common base
// ---------------------------------------------------------------------------

export interface ConversationLogBase {
  event_name: string
  service: 'conversation-agent'
  component: 'router'
  request_id: string
  session_id: string
  channel: 'voice' | 'text'
  provider: 'lex'
  asset_id?: string
}

// ---------------------------------------------------------------------------
// Event A — request_received
// ---------------------------------------------------------------------------

export interface RequestReceivedLog extends ConversationLogBase {
  event_name: 'conversation.request_received'
  intent_name_raw: string
  transcript_text?: string
  fleet_scope: boolean
  status: 'received'
}

// ---------------------------------------------------------------------------
// Event B — intent_resolved
// ---------------------------------------------------------------------------

export interface IntentResolvedLog extends ConversationLogBase {
  event_name: 'conversation.intent_resolved'
  intent_name_raw: string
  intent_name_resolved: string
  slot_values?: Record<string, string>
  fallback_used: boolean
  handler_name: string
  fleet_scope: boolean
  status: 'resolved'
}

// ---------------------------------------------------------------------------
// Event C — response_generated
// ---------------------------------------------------------------------------

export interface ResponseGeneratedLog extends ConversationLogBase {
  event_name: 'conversation.response_generated'
  intent_name_resolved: string
  used_bedrock: boolean
  bedrock_model_id?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  response_type: 'plain_text' | 'ssml' | 'fallback'
  response_summary: string
  response_confidence: 'high' | 'medium' | 'low'
  incident_count?: number
  at_risk_asset_count?: number
  duration_ms: number
  status: 'completed'
}

// ---------------------------------------------------------------------------
// Event D — request_failed
// ---------------------------------------------------------------------------

export type FailureStage =
  | 'request_parse'
  | 'intent_resolution'
  | 'dynamodb_lookup'
  | 'bedrock_inference'
  | 'response_build'
  | 'ssml_render'

export interface RequestFailedLog extends ConversationLogBase {
  event_name: 'conversation.request_failed'
  intent_name_resolved?: string
  used_bedrock: boolean
  bedrock_model_id?: string
  failure_stage: FailureStage
  error_code: string
  error_message: string
  fallback_used: boolean
  duration_ms: number
  status: 'failed'
}

// ---------------------------------------------------------------------------
// Union + handler metadata
// ---------------------------------------------------------------------------

export type ConversationLogEvent =
  | RequestReceivedLog
  | IntentResolvedLog
  | ResponseGeneratedLog
  | RequestFailedLog

/**
 * Metadata returned by intent handlers for structured logging.
 * Handlers set what they know; the router fills in the rest.
 */
export interface HandlerMeta {
  asset_id?: string
  scope?: 'asset' | 'fleet'
  used_bedrock: boolean
  confidence: 'matched' | 'fallback' | 'no_data'
  at_risk_asset_count?: number
  incident_count?: number
  bedrock_model_id?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

// ---------------------------------------------------------------------------
// Intent → handler name mapping
// ---------------------------------------------------------------------------

const HANDLER_MAP: Record<string, string> = {
  AssetStatus: 'AssetStatusHandler',
  FleetOverview: 'FleetOverviewHandler',
  ExplainRisk: 'ExplainRiskHandler',
  RecommendAction: 'RecommendActionHandler',
  AcknowledgeIncident: 'AcknowledgeIncidentHandler',
}

export function resolveHandlerName(intentName: string): string {
  return HANDLER_MAP[intentName] ?? 'FallbackHandler'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function extractSlotValues(
  slots: Record<string, { value: { interpretedValue?: string } } | null>
): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  let hasValues = false
  for (const [key, slot] of Object.entries(slots)) {
    const val = slot?.value?.interpretedValue
    if (val) {
      result[key] = val
      hasValues = true
    }
  }
  return hasValues ? result : undefined
}

export function mapConfidence(
  confidence: HandlerMeta['confidence']
): ResponseGeneratedLog['response_confidence'] {
  switch (confidence) {
    case 'matched':
      return 'high'
    case 'no_data':
      return 'medium'
    case 'fallback':
      return 'low'
  }
}

export function inferFailureStage(error: unknown): FailureStage {
  if (!(error instanceof Error)) return 'intent_resolution'
  const msg = error.message.toLowerCase()
  if (msg.includes('dynamodb') || msg.includes('getitem') || msg.includes('scan'))
    return 'dynamodb_lookup'
  if (msg.includes('bedrock') || msg.includes('invokemodel')) return 'bedrock_inference'
  if (msg.includes('ssml') || msg.includes('speech')) return 'ssml_render'
  if (msg.includes('response') || msg.includes('build')) return 'response_build'
  return 'intent_resolution'
}
