import { Inject, Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class AssetStatusHandler implements IntentHandler {
  private readonly logger = new Logger(AssetStatusHandler.name)

  constructor(
    @Inject(AssetStateAdapter) private readonly assetState: AssetStateAdapter,
    @Inject(ConversationBedrockAdapter) private readonly bedrock: ConversationBedrockAdapter
  ) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const slot = event.sessionState.intent.slots.asset_id?.value
    const assetId = slot?.resolvedValues?.[0] ?? slot?.interpretedValue

    if (!assetId) {
      return {
        intentName: event.sessionState.intent.name,
        message: 'Which robot are you asking about? Try giving me an ID like R-17.',
        meta: { scope: 'asset' as const, used_bedrock: false, confidence: 'no_data' as const },
      }
    }

    const state = await this.assetState.getAssetState(assetId)

    if (!state) {
      return {
        intentName: event.sessionState.intent.name,
        message: `I don't have any data for ${assetId}. Are you sure that's the right robot?`,
        meta: {
          asset_id: assetId,
          scope: 'asset' as const,
          used_bedrock: false,
          confidence: 'no_data' as const,
        },
      }
    }

    if (state.risk_state === 'nominal') {
      return {
        intentName: event.sessionState.intent.name,
        message: `${assetId} is operating normally. Risk is low and telemetry is within expected range.`,
        meta: {
          asset_id: assetId,
          scope: 'asset' as const,
          used_bedrock: false,
          confidence: 'matched' as const,
        },
      }
    }

    // Anomalous path: ask Bedrock to explain the alert status naturally
    const vals = state.last_values ?? {}
    const context = `
Asset ID: ${assetId}
Risk State: ${state.risk_state}
Composite Risk Score: ${(state.composite_risk ?? 0).toFixed(2)}
Board Temperature: ${(vals.board_temperature_c ?? 0).toFixed(1)}°C
Joint Position Error: ${(vals.joint_position_error_deg ?? 0).toFixed(2)}°
Accelerometer: ${(vals.accel_magnitude_ms2 ?? 0).toFixed(2)} m/s²
Control Loop Frequency: ${(vals.control_loop_freq_hz ?? 0).toFixed(1)} Hz
Threshold Breach: ${state.threshold_breach}
    `

    const prompt = `You are a maintenance copilot speaking aloud to an operator. Be brief and direct.
Rules: 1-2 short sentences, under 25 words, no bullet points, no markdown. State the risk level and the key abnormal signal.
Example for critical: "R-1 is critical. Joint position drift is well above baseline and temperature is rising."
Example for elevated: "R-8 is elevated. Temperature is above baseline and the control loop is slowing down."`

    const response = await this.bedrock.generateResponse(prompt, context)

    return {
      intentName: event.sessionState.intent.name,
      message: response.text,
      speechContext: {
        severity: state.risk_state === 'critical' ? 'critical' : 'warning',
        intentName: event.sessionState.intent.name,
        hasIncident: false,
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
