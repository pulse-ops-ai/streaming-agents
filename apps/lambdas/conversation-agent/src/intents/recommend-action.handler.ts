import { Inject, Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import { IncidentAdapter } from '../adapters/incident.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class RecommendActionHandler implements IntentHandler {
  private readonly logger = new Logger(RecommendActionHandler.name)

  constructor(
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
        message: 'Which robot do you want recommendations for? Try giving me an ID like R-17.',
        meta: { scope: 'asset' as const, used_bedrock: false, confidence: 'no_data' as const },
      }
    }

    const incident = await this.incidents.findActiveIncident(assetId)

    if (!incident) {
      return {
        intentName,
        message: `There's no active incident for ${assetId}. The robot seems fine.`,
        meta: {
          asset_id: assetId,
          scope: 'asset' as const,
          used_bedrock: false,
          confidence: 'no_data' as const,
        },
      }
    }

    const context = `
Asset ID: ${assetId}
Incident Status: ${incident.status}
Incident Severity: ${incident.severity}
Root Cause: ${incident.root_cause}
Active since: ${incident.opened_at}
    `

    const prompt = `You are a maintenance copilot speaking aloud to an operator. Be brief and direct.
Rules: 1-2 short sentences, under 25 words, no bullet points, no markdown. Give the immediate action and an optional follow-up.
Example for joint issue: "Schedule an actuator inspection immediately and reduce operational load until the issue is addressed."
Example for thermal: "Monitor closely and schedule a thermal inspection during the next maintenance window."
Example for vibration: "Inspect for vibration-related mechanical looseness and reduce unnecessary movement until checked."`

    const response = await this.bedrock.generateResponse(prompt, context)

    return {
      intentName,
      message: response.text,
      speechContext: {
        severity: incident.severity,
        intentName,
        hasIncident: true,
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
