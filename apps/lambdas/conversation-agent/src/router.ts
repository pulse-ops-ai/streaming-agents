import { Injectable, Logger } from '@nestjs/common'
import type {
  LexFulfillmentRequest,
  LexFulfillmentResponse,
} from '@streaming-agents/core-contracts'
import type { TelemetryService } from '@streaming-agents/core-telemetry'

import type { AcknowledgeIncidentHandler } from './intents/acknowledge.handler.js'
import type { AssetStatusHandler } from './intents/asset-status.handler.js'
import type { ExplainRiskHandler } from './intents/explain-risk.handler.js'
import type { FallbackHandler } from './intents/fallback.handler.js'
import type { FleetOverviewHandler } from './intents/fleet-overview.handler.js'
import type { RecommendActionHandler } from './intents/recommend-action.handler.js'
import { type ResponseInput, buildLexResponse } from './lex/response-builder.js'

@Injectable()
export class IntentRouter {
  private readonly logger = new Logger(IntentRouter.name)

  constructor(
    private readonly assetStatus: AssetStatusHandler,
    private readonly fleetOverview: FleetOverviewHandler,
    private readonly explainRisk: ExplainRiskHandler,
    private readonly recommendAction: RecommendActionHandler,
    private readonly acknowledge: AcknowledgeIncidentHandler,
    private readonly fallback: FallbackHandler,
    private readonly telemetry: TelemetryService
  ) {}

  async route(event: LexFulfillmentRequest): Promise<LexFulfillmentResponse> {
    const span = this.telemetry.startSpan('conversation.fulfill')

    try {
      const intentName = event.sessionState.intent.name
      span.setAttribute('lex.intent.name', intentName)

      let responseInput: ResponseInput
      switch (intentName) {
        case 'AssetStatus':
          responseInput = await this.assetStatus.handle(event)
          break
        case 'FleetOverview':
          responseInput = await this.fleetOverview.handle(event)
          break
        case 'ExplainRisk':
          responseInput = await this.explainRisk.handle(event)
          break
        case 'RecommendAction':
          responseInput = await this.recommendAction.handle(event)
          break
        case 'AcknowledgeIncident':
          responseInput = await this.acknowledge.handle(event)
          break
        default:
          responseInput = await this.fallback.handle(event)
          break
      }

      const formatSpan = this.telemetry.startSpan('conversation.format-response')
      try {
        return buildLexResponse(responseInput)
      } finally {
        formatSpan.end()
      }
    } catch (error) {
      this.logger.error('Error routing intent', error)
      span.recordException(error as Error)

      // Return a safe Lex response so the bot doesn't hang ungracefully
      return buildLexResponse({
        intentName: event.sessionState.intent.name,
        message: 'Sorry, I encountered an internal error processing your request.',
      })
    } finally {
      span.end()
    }
  }
}
