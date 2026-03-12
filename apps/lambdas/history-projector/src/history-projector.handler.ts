import type { RiskEvent } from '@streaming-agents/core-contracts'
import type { KinesisStreamEvent } from '@streaming-agents/core-kinesis'
import type { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import {
  BaseLambdaHandler,
  type HandlerContext,
  type LambdaConfig,
  type ProcessResult,
} from '@streaming-agents/lambda-base'
import type { HistoryRepository, HistoryRow } from './adapters/dynamodb.adapter.js'

export interface HistoryProjectorConfig extends LambdaConfig {
  ttlHours: number
}

export class HistoryProjectorHandler extends BaseLambdaHandler<KinesisStreamEvent, void> {
  constructor(
    protected readonly config: HistoryProjectorConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly repository: HistoryRepository
  ) {
    super(config, telemetry, logger)
  }

  protected async process(
    event: KinesisStreamEvent,
    _context: HandlerContext
  ): Promise<ProcessResult<void>> {
    const rows: HistoryRow[] = []
    const ttlSeconds = this.config.ttlHours * 3600
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds

    for (const record of event.Records) {
      const raw = Buffer.from(record.kinesis.data, 'base64').toString('utf-8')
      const riskEvent: RiskEvent = JSON.parse(raw)

      rows.push({
        asset_id: riskEvent.asset_id,
        timestamp: riskEvent.timestamp,
        composite_risk: riskEvent.composite_risk,
        risk_state: riskEvent.risk_state,
        z_scores: {
          position_error_z: riskEvent.z_scores.position_error_z,
          accel_z: riskEvent.z_scores.accel_z,
          gyro_z: riskEvent.z_scores.gyro_z,
          temperature_z: riskEvent.z_scores.temperature_z,
        },
        last_values: {
          board_temperature_c: riskEvent.last_values.board_temperature_c,
          accel_magnitude_ms2: riskEvent.last_values.accel_magnitude_ms2,
          gyro_magnitude_rads: riskEvent.last_values.gyro_magnitude_rads,
          joint_position_error_deg: riskEvent.last_values.joint_position_error_deg,
          control_loop_freq_hz: riskEvent.last_values.control_loop_freq_hz,
        },
        threshold_breach: riskEvent.threshold_breach,
        contributing_signals: riskEvent.contributing_signals,
        expires_at: expiresAt,
      })
    }

    if (rows.length === 0) {
      return { status: 'skip', reason: 'empty batch' }
    }

    const writeSpan = this.telemetry.startSpan('history-projector.dynamodb.batch-write')
    const writeStart = Date.now()

    await this.repository.batchWrite(rows)

    this.telemetry.timing('history_projector.dynamodb_latency_ms', Date.now() - writeStart)
    writeSpan.end()

    this.telemetry.gauge('history_projector.batch_size', rows.length)
    this.logger.log('Projected history rows', {
      count: rows.length,
      assets: [...new Set(rows.map((r) => r.asset_id))],
    })

    return { status: 'success' }
  }
}
