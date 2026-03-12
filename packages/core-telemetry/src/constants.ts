/** NestJS injection token for LoggerService. */
export const LOGGER = Symbol('LOGGER')

/** NestJS injection token for TelemetryService. */
export const TELEMETRY = Symbol('TELEMETRY')

/** Prefix for all custom metrics. */
export const METRIC_PREFIX = 'streaming_agents'
