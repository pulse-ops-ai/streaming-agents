export abstract class ConversationBedrockAdapter {
  abstract generateResponse(systemPrompt: string, userContext: string): Promise<string>
}
