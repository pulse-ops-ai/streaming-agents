import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DLQPublisher } from '../dlq.js'

function makeSQSClient(handler: (input: unknown) => unknown = () => ({})) {
  return { send: vi.fn(handler) } as never
}

function makeTelemetry() {
  return {
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      recordException: vi.fn(),
    })),
    increment: vi.fn(),
  } as never
}

describe('DLQPublisher', () => {
  let telemetry: ReturnType<typeof makeTelemetry>
  const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/r17-telemetry-dlq'

  beforeEach(() => {
    telemetry = makeTelemetry()
  })

  describe('sendToDLQ', () => {
    it('sends message to SQS with correct queue URL and body', async () => {
      const client = makeSQSClient()
      const publisher = new DLQPublisher(client, queueUrl, telemetry)

      const message = {
        error_code: 'SCHEMA_INVALID',
        error_message: 'Missing required field: asset_id',
        original_record: Buffer.from('raw data').toString('base64'),
        source_stream: 'r17-telemetry',
        source_partition: 'R-17',
        source_sequence: '12345',
        failed_at: '2025-01-01T00:00:00.000Z',
        service: 'ingestion',
      }

      await publisher.sendToDLQ(message)

      expect(client.send).toHaveBeenCalledTimes(1)
      const sentCommand = (client.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(sentCommand.input.QueueUrl).toBe(queueUrl)
      expect(JSON.parse(sentCommand.input.MessageBody)).toEqual(message)
    })

    it('increments dlq.messages_sent metric', async () => {
      const client = makeSQSClient()
      const publisher = new DLQPublisher(client, queueUrl, telemetry)

      await publisher.sendToDLQ({
        error_code: 'PARSE_FAILED',
        error_message: 'Invalid JSON',
        original_record: 'base64data',
        source_stream: 'r17-telemetry',
        source_partition: 'pk',
        source_sequence: '1',
        failed_at: '2025-01-01T00:00:00.000Z',
        service: 'ingestion',
      })

      expect(telemetry.increment).toHaveBeenCalledWith('dlq.messages_sent', {
        error_code: 'PARSE_FAILED',
        service: 'ingestion',
      })
    })

    it('rethrows SQS errors after recording exception on span', async () => {
      const sqsError = new Error('SQS send failed')
      const client = makeSQSClient(() => {
        throw sqsError
      })
      const publisher = new DLQPublisher(client, queueUrl, telemetry)

      await expect(
        publisher.sendToDLQ({
          error_code: 'UNKNOWN',
          error_message: 'test',
          original_record: '',
          source_stream: 's',
          source_partition: 'p',
          source_sequence: '1',
          failed_at: '2025-01-01T00:00:00.000Z',
          service: 'ingestion',
        })
      ).rejects.toThrow('SQS send failed')
    })
  })

  describe('buildDLQMessage', () => {
    it('returns a DLQMessage with all required fields', () => {
      const client = makeSQSClient()
      const publisher = new DLQPublisher(client, queueUrl, telemetry)

      const message = publisher.buildDLQMessage({
        errorCode: 'SCHEMA_INVALID',
        errorMessage: 'Missing asset_id',
        originalRecord: Buffer.from('raw').toString('base64'),
        sourceStream: 'r17-telemetry',
        sourcePartition: 'R-17',
        sourceSequence: '99',
        service: 'ingestion',
      })

      expect(message.error_code).toBe('SCHEMA_INVALID')
      expect(message.error_message).toBe('Missing asset_id')
      expect(message.original_record).toBe(Buffer.from('raw').toString('base64'))
      expect(message.source_stream).toBe('r17-telemetry')
      expect(message.source_partition).toBe('R-17')
      expect(message.source_sequence).toBe('99')
      expect(message.service).toBe('ingestion')
      expect(message.failed_at).toBeDefined()
      // Verify it's a valid ISO timestamp
      expect(Number.isNaN(Date.parse(message.failed_at))).toBe(false)
    })

    it('includes error_details when provided', () => {
      const client = makeSQSClient()
      const publisher = new DLQPublisher(client, queueUrl, telemetry)

      const zodErrors = [{ path: ['asset_id'], message: 'Required' }]
      const message = publisher.buildDLQMessage({
        errorCode: 'SCHEMA_INVALID',
        errorMessage: 'Validation failed',
        originalRecord: 'base64data',
        sourceStream: 'r17-telemetry',
        sourcePartition: 'pk',
        sourceSequence: '1',
        service: 'ingestion',
        errorDetails: zodErrors,
      })

      expect(message.error_details).toEqual(zodErrors)
    })

    it('omits error_details when not provided', () => {
      const client = makeSQSClient()
      const publisher = new DLQPublisher(client, queueUrl, telemetry)

      const message = publisher.buildDLQMessage({
        errorCode: 'PARSE_FAILED',
        errorMessage: 'Not JSON',
        originalRecord: 'data',
        sourceStream: 'r17-telemetry',
        sourcePartition: 'pk',
        sourceSequence: '1',
        service: 'ingestion',
      })

      expect(message.error_details).toBeUndefined()
    })
  })
})
