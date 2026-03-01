import { Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import type { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import type { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import type { IncidentAdapter } from '../adapters/incident.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class ExplainRiskHandler implements IntentHandler {
  private readonly logger = new Logger(ExplainRiskHandler.name)

  constructor(
    private readonly assetState: AssetStateAdapter,
    private readonly incidents: IncidentAdapter,
    private readonly bedrock: ConversationBedrockAdapter
  ) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const assetId = event.sessionState.intent.slots.asset_id?.value?.interpretedValue
    const intentName = event.sessionState.intent.name

    if (!assetId) {
      return {
        intentName,
        message: 'Which robot do you need explained? Try giving me an ID like R-17.',
      }
    }

    const state = await this.assetState.getAssetState(assetId)
    const incident = await this.incidents.findActiveIncident(assetId)

    if (!state && !incident) {
      return {
        intentName,
        message: `I couldn't find any data or incidents for ${assetId}.`,
      }
    }

    if (state?.risk_state === 'nominal' && !incident) {
      return {
        intentName,
        message: `${assetId} is operating normally right now. Nothing to explain.`,
      }
    }

    const context = `
Asset ID: ${assetId}
Risk State: ${state?.risk_state || 'unknown'}
Threshold Breach: ${state?.threshold_breach || 0}
Signal Values: ${JSON.stringify(state?.last_values || {})}
Z-Scores: ${JSON.stringify(state?.z_scores || {})}
Active Incident Root Cause: ${incident?.root_cause || 'None'}
Incident Severity: ${incident?.severity || 'None'}
    `

    const prompt = `You are a maintenance copilot for a robotic fleet.
The user is asking you to explain the risk surrounding ${assetId}. Speak concisely like a helpful colleague. Use plain language, not technical jargon. Keep responses under 3 sentences unless asked for detail.
Explain why the asset is at risk by referencing the specific signals and the incident root cause.`

    const message = await this.bedrock.generateResponse(prompt, context)

    const severity =
      incident?.severity ?? (state?.risk_state === 'critical' ? 'critical' : 'warning')
    return {
      intentName,
      message,
      speechContext: {
        severity,
        intentName,
        hasIncident: !!incident,
      },
    }
  }
}
