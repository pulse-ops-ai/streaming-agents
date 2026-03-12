import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { Controller, Get, Inject, Logger, Query } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** Map intent names to natural-language user input for display. */
const INTENT_TO_INPUT: Record<string, string> = {
  AssetStatus: 'Check asset status',
  FleetOverview: 'Fleet overview',
  ExplainRisk: 'Explain risk factors',
  RecommendAction: 'Recommend action',
  AcknowledgeIncident: 'Acknowledge incident',
  FallbackIntent: 'General question',
}

@Controller('api/conversations')
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name)
  private readonly logs: CloudWatchLogsClient
  private readonly logGroupName: string

  constructor(@Inject(ConfigService) config: ConfigService) {
    const region = config.get('AWS_REGION') || 'us-east-1'
    this.logs = new CloudWatchLogsClient({ region })
    this.logGroupName =
      config.get<string>('CONVERSATION_LOG_GROUP') ??
      '/aws/lambda/streaming-agents-conversation-agent'
  }

  @Get('recent')
  async getRecentConversations(@Query('limit') limitStr?: string) {
    const limit = Math.min(Number(limitStr) || 10, 25)

    try {
      const response = await this.logs.send(
        new FilterLogEventsCommand({
          logGroupName: this.logGroupName,
          filterPattern: '{ $.event_name = "conversation.response_generated" }',
          startTime: Date.now() - 24 * 60 * 60 * 1000, // last 24 hours
          limit,
          interleaved: true,
        })
      )

      const conversations = (response.events ?? [])
        .map((event) => {
          try {
            const data = JSON.parse(event.message ?? '{}')
            const intent = data.intent_name_resolved ?? 'Unknown'
            return {
              timestamp: new Date(event.timestamp ?? Date.now()).toISOString(),
              intent,
              user_input: data.transcript_text ?? INTENT_TO_INPUT[intent] ?? intent,
              response_summary: data.response_summary ?? '',
            }
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .reverse()

      return { conversations }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch conversation logs: ${err instanceof Error ? err.message : 'unknown'}`
      )
      return { conversations: [] }
    }
  }
}
