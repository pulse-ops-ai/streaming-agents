import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { Injectable, Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { TelemetryService } from '@streaming-agents/core-telemetry'
import type { BedrockResponse, ConversationBedrockAdapter } from './bedrock.adapter.js'

@Injectable()
export class LiveBedrockAdapter implements ConversationBedrockAdapter {
  private readonly logger = new Logger(LiveBedrockAdapter.name)
  private readonly client: BedrockRuntimeClient
  private readonly modelId: string

  constructor(
    private readonly config: ConfigService,
    private readonly telemetry: TelemetryService
  ) {
    this.client = new BedrockRuntimeClient({
      region: this.config.get('BEDROCK_REGION', 'us-east-1'),
    })
    this.modelId = this.config.get('BEDROCK_MODEL_ID', 'anthropic.claude-3-5-sonnet-20241022-v2:0')
  }

  async generateResponse(systemPrompt: string, userContext: string): Promise<BedrockResponse> {
    const span = this.telemetry.startSpan('conversation.bedrock.invoke')

    try {
      span.setAttribute('bedrock.model_id', this.modelId)

      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        temperature: 0.1, // Keep it relatively deterministic to favor technical precision
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userContext,
              },
            ],
          },
        ],
      }

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: Buffer.from(JSON.stringify(payload)),
      })

      this.logger.debug(`Invoking Bedrock model ${this.modelId} for conversation`)
      const response = await this.client.send(command)
      const responseBody = JSON.parse(new TextDecoder().decode(response.body))

      const text =
        responseBody.content?.[0]?.text ?? 'I experienced an error generating a response.'

      const inputTokens = responseBody.usage?.input_tokens ?? 0
      const outputTokens = responseBody.usage?.output_tokens ?? 0

      span.setAttribute('bedrock.prompt_tokens', inputTokens)
      span.setAttribute('bedrock.completion_tokens', outputTokens)

      return {
        text,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
        model_id: this.modelId,
      }
    } catch (error) {
      this.logger.error('Failed to invoke Bedrock', error)
      span.recordException(error as Error)
      throw error
    } finally {
      span.end()
    }
  }
}
