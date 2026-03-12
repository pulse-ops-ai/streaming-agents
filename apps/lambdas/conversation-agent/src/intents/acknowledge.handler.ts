import { Inject, Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import { IncidentAdapter } from '../adapters/incident.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class AcknowledgeIncidentHandler implements IntentHandler {
  private readonly logger = new Logger(AcknowledgeIncidentHandler.name)

  constructor(@Inject(IncidentAdapter) private readonly incidents: IncidentAdapter) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const slot = event.sessionState.intent.slots.asset_id?.value
    const assetId = slot?.resolvedValues?.[0] ?? slot?.interpretedValue
    const intentName = event.sessionState.intent.name

    if (!assetId) {
      return {
        intentName,
        message: "Which robot's alert are you acknowledging? Try giving me an ID like R-17.",
        meta: { scope: 'asset' as const, used_bedrock: false, confidence: 'no_data' as const },
      }
    }

    const incident = await this.incidents.findActiveIncident(assetId)

    if (!incident) {
      return {
        intentName,
        message: `There's no active incident for ${assetId} to acknowledge.`,
        meta: {
          asset_id: assetId,
          scope: 'asset' as const,
          used_bedrock: false,
          confidence: 'no_data' as const,
        },
      }
    }

    const timestamp = new Date().toISOString()
    await this.incidents.acknowledgeIncident(incident.incident_id, timestamp)

    return {
      intentName,
      message: `Incident acknowledged for ${assetId}. I'll keep monitoring for further changes.`,
      speechContext: {
        severity: 'info',
        intentName,
        hasIncident: true,
      },
      meta: {
        asset_id: assetId,
        scope: 'asset' as const,
        used_bedrock: false,
        confidence: 'matched' as const,
      },
    }
  }
}
