import { randomUUID } from 'node:crypto'
import type {
  AssetState,
  BaselineStats,
  IngestedEvent,
  LastValues,
  RiskEvent,
  ZScores,
} from '@streaming-agents/core-contracts'
import type { KinesisProducer, KinesisStreamEvent } from '@streaming-agents/core-kinesis'
import type { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import {
  BaseLambdaHandler,
  type HandlerContext,
  type ProcessResult,
} from '@streaming-agents/lambda-base'
import type { AssetStateRepository } from './adapters/dynamodb.adapter.js'
import { computeAlpha, initBaselines, updateBaselines } from './baseline.js'
import {
  computeCompositeRisk,
  computeThresholdBreach,
  computeThresholdSeverity,
  computeZScore,
  determineRiskState,
  getContributingSignals,
} from './risk.js'

export interface SignalAgentConfig {
  serviceName: string
  outputStreamName: string
  emaWindow: number
  minStdDev: number
  normalizeDivisor: number
}

const SIGNAL_KEYS = [
  'board_temperature_c',
  'accel_magnitude_ms2',
  'gyro_magnitude_rads',
  'joint_position_error_deg',
] as const

export class SignalAgentHandler extends BaseLambdaHandler<KinesisStreamEvent, void> {
  private readonly alpha: number

  constructor(
    protected readonly config: SignalAgentConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
    private readonly repository: AssetStateRepository,
    private readonly producer: KinesisProducer
  ) {
    super(config, telemetry, logger)
    this.alpha = computeAlpha(config.emaWindow)
  }

  protected async process(
    event: KinesisStreamEvent,
    context: HandlerContext
  ): Promise<ProcessResult<void>> {
    for (const record of event.Records) {
      const raw = Buffer.from(record.kinesis.data, 'base64').toString('utf-8')
      const ingested: IngestedEvent = JSON.parse(raw)
      await this.processEvent(ingested, context)
    }
    return { status: 'success' }
  }

  private async processEvent(ingested: IngestedEvent, context: HandlerContext): Promise<void> {
    const { payload, trace_id, event_id } = ingested
    const assetId = payload.asset_id

    // Continue trace from ingestion (NOT a new root span)
    const span = this.telemetry.continueTrace(trace_id, 'signal-agent.process')

    try {
      // 1. Load asset state from DynamoDB
      const readSpan = this.telemetry.startSpan('signal-agent.dynamodb.read')
      const readStart = Date.now()
      let state = await this.repository.get(assetId)
      this.telemetry.timing('signal_agent.dynamodb_latency_ms', Date.now() - readStart, {
        operation: 'read',
      })
      readSpan.end()

      // 2. Compute z-scores and risk
      const computeSpan = this.telemetry.startSpan('signal-agent.compute')

      const signalValues = {
        board_temperature_c: payload.board_temperature_c,
        accel_magnitude_ms2: payload.accel_magnitude_ms2,
        gyro_magnitude_rads: payload.gyro_magnitude_rads,
        joint_position_error_deg: payload.joint_position_error_deg,
      }

      if (!state) {
        // Initialize state from first reading
        state = this.initializeState(assetId, signalValues, trace_id, event_id)
      } else {
        // Update baselines
        for (const key of SIGNAL_KEYS) {
          const value = signalValues[key]
          if (value !== null) {
            state.baselines[key] = updateBaselines(state.baselines[key], value, this.alpha)
          }
        }
        state.reading_count++
      }

      // Compute z-scores
      const zScores: ZScores = {
        position_error_z: computeZScore(
          signalValues.joint_position_error_deg,
          state.baselines.joint_position_error_deg.mean,
          state.baselines.joint_position_error_deg.std_dev,
          this.config.minStdDev
        ),
        accel_z: computeZScore(
          signalValues.accel_magnitude_ms2,
          state.baselines.accel_magnitude_ms2.mean,
          state.baselines.accel_magnitude_ms2.std_dev,
          this.config.minStdDev
        ),
        gyro_z: computeZScore(
          signalValues.gyro_magnitude_rads,
          state.baselines.gyro_magnitude_rads.mean,
          state.baselines.gyro_magnitude_rads.std_dev,
          this.config.minStdDev
        ),
        temperature_z: computeZScore(
          signalValues.board_temperature_c,
          state.baselines.board_temperature_c.mean,
          state.baselines.board_temperature_c.std_dev,
          this.config.minStdDev
        ),
      }

      // Compute threshold breach and composite risk
      const thresholdBreach = computeThresholdBreach(signalValues)
      const zscoreRisk = computeCompositeRisk(
        zScores,
        thresholdBreach,
        this.config.normalizeDivisor
      )
      // Threshold severity catches sustained degradation that EMA-based z-scores miss
      const thresholdSeverity = computeThresholdSeverity(signalValues)
      const compositeRisk = Math.max(zscoreRisk, thresholdSeverity)
      const riskState = determineRiskState(compositeRisk)

      computeSpan.end()

      // Build last_values
      const lastValues: LastValues = {
        board_temperature_c: signalValues.board_temperature_c ?? 0,
        accel_magnitude_ms2: signalValues.accel_magnitude_ms2 ?? 0,
        gyro_magnitude_rads: signalValues.gyro_magnitude_rads ?? 0,
        joint_position_error_deg: signalValues.joint_position_error_deg,
        control_loop_freq_hz: payload.control_loop_stats?.freq_hz ?? 0,
      }

      // Update state
      state.z_scores = zScores
      state.composite_risk = compositeRisk
      state.risk_state = riskState
      state.threshold_breach = thresholdBreach
      state.last_values = lastValues
      state.last_trace_id = trace_id
      state.last_event_id = event_id
      state.updated_at = new Date().toISOString()

      // 3. Write updated state to DynamoDB
      const writeSpan = this.telemetry.startSpan('signal-agent.dynamodb.write')
      const writeStart = Date.now()
      await this.repository.put(state)
      this.telemetry.timing('signal_agent.dynamodb_latency_ms', Date.now() - writeStart, {
        operation: 'write',
      })
      writeSpan.end()

      // 4. Emit risk event
      const emitSpan = this.telemetry.startSpan('signal-agent.emit')
      const contributingSignals = getContributingSignals(zScores)

      const riskEvent: RiskEvent = {
        event_id: randomUUID(),
        trace_id,
        asset_id: assetId,
        timestamp: new Date().toISOString(),
        composite_risk: compositeRisk,
        risk_state: riskState,
        z_scores: zScores,
        threshold_breach: thresholdBreach,
        contributing_signals: contributingSignals,
        last_values: lastValues,
      }

      await this.producer.putRecords([{ data: riskEvent, partitionKey: assetId }])
      emitSpan.end()

      // Metrics
      this.telemetry.increment('signal_agent.events_processed', { risk_state: riskState })
      this.telemetry.gauge('signal_agent.risk_score', compositeRisk, {
        asset_id: assetId,
        risk_state: riskState,
      })
    } finally {
      span.end()
    }
  }

  private initializeState(
    assetId: string,
    signals: {
      board_temperature_c: number | null
      accel_magnitude_ms2: number | null
      gyro_magnitude_rads: number | null
      joint_position_error_deg: number
    },
    traceId: string,
    eventId: string
  ): AssetState {
    const baselines: Record<string, BaselineStats> = {}
    for (const key of SIGNAL_KEYS) {
      baselines[key] = initBaselines(signals[key] ?? 0)
    }

    return {
      asset_id: assetId,
      updated_at: new Date().toISOString(),
      reading_count: 1,
      baselines,
      z_scores: { position_error_z: 0, accel_z: 0, gyro_z: 0, temperature_z: 0 },
      composite_risk: 0,
      risk_state: 'nominal',
      threshold_breach: 0,
      last_values: {
        board_temperature_c: signals.board_temperature_c ?? 0,
        accel_magnitude_ms2: signals.accel_magnitude_ms2 ?? 0,
        gyro_magnitude_rads: signals.gyro_magnitude_rads ?? 0,
        joint_position_error_deg: signals.joint_position_error_deg,
        control_loop_freq_hz: 0,
      },
      last_trace_id: traceId,
      last_event_id: eventId,
      last_diagnosis_at: null,
    }
  }
}
