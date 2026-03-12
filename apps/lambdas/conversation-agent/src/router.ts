import { Inject, Injectable } from '@nestjs/common'
import type {
  LexFulfillmentRequest,
  LexFulfillmentResponse,
} from '@streaming-agents/core-contracts'
import {
  LOGGER,
  type LoggerService,
  TELEMETRY,
  type TelemetryService,
} from '@streaming-agents/core-telemetry'

import { AcknowledgeIncidentHandler } from './intents/acknowledge.handler.js'
import { AssetStatusHandler } from './intents/asset-status.handler.js'
import { ExplainRiskHandler } from './intents/explain-risk.handler.js'
import { FallbackHandler } from './intents/fallback.handler.js'
import { FleetOverviewHandler } from './intents/fleet-overview.handler.js'
import type { IntentHandler } from './intents/intent.handler.js'
import { RecommendActionHandler } from './intents/recommend-action.handler.js'
import { type ResponseInput, buildLexResponse } from './lex/response-builder.js'
import {
  type ConversationLogBase,
  type HandlerMeta,
  extractSlotValues,
  inferFailureStage,
  mapConfidence,
  resolveHandlerName,
  truncate,
} from './logging/conversation-events.js'

/** Gate transcript logging — default true for demo/sandbox, set false for prod. */
const LOG_TRANSCRIPT = process.env.LOG_TRANSCRIPT !== 'false'

/** Bedrock model ID for log enrichment (read from env, not from adapter instance). */
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID

const FLEET_INTENTS = new Set(['FleetOverview'])

@Injectable()
export class IntentRouter {
  private readonly handlers: Record<string, IntentHandler>

  constructor(
    @Inject(AssetStatusHandler) assetStatus: AssetStatusHandler,
    @Inject(FleetOverviewHandler) fleetOverview: FleetOverviewHandler,
    @Inject(ExplainRiskHandler) explainRisk: ExplainRiskHandler,
    @Inject(RecommendActionHandler) recommendAction: RecommendActionHandler,
    @Inject(AcknowledgeIncidentHandler) acknowledge: AcknowledgeIncidentHandler,
    @Inject(FallbackHandler) private readonly fallback: FallbackHandler,
    @Inject(TELEMETRY) private readonly telemetry: TelemetryService,
    @Inject(LOGGER) private readonly logger: LoggerService
  ) {
    this.handlers = {
      AssetStatus: assetStatus,
      FleetOverview: fleetOverview,
      ExplainRisk: explainRisk,
      RecommendAction: recommendAction,
      AcknowledgeIncident: acknowledge,
    }
  }

  async route(event: LexFulfillmentRequest): Promise<LexFulfillmentResponse> {
    const span = this.telemetry.startSpan('conversation.fulfill')
    const startMs = Date.now()
    const requestId = crypto.randomUUID()

    const intentNameRaw = event.sessionState.intent.name
    const sessionId = event.sessionId ?? 'unknown'
    const channel: 'voice' | 'text' = event.inputMode === 'Speech' ? 'voice' : 'text'
    const fleetScope = FLEET_INTENTS.has(intentNameRaw)

    const base: ConversationLogBase = {
      event_name: '',
      service: 'conversation-agent',
      component: 'router',
      request_id: requestId,
      session_id: sessionId,
      channel,
      provider: 'lex',
    }

    // Parse slots early so asset_id is available in both success and failure paths
    const slotValues = extractSlotValues(event.sessionState.intent.slots ?? {})
    const assetId = slotValues?.asset_id

    try {
      span.setAttribute('lex.intent.name', intentNameRaw)
      span.setAttribute('lex.session.id', sessionId)

      // ── Event A: conversation.request_received ─────────────────────
      this.logger.log('conversation.request_received', {
        ...base,
        event_name: 'conversation.request_received',
        intent_name_raw: intentNameRaw,
        ...(LOG_TRANSCRIPT && { transcript_text: event.inputTranscript }),
        fleet_scope: fleetScope,
        status: 'received',
      })

      // ── Intent resolution ──────────────────────────────────────────
      const handlerName = resolveHandlerName(intentNameRaw)
      const fallbackUsed = handlerName === 'FallbackHandler'
      const intentNameResolved = fallbackUsed ? 'FallbackIntent' : intentNameRaw

      // ── Event B: conversation.intent_resolved ──────────────────────
      this.logger.log('conversation.intent_resolved', {
        ...base,
        event_name: 'conversation.intent_resolved',
        asset_id: assetId,
        intent_name_raw: intentNameRaw,
        intent_name_resolved: intentNameResolved,
        slot_values: slotValues,
        fallback_used: fallbackUsed,
        handler_name: handlerName,
        fleet_scope: fleetScope,
        status: 'resolved',
      })

      // ── Handler dispatch ───────────────────────────────────────────
      const handler = this.handlers[intentNameRaw] ?? this.fallback
      const responseInput = await handler.handle(event)

      // ── Build Lex response ─────────────────────────────────────────
      const formatSpan = this.telemetry.startSpan('conversation.format-response')
      let lexResponse: LexFulfillmentResponse
      try {
        lexResponse = buildLexResponse(responseInput)
      } finally {
        formatSpan.end()
      }

      // ── Event C: conversation.response_generated ───────────────────
      this.emitResponseGenerated(
        base,
        intentNameResolved,
        fallbackUsed,
        responseInput,
        assetId,
        Date.now() - startMs
      )

      return lexResponse
    } catch (error) {
      // ── Event D: conversation.request_failed ───────────────────────
      this.emitRequestFailed(base, intentNameRaw, assetId, error, Date.now() - startMs)
      span.recordException(error as Error)

      return buildLexResponse({
        intentName: event.sessionState.intent.name,
        message: 'Sorry, I encountered an internal error processing your request.',
      })
    } finally {
      span.end()
    }
  }

