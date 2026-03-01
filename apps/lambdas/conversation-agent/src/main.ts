import { type INestApplicationContext, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type {
  LexFulfillmentRequest,
  LexFulfillmentResponse,
} from '@streaming-agents/core-contracts'
import { TelemetryModule, TelemetryService } from '@streaming-agents/core-telemetry'

import { AssetStateAdapter } from './adapters/asset-state.adapter.js'
import { BedrockModule } from './adapters/bedrock.module.js'
import { IncidentAdapter } from './adapters/incident.adapter.js'
import { IntentRouter } from './router.js'

import { AcknowledgeIncidentHandler } from './intents/acknowledge.handler.js'
import { AssetStatusHandler } from './intents/asset-status.handler.js'
import { ExplainRiskHandler } from './intents/explain-risk.handler.js'
import { FallbackHandler } from './intents/fallback.handler.js'
import { FleetOverviewHandler } from './intents/fleet-overview.handler.js'
import { RecommendActionHandler } from './intents/recommend-action.handler.js'

@Module({
  imports: [ConfigModule.forRoot(), TelemetryModule.forRoot('conversation-agent'), BedrockModule],
  providers: [
    IntentRouter,
    AssetStateAdapter,
    IncidentAdapter,
    AssetStatusHandler,
    FleetOverviewHandler,
    ExplainRiskHandler,
    RecommendActionHandler,
    AcknowledgeIncidentHandler,
    FallbackHandler,
  ],
})
export class ConversationAgentModule {}

// Cold start persistence
let app: INestApplicationContext

async function bootstrap() {
  if (!app) {
    app = await NestFactory.createApplicationContext(ConversationAgentModule, {
      logger: process.env.NODE_ENV === 'test' ? false : ['log', 'error', 'warn'],
    })
  }
  return app
}

/**
 * Amazon Lex V2 fulfillment Lambda Handler.
 * Synchronous request/response.
 */
export async function handler(event: LexFulfillmentRequest): Promise<LexFulfillmentResponse> {
  const context = await bootstrap()
  const router = context.get(IntentRouter)
  return router.route(event)
}
