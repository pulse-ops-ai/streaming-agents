import type { SQSClient } from '@aws-sdk/client-sqs'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import type { DLQMessage } from '@streaming-agents/core-contracts'
import type { TelemetryService } from '@streaming-agents/core-telemetry'
import type { BuildDLQMessageOpts } from './types.js'

export class DLQPublisher {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly telemetry: TelemetryService
  ) {}

  async sendToDLQ(message: DLQMessage): Promise<void> {
    const span = this.telemetry.startSpan('dlq.publish', {
      'dlq.queue_url': this.queueUrl,
      'dlq.error_code': message.error_code,
      'dlq.service': message.service,
    })

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(message),
        })
      )
      this.telemetry.increment('dlq.messages_sent', {
        error_code: message.error_code,
        service: message.service,
      })
    } catch (error) {
      span.recordException(error as Error)
      throw error
    } finally {
      span.end()
    }
  }

  buildDLQMessage(opts: BuildDLQMessageOpts): DLQMessage {
    return {
      error_code: opts.errorCode,
      error_message: opts.errorMessage,
      error_details: opts.errorDetails,
      original_record: opts.originalRecord,
      source_stream: opts.sourceStream,
      source_partition: opts.sourcePartition,
      source_sequence: opts.sourceSequence,
      failed_at: new Date().toISOString(),
      service: opts.service,
    }
  }
}
