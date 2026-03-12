import type { ActionType, DiagnosisEvent, IncidentRecord } from '@streaming-agents/core-contracts'

export interface ActionRuleInput {
  diagnosis: DiagnosisEvent
  existingIncident: IncidentRecord | null
  now: string
  escalationThresholdMs: number
}

export interface ActionRuleOutput {
  action: ActionType
  incident: {
    operation: 'create' | 'update' | 'none'
    record?: Partial<IncidentRecord>
  }
  reason: string
}

/**
 * Deterministic action rules engine. No I/O, no AWS SDK, no LLM.
 *
 * Rules evaluated in order — first match wins.
 */
export function evaluateActionRules(input: ActionRuleInput): ActionRuleOutput {
  const { diagnosis, existingIncident, now, escalationThresholdMs } = input
  const { severity } = diagnosis

  // Rule 1: Critical + no incident → shutdown_recommended, create escalated
  if (severity === 'critical' && !existingIncident) {
    return {
      action: 'shutdown_recommended',
      incident: {
        operation: 'create',
        record: {
          status: 'escalated',
          escalated_at: now,
        },
      },
      reason: 'Critical risk detected — immediate attention required',
    }
  }

  // Rule 2: Critical + existing incident → shutdown_recommended, escalate
  if (severity === 'critical' && existingIncident) {
    return {
      action: 'shutdown_recommended',
      incident: {
        operation: 'update',
        record: {
          status: 'escalated',
          escalated_at: existingIncident.escalated_at ?? now,
        },
      },
      reason: 'Critical risk persists — shutdown recommended',
    }
  }

  // Rule 3: Warning + no incident → alert, create opened
  if (severity === 'warning' && !existingIncident) {
    return {
      action: 'alert',
      incident: {
        operation: 'create',
        record: {
          status: 'opened',
        },
      },
      reason: 'Elevated risk detected — monitoring initiated',
    }
  }

  // Rules 4 & 5: Warning + existing incident
  if (severity === 'warning' && existingIncident) {
    const incidentAge = new Date(now).getTime() - new Date(existingIncident.opened_at).getTime()

    // Rule 4: Warning + opened > threshold → throttle, escalate
    if (incidentAge >= escalationThresholdMs) {
      const durationSec = Math.round(incidentAge / 1000)
      return {
        action: 'throttle',
        incident: {
          operation: 'update',
          record: {
            status: 'escalated',
            escalated_at: existingIncident.escalated_at ?? now,
          },
        },
        reason: `Sustained warning for ${durationSec}s — recommending throttle`,
      }
    }

    // Rule 5: Warning + opened < threshold → monitor, update metadata only
    const remainingSec = Math.round((escalationThresholdMs - incidentAge) / 1000)
    return {
      action: 'monitor',
      incident: {
        operation: 'update',
        record: {},
      },
      reason: `Warning continues — monitoring, escalation in ${remainingSec}s`,
    }
  }

  // Rule 6: Info + existing incident → resolve
  if (severity === 'info' && existingIncident) {
    return {
      action: 'resolve',
      incident: {
        operation: 'update',
        record: {
          status: 'resolved',
          resolved_at: now,
        },
      },
      reason: 'Risk returned to acceptable levels — incident resolved',
    }
  }

  // Rule 7: Info + no incident → monitor, no incident
  return {
    action: 'monitor',
    incident: { operation: 'none' },
    reason: 'Low severity, no active incident — monitoring only',
  }
}
