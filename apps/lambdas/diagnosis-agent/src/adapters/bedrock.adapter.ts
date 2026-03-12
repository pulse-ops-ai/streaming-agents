import { type BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

export interface BedrockInvokeResult {
  text: string
  promptTokens: number
  completionTokens: number
}

export interface BedrockAdapterConfig {
  modelId: string
  maxTokens: number
  temperature: number
}

/**
 * Adapter for Amazon Bedrock model invocation.
 * Injectable via NestJS DI for testability.
 */
export class BedrockAdapter {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly config: BedrockAdapterConfig
  ) {}

  async invokeModel(prompt: { system: string; user: string }): Promise<BedrockInvokeResult> {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    })

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.config.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body),
      })
    )

    const responseBody = JSON.parse(new TextDecoder().decode(response.body))

    const text = responseBody.content?.[0]?.text ?? responseBody.completion ?? ''

    return {
      text,
      promptTokens: responseBody.usage?.input_tokens ?? 0,
      completionTokens: responseBody.usage?.output_tokens ?? 0,
    }
  }
}
