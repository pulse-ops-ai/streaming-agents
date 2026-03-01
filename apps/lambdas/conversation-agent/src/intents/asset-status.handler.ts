import { Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import type { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import type { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class AssetStatusHandler implements IntentHandler {
  private readonly logger = new Logger(AssetStatusHandler.name)

  constructor(
    private readonly assetState: AssetStateAdapter,
    private readonly bedrock: ConversationBedrockAdapter
  ) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const assetId = event.sessionState.intent.slots.asset_id?.value?.interpretedValue

    if (!assetId) {
      return {
        intentName: event.sessionState.intent.name,
        message: 'Which robot are you asking about? Try giving me an ID like R-17.',
      }
    }

    const state = await this.assetState.getAssetState(assetId)

    if (!state) {
      return {
        intentName: event.sessionState.intent.name,
        message: `I don't have any data for ${assetId}. Are you sure that's the right robot?`,
      }
    }

    if (state.risk_state === 'nominal') {
      return {
        intentName: event.sessionState.intent.name,
        message: `${assetId} is operating normally. All signals are within expected ranges.`,
      }
    }

    // Anomalous path: ask Bedrock to explain the alert status naturally
    const context = `
Asset ID: ${assetId}
Risk State: ${state.risk_state}
Composite Risk Score: ${state.composite_risk}
Threshold Breach Metric: ${state.threshold_breach}
Signal Values: ${JSON.stringify(state.last_values)}
    `

    const prompt = `You are a maintenance copilot for a robotic fleet.
The user is asking about the status of ${assetId}. Speak concisely like a helpful colleague. Use plain language, not technical jargon. Keep responses under 3 sentences unless the operator asks for detail.
If the state is elevated or critical, highlight the likely cause based on the signals provided.`

    const message = await this.bedrock.generateResponse(prompt, context)

    return {
      intentName: event.sessionState.intent.name,
      message,
      speechContext: {
        severity: state.risk_state === 'critical' ? 'critical' : 'warning',
        intentName: event.sessionState.intent.name,
        hasIncident: false,
      },
    }
  }
}
