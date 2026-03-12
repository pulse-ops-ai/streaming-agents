import { Injectable, Logger } from '@nestjs/common'
import type { TelemetryService } from '@streaming-agents/core-telemetry'
import type { BedrockResponse, ConversationBedrockAdapter } from './bedrock.adapter.js'

@Injectable()
export class MockBedrockAdapter implements ConversationBedrockAdapter {
  private readonly logger = new Logger(MockBedrockAdapter.name)

  constructor(private readonly telemetry: TelemetryService) {}

  async generateResponse(systemPrompt: string, userContext: string): Promise<BedrockResponse> {
    const span = this.telemetry.startSpan('conversation.bedrock.invoke')

    try {
      span.setAttribute('bedrock.model_id', 'mock-claude')
      this.logger.debug('Using mock bedrock response based on context')

      let text = 'This is a mock response because Bedrock is not available locally.'

      // Determine what to return based on context strings that intent handlers actually pass.
      // Returns plain text — SSML is now generated centrally by enhanceForSpeech().
      if (userContext.includes('Incident Status:')) {
        // RecommendActionHandler context
        text =
          'Schedule an actuator inspection immediately and reduce operational load until the issue is addressed.'
      } else if (userContext.includes('Active Incident Root Cause:')) {
        // ExplainRiskHandler context
        text =
          'R-17 shows progressive joint degradation. Position error is far above baseline and temperature is rising. The asset is in critical condition.'
      } else if (userContext.includes('At-risk')) {
        // FleetOverviewHandler context
        text =
          'Three of five robots need attention. R-17 is critical with joint drift and rising temperature. R-50 and R-99 are elevated. The rest are nominal.'
      } else if (userContext.includes('Risk State:')) {
        // AssetStatusHandler context
        text =
          'R-17 is critical. Joint position drift is well above baseline and temperature is rising.'
      }

      span.setAttribute('bedrock.prompt_tokens', 100)
      span.setAttribute('bedrock.completion_tokens', 50)

      return {
        text,
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        model_id: 'mock-claude',
      }
    } finally {
      span.end()
    }
  }
}