  private emitResponseGenerated(
    base: ConversationLogBase,
    intentNameResolved: string,
    fallbackUsed: boolean,
    responseInput: ResponseInput,
    slotAssetId: string | undefined,
    durationMs: number
  ): void {
    const meta: HandlerMeta = responseInput.meta ?? {
      used_bedrock: false,
      confidence: 'matched',
    }

    const bedrockModelId = meta.bedrock_model_id ?? BEDROCK_MODEL_ID

    this.logger.log('conversation.response_generated', {
      ...base,
      event_name: 'conversation.response_generated',
      asset_id: meta.asset_id ?? slotAssetId,
      intent_name_resolved: intentNameResolved,
      used_bedrock: meta.used_bedrock,
      ...(meta.used_bedrock && bedrockModelId && { bedrock_model_id: bedrockModelId }),
      ...(meta.input_tokens != null && { input_tokens: meta.input_tokens }),
      ...(meta.output_tokens != null && { output_tokens: meta.output_tokens }),
      ...(meta.total_tokens != null && { total_tokens: meta.total_tokens }),
      response_type: fallbackUsed
        ? 'fallback'
        : responseInput.speechContext
          ? 'ssml'
          : 'plain_text',
      response_summary: truncate(responseInput.message),
      response_confidence: mapConfidence(meta.confidence),
      ...(meta.at_risk_asset_count != null && {
        at_risk_asset_count: meta.at_risk_asset_count,
      }),
      ...(meta.incident_count != null && { incident_count: meta.incident_count }),
      duration_ms: durationMs,
      status: 'completed',
    })

    // ── OTel metrics for Bedrock usage ──────────────────────────────
    if (meta.used_bedrock) {
      const metricTags = {
        intent_name_resolved: intentNameResolved,
        model_id: bedrockModelId ?? 'unknown',
        channel: base.channel,
      }
      this.telemetry.increment('conversation_bedrock_invocations_total', metricTags)
      this.telemetry.timing('conversation_bedrock_duration_ms', durationMs, metricTags)
      if (meta.input_tokens != null) {
        this.telemetry.gauge(
          'conversation_bedrock_input_tokens_total',
          meta.input_tokens,
          metricTags
        )
      }
      if (meta.output_tokens != null) {
        this.telemetry.gauge(
          'conversation_bedrock_output_tokens_total',
          meta.output_tokens,
          metricTags
        )
      }
      if (meta.total_tokens != null) {
        this.telemetry.gauge(
          'conversation_bedrock_total_tokens_total',
          meta.total_tokens,
          metricTags
        )
      }
    }
  }

  private emitRequestFailed(
    base: ConversationLogBase,
    intentNameRaw: string,
    assetId: string | undefined,
    error: unknown,
    durationMs: number
  ): void {
    const failureStage = inferFailureStage(error)
    const isBedrockFailure = failureStage === 'bedrock_inference'

    this.logger.error('conversation.request_failed', {
      ...base,
      event_name: 'conversation.request_failed',
      ...(assetId && { asset_id: assetId }),
      intent_name_resolved: intentNameRaw,
      used_bedrock: isBedrockFailure,
      ...(isBedrockFailure && BEDROCK_MODEL_ID && { bedrock_model_id: BEDROCK_MODEL_ID }),
      failure_stage: failureStage,
      error_code: (error as { code?: string })?.code ?? 'UNKNOWN',
      error_message: error instanceof Error ? error.message : String(error),
      fallback_used: true,
      duration_ms: durationMs,
      status: 'failed',
    })
  }
}
