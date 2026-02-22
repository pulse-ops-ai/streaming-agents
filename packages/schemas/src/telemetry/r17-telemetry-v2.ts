import { z } from 'zod'

/**
 * r17.telemetry.v2 — Telemetry event schema for real Reachy-Mini hardware.
 *
 * Extends the v1 envelope with IMU-derived metrics, daemon control loop stats,
 * and board temperature. IMU fields are nullable because the reachy_mini SDK
 * may not be installed on all hosts.
 */

export const TelemetrySourceV2Enum = z.enum([
  'simulator',
  'reachy-daemon',
  'reachy-sdk',
  'reachy-exporter',
  'replay',
])

export type TelemetrySourceV2 = z.infer<typeof TelemetrySourceV2Enum>

export const ControlModeEnum = z.enum(['idle', 'compliant', 'stiff', 'unknown'])

export type ControlMode = z.infer<typeof ControlModeEnum>

export const ControlLoopStatsSchema = z
  .object({
    /** Mean control loop frequency in Hz. */
    freq_hz: z.number().nonnegative(),

    /** Maximum control loop interval in milliseconds. */
    max_interval_ms: z.number().nonnegative(),

    /** Cumulative error count from the control loop. */
    error_count: z.number().int().nonnegative(),
  })
  .strict()

export type ControlLoopStats = z.infer<typeof ControlLoopStatsSchema>

export const R17TelemetryEventV2Schema = z
  .object({
    /** Fixed schema version identifier. */
    schema_version: z.literal('r17.telemetry.v2'),

    /** Unique event identifier (ULID). */
    event_id: z.string().min(1),

    /** Asset identifier. Locked to "r-17" for MVP. */
    asset_id: z.literal('r-17'),

    /** ISO 8601 UTC timestamp of the measurement. */
    timestamp: z.string().datetime({ offset: true }),

    /** Origin of this telemetry reading. */
    source: TelemetrySourceV2Enum,

    /** Monotonically increasing sequence number per source. */
    sequence: z.number().int().nonnegative(),

    /** Sampling rate in Hz. Must be positive. */
    sampling_hz: z.number().positive(),

    // ── Signals ──────────────────────────────────────────

    /** Absolute positional deviation at the monitored joint in degrees. */
    joint_position_error_deg: z.number().nonnegative(),

    /** Board temperature in degrees Celsius. Null if unavailable. */
    board_temperature_c: z.number().nullable().default(null),

    /** Accelerometer magnitude in m/s² (vibration proxy). Null if IMU unavailable. */
    accel_magnitude_ms2: z.number().nonnegative().nullable().default(null),

    /** Gyroscope magnitude in rad/s (rotational instability proxy). Null if IMU unavailable. */
    gyro_magnitude_rads: z.number().nonnegative().nullable().default(null),

    /** Current control mode of the robot. Null if unavailable. */
    control_mode: ControlModeEnum.nullable().default(null),

    /** Daemon control loop statistics. Null if unavailable. */
    control_loop_stats: ControlLoopStatsSchema.nullable().default(null),

    /** Rare discrete fault code. Null when no fault is active. */
    error_code: z.string().nullable().default(null),
  })
  .strict()

export type R17TelemetryEventV2 = z.infer<typeof R17TelemetryEventV2Schema>
