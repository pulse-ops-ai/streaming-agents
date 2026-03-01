import { Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import type { IncidentAdapter } from '../adapters/incident.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class AcknowledgeIncidentHandler implements IntentHandler {
  private readonly logger = new Logger(AcknowledgeIncidentHandler.name)

  constructor(private readonly incidents: IncidentAdapter) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const assetId = event.sessionState.intent.slots.asset_id?.value?.interpretedValue
    const intentName = event.sessionState.intent.name

    if (!assetId) {
      return {
        intentName,
        message: "Which robot's alert are you acknowledging? Try giving me an ID like R-17.",
      }
    }

    const incident = await this.incidents.findActiveIncident(assetId)

    if (!incident) {
      return {
        intentName,
        message: `There's no active incident for ${assetId} to acknowledge.`,
      }
    }

    const timestamp = new Date().toISOString()
    await this.incidents.acknowledgeIncident(incident.incident_id, timestamp)

    return {
      intentName,
      message: `Got it. I've logged your acknowledgment for the ${incident.severity} incident on ${assetId}.`,
      speechContext: {
        severity: 'info',
        intentName,
        hasIncident: true,
      },
    }
  }
}
