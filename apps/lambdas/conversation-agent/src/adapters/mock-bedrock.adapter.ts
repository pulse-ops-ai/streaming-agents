import { Injectable, Logger } from '@nestjs/common'
import type { TelemetryService } from '@streaming-agents/core-telemetry'
import type { ConversationBedrockAdapter } from './bedrock.adapter.js'

@Injectable()
export class MockBedrockAdapter implements ConversationBedrockAdapter {
  private readonly logger = new Logger(MockBedrockAdapter.name)

  constructor(private readonly telemetry: TelemetryService) {}

  async generateResponse(systemPrompt: string, userContext: string): Promise<string> {
    const span = this.telemetry.startSpan('conversation.bedrock.invoke')

    try {
      span.setAttribute('bedrock.model_id', 'mock-claude')
      this.logger.debug('Using mock bedrock response based on context')

      let textResponse = 'This is a mock response because Bedrock is not available locally.'

      // Determine what to return based on context strings that intent handlers actually pass.
      // Returns plain text — SSML is now generated centrally by enhanceForSpeech().
      if (userContext.includes('Incident Status:')) {
        // RecommendActionHandler context
        textResponse =
          'I recommend you throttle the operational speed by 25% and schedule a bearing replacement for the next shift.'
      } else if (userContext.includes('Z-Scores:')) {
        // ExplainRiskHandler context
        textResponse =
          'The joint friction has steadily climbed past 2 standard deviations resulting in a warning threshold breach. It looks like bearing wear.'
      } else if (userContext.includes('Elevated/Critical Assets Count:')) {
        // FleetOverviewHandler context
        textResponse =
          'I am seeing alerts on 3 assets. R-17 is critical due to pressure seal degradation. R-50 and R-99 are showing elevated temperatures.'
      } else if (userContext.includes('Risk State:')) {
        // AssetStatusHandler context
        textResponse =
          'The asset is showing critical anomalies in the pressure seals. You should investigate immediately.'
      }

      span.setAttribute('bedrock.prompt_tokens', 100)
      span.setAttribute('bedrock.completion_tokens', 50)

      return textResponse
    } finally {
      span.end()
    }
  }
}
