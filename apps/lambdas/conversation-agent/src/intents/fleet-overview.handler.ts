import { Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import type { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import type { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class FleetOverviewHandler implements IntentHandler {
  private readonly logger = new Logger(FleetOverviewHandler.name)

  constructor(
    private readonly assetState: AssetStateAdapter,
    private readonly bedrock: ConversationBedrockAdapter
  ) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const assets = await this.assetState.scanAllAssets()

    if (assets.length === 0) {
      return {
        intentName: event.sessionState.intent.name,
        message: 'There are no active robots in the fleet tracking system currently.',
      }
    }

    const nonNominal = assets.filter((a) => a.risk_state !== 'nominal')

    if (nonNominal.length === 0) {
      return {
        intentName: event.sessionState.intent.name,
        message: `All ${assets.length} robots are operating normally. No alerts.`,
      }
    }

    const context = `
Nominal Assets Count: ${assets.length - nonNominal.length}
Elevated/Critical Assets Count: ${nonNominal.length}
Non-nominal details:
${nonNominal
  .map((a) => `- ${a.asset_id}: ${a.risk_state} risk (score: ${a.composite_risk.toFixed(2)})`)
  .join('\n')}
    `

    const prompt = `You are a maintenance copilot for a robotic fleet.
The operator is asking for a fleet overview.
Summarize the state of the fleet. Speak concisely like a helpful colleague in under 3 sentences.
Highlight the count of nominal vs at-risk assets, and name the specific at-risk assets.`

    const ssmlResponse = await this.bedrock.generateResponse(prompt, context)
    const plainText = ssmlResponse.replace(/<[^>]+>/g, '').trim()

    return {
      intentName: event.sessionState.intent.name,
      message: plainText,
      ssml: ssmlResponse.startsWith('<speak>') ? ssmlResponse : `<speak>${ssmlResponse}</speak>`,
    }
  }
}
