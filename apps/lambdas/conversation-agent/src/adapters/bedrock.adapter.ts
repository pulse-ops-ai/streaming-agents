export interface BedrockUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface BedrockResponse {
  text: string
  usage?: BedrockUsage
  model_id?: string
}

export abstract class ConversationBedrockAdapter {
  abstract generateResponse(systemPrompt: string, userContext: string): Promise<BedrockResponse>
}
