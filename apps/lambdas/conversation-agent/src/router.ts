import { Inject, Injectable, Logger } from '@nestjs/common'
import type {
  LexFulfillmentRequest,
  LexFulfillmentResponse,
} from '@streaming-agents/core-contracts'
import { TELEMETRY, type TelemetryService } from '@streaming-agents/core-telemetry'

import { AcknowledgeIncidentHandler } from './intents/acknowledge.handler.js'
import { AssetStatusHandler } from './intents/asset-status.handler.js'
import { ExplainRiskHandler } from './intents/explain-risk.handler.js'
import { FallbackHandler } from './intents/fallback.handler.js'
import { FleetOverviewHandler } from './intents/fleet-overview.handler.js'
import { RecommendActionHandler } from './intents/recommend-action.handler.js'
import { type ResponseInput, buildLexResponse } from './lex/response-builder.js'

@Injectable()
export class IntentRouter {
  private readonly logger = new Logger(IntentRouter.name)

  constructor(
    @Inject(AssetStatusHandler) private readonly assetStatus: AssetStatusHandler,
    @Inject(FleetOverviewHandler) private readonly fleetOverview: FleetOverviewHandler,
    @Inject(ExplainRiskHandler) private readonly explainRisk: ExplainRiskHandler,
    @Inject(RecommendActionHandler) private readonly recommendAction: RecommendActionHandler,
    @Inject(AcknowledgeIncidentHandler) private readonly acknowledge: AcknowledgeIncidentHandler,
    @Inject(FallbackHandler) private readonly fallback: FallbackHandler,
    @Inject(TELEMETRY) private readonly telemetry: TelemetryService
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
