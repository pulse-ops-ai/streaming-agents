import { Inject, Injectable, Logger } from '@nestjs/common'
import type { LexFulfillmentRequest } from '@streaming-agents/core-contracts'
import { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import { ConversationBedrockAdapter } from '../adapters/bedrock.adapter.js'
import type { ResponseInput } from '../lex/response-builder.js'
import type { IntentHandler } from './intent.handler.js'

@Injectable()
export class FleetOverviewHandler implements IntentHandler {
  private readonly logger = new Logger(FleetOverviewHandler.name)

  constructor(
    @Inject(AssetStateAdapter) private readonly assetState: AssetStateAdapter,
    @Inject(ConversationBedrockAdapter) private readonly bedrock: ConversationBedrockAdapter
  ) {}

  async handle(event: LexFulfillmentRequest): Promise<ResponseInput> {
    const assets = await this.assetState.scanAllAssets()

    if (assets.length === 0) {
      return {
        intentName: event.sessionState.intent.name,
        message: 'There are no active robots in the fleet tracking system currently.',
        meta: { scope: 'fleet' as const, used_bedrock: false, confidence: 'no_data' as const },
      }
    }

    const nonNominal = assets.filter((a) => a.risk_state !== 'nominal')

    if (nonNominal.length === 0) {
      return {
        intentName: event.sessionState.intent.name,
        message: `All ${assets.length} robots are operating normally. No alerts.`,
        meta: { scope: 'fleet' as const, used_bedrock: false, confidence: 'matched' as const },
      }
    }

    const nominal = assets.filter((a) => a.risk_state === 'nominal')
    const context = `
Total assets: ${assets.length}
Nominal (${nominal.length}): ${nominal.map((a) => a.asset_id).join(', ') || 'none'}
At-risk (${nonNominal.length}):
${nonNominal
  .map((a) => {
    const vals = a.last_values ?? {}
    return `- ${a.asset_id}: ${a.risk_state} (score ${(a.composite_risk ?? 0).toFixed(2)}), signals: temp=${(vals.board_temperature_c ?? 0).toFixed(1)}°C, posErr=${(vals.joint_position_error_deg ?? 0).toFixed(2)}°, accel=${(vals.accel_magnitude_ms2 ?? 0).toFixed(1)}m/s²`
  })
  .join('\n')}
    `

    const prompt = `You are a maintenance copilot speaking to an operator. Respond briefly, clearly, and naturally for voice.
Use 2 to 4 short sentences.
Keep the response under 45 words when possible.
Lead with the fleet summary first.
Then name the most urgent asset and its issue.
Then summarize any other at-risk assets.
If the remaining assets are normal, say so in one short sentence.
Do not elaborate. Do not explain the scoring formula. Do not list unnecessary signal details.
Example: "Three of five robots need attention. R-1 is critical with joint drift and rising temperature. R-8 and R-2 are elevated. R-17 and R-50 are operating normally."`

    const response = await this.bedrock.generateResponse(prompt, context)

    const hasCritical = nonNominal.some((a) => a.risk_state === 'critical')
    return {
      intentName: event.sessionState.intent.name,
      message: response.text,
      speechContext: {
        severity: hasCritical ? 'critical' : 'warning',
        intentName: event.sessionState.intent.name,
        hasIncident: nonNominal.length > 0,
      },
      meta: {
        scope: 'fleet' as const,
        used_bedrock: true,
        confidence: 'matched' as const,
        at_risk_asset_count: nonNominal.length,
        bedrock_model_id: response.model_id,
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    }
  }
}
