import { Inject, Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import { IncidentAdapter } from '../adapters/incident.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

function buildRiskContext(
  assetId: string,
  state: {
    risk_state?: string
    composite_risk?: number
    last_values?: {
      board_temperature_c: number
      accel_magnitude_ms2: number
      gyro_magnitude_rads: number
      joint_position_error_deg: number
      control_loop_freq_hz: number
    }
  } | null,
  incident: { root_cause?: string; severity?: string } | null
): string {
  const vals = state?.last_values
  return `
Asset ID: ${assetId}
Risk State: ${state?.risk_state || 'unknown'}
Composite Risk Score: ${(state?.composite_risk ?? 0).toFixed(2)}
Board Temperature: ${(vals?.board_temperature_c ?? 0).toFixed(1)}°C
Joint Position Error: ${(vals?.joint_position_error_deg ?? 0).toFixed(2)}°
Accelerometer: ${(vals?.accel_magnitude_ms2 ?? 0).toFixed(2)} m/s²
Control Loop Frequency: ${(vals?.control_loop_freq_hz ?? 0).toFixed(1)} Hz
Active Incident Root Cause: ${incident?.root_cause || 'None'}
Incident Severity: ${incident?.severity || 'None'}
  `
}

@Injectable()
export class ExplainRiskHandler implements IntentHandler {
  private readonly logger = new Logger(ExplainRiskHandler.name)

  constructor(
    @Inject(AssetStateAdapter) private readonly assetState: AssetStateAdapter,
    @Inject(IncidentAdapter) private readonly incidents: IncidentAdapter,
    @Inject(ConversationBedrockAdapter) private readonly bedrock: ConversationBedrockAdapter
  ) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const slot = event.sessionState.intent.slots.asset_id?.value
    const assetId = slot?.resolvedValues?.[0] ?? slot?.interpretedValue
    const intentName = event.sessionState.intent.name

    if (!assetId) {
      return {
        intentName,
        message: 'Which robot do you need explained? Try giving me an ID like R-17.',
        meta: { scope: 'asset' as const, used_bedrock: false, confidence: 'no_data' as const },
      }
    }

    const state = await this.assetState.getAssetState(assetId)
    const incident = await this.incidents.findActiveIncident(assetId)

    if (!state && !incident) {
      return {
        intentName,
        message: `I couldn't find any data or incidents for ${assetId}.`,
        meta: {
          asset_id: assetId,
          scope: 'asset' as const,
          used_bedrock: false,
          confidence: 'no_data' as const,
        },
      }
    }

    if (state?.risk_state === 'nominal' && !incident) {
      return {
        intentName,
        message: `${assetId} is operating normally right now. Nothing to explain.`,
        meta: {
          asset_id: assetId,
          scope: 'asset' as const,
          used_bedrock: false,
          confidence: 'matched' as const,
        },
      }
    }

    const context = buildRiskContext(assetId, state, incident)

    const prompt = `You are a maintenance copilot speaking aloud to an operator. Be brief and direct.
Rules: 2-3 short sentences, under 35 words, no bullet points, no markdown. Name the root cause, cite 1-2 signals, state severity. Do not repeat yourself — each sentence must add new information.
Example for critical: "R-1 shows progressive joint degradation. Position error is far above baseline and temperature is rising. The asset is in critical condition."
Example for elevated: "R-8 is elevated due to thermal stress. Temperature is above baseline, but the asset is still stable."`

    const response = await this.bedrock.generateResponse(prompt, context)

    const severity =
      incident?.severity ?? (state?.risk_state === 'critical' ? 'critical' : 'warning')
    return {
      intentName,
      message: response.text,
      speechContext: {
        severity,
        intentName,
        hasIncident: !!incident,
      },
      meta: {
        asset_id: assetId,
        scope: 'asset' as const,
        used_bedrock: true,
        confidence: 'matched' as const,
        bedrock_model_id: response.model_id,
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    }
  }
}
