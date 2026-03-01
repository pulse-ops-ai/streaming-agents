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
    const assetId = event.sessionState.intent.slots.asset_id?.value?.interpretedValue
    const intentName = event.sessionState.intent.name

    if (!assetId) {
      return {
        intentName,
        message: 'Which robot do you want recommendations for? Try giving me an ID like R-17.',
      }
    }

    const incident = await this.incidents.findActiveIncident(assetId)

    if (!incident) {
      return {
        intentName,
        message: `There's no active incident for ${assetId}. The robot seems fine.`,
      }
    }

    const context = `
Incident Status: ${incident.status}
Incident Severity: ${incident.severity}
Root Cause: ${incident.root_cause}
Active since: ${incident.opened_at}
    `

    const prompt = `You are a maintenance copilot for a robotic fleet.
The user is asking for recommended actions to resolve an active anomaly on ${assetId}. Speak concisely like a helpful colleague. Use plain language, not technical jargon. Keep responses under 3 sentences.
Based on the root cause and severity, recommend the specific next steps to the operator.`

    const message = await this.bedrock.generateResponse(prompt, context)

    return {
      intentName,
      message,
      speechContext: {
        severity: incident.severity,
        intentName,
        hasIncident: true,
      },
    }
  }
}
