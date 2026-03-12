import type { SourceType } from '@streaming-agents/core-contracts'
import type { TelemetrySourceV2 } from '@streaming-agents/schemas'

/**
 * Maps a telemetry event's `source` field to the ingestion envelope's `source_type`.
 *
 * - simulator → simulated
 * - reachy-daemon, reachy-sdk, reachy-exporter → edge
 * - replay → replay
 */
export function mapSourceType(source: TelemetrySourceV2): SourceType {
  switch (source) {
    case 'simulator':
      return 'simulated'
    case 'reachy-daemon':
    case 'reachy-sdk':
    case 'reachy-exporter':
      return 'edge'
    case 'replay':
      return 'replay'
  }
}
