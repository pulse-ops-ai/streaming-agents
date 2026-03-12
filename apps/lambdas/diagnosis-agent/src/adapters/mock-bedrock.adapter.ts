import type { BedrockInvokeResult } from './bedrock.adapter.js'

/**
 * Mock Bedrock adapter for local development (LocalStack).
 * Returns deterministic responses based on risk keywords in the prompt.
 * NOT test code — this is a development adapter for NODE_ENV=local.
 */
export class MockBedrockAdapter {
  async invokeModel(prompt: { system: string; user: string }): Promise<BedrockInvokeResult> {
    // Simulate ~200ms Bedrock latency
    await new Promise((resolve) => setTimeout(resolve, 50))

    const isCritical = prompt.user.includes('critical') || prompt.user.includes('CRITICAL')

    const response = isCritical
      ? {
          root_cause: 'Imminent actuator failure detected in primary joint assembly',
          evidence: [
            {
              signal: 'joint_position_error_deg',
              observation: 'Position error exceeding safety threshold with accelerating trend',
              z_score: 4.2,
            },
            {
              signal: 'vibration_mm_s',
              observation: 'Vibration amplitude indicates mechanical looseness',
              z_score: 3.8,
            },
          ],
          confidence: 'high' as const,
          recommended_actions: [
            'Initiate controlled shutdown sequence',
            'Schedule immediate maintenance inspection',
            'Isolate affected joint from load-bearing operations',
          ],
          severity: 'critical' as const,
        }
      : {
          root_cause: 'Gradual bearing degradation in joint assembly',
          evidence: [
            {
              signal: 'joint_position_error_deg',
              observation: 'Position error trending upward beyond normal operating range',
              z_score: 2.8,
            },
            {
              signal: 'motor_current_amps',
              observation: 'Motor current elevated suggesting increased friction',
              z_score: 2.3,
            },
          ],
          confidence: 'medium' as const,
          recommended_actions: [
            'Reduce joint velocity by 20%',
            'Schedule preventive maintenance within 48 hours',
          ],
          severity: 'warning' as const,
        }

    return {
      text: JSON.stringify(response),
      promptTokens: 450,
      completionTokens: 120,
    }
  }
}
