import { z } from 'zod'

/**
 * r17.telemetry.v1 — Canonical telemetry event schema for Robotic Unit R-17.
 *
 * Represents a single measurement reading from the R-17 asset (Reachy-Mini).
 * All numeric signals correspond to Joint 3 and its drive motor.
 */

export const TelemetrySourceEnum = z.enum(['simulator', 'reachy-daemon', 'reachy-sdk', 'replay'])

export type TelemetrySource = z.infer<typeof TelemetrySourceEnum>

export const R17TelemetryEventSchema = z
  .object({
    /** Fixed schema version identifier. */
    schema_version: z.literal('r17.telemetry.v1'),

    /** Unique event identifier (ULID or UUID). */
    event_id: z.string().min(1),

    /** Asset identifier. Locked to "r-17" for MVP. */
    asset_id: z.literal('r-17'),

    /** ISO 8601 UTC timestamp of the measurement. */
    timestamp: z.string().datetime({ offset: true }),

    /** Origin of this telemetry reading. */
    source: TelemetrySourceEnum,

    /** Monotonically increasing sequence number per source. */
    sequence: z.number().int().nonnegative(),

    /** Sampling rate in Hz. Must be positive. */
    sampling_hz: z.number().positive(),

    // ── Signals ──────────────────────────────────────────

    /** Servo torque at Joint 3 in Newton-metres. May be a proxy (see reachy-telemetry-mapping.md). */
    joint_3_torque_nm: z.number(),

    /** Motor temperature at Joint 3 in degrees Celsius. */
    joint_3_temperature_c: z.number(),

    /** Motor current draw in Amps. May be a proxy (see reachy-telemetry-mapping.md). */
    motor_current_amp: z.number(),

    /** Absolute positional deviation at Joint 3 in degrees. Must be >= 0. */
    joint_position_error_deg: z.number().nonnegative(),

    /** Rare discrete fault code. Null when no fault is active. */
    error_code: z.string().nullable().default(null),
  })
  .strict()

export type R17TelemetryEvent = z.infer<typeof R17TelemetryEventSchema>
