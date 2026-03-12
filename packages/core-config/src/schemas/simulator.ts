import { z } from 'zod'

/** Config for the simulator controller Lambda. */
export const simulatorControllerConfigSchema = z.object({
  WORKER_FUNCTION_NAME: z.string().min(1),
  LOAD_SCHEDULE_JSON: z.string().optional(),
  DEFAULT_SCENARIO: z
    .enum([
      'healthy',
      'joint_3_degradation',
      'thermal_runaway',
      'vibration_anomaly',
      'random_walk',
      'mixed',
    ])
    .default('mixed'),
})

export type SimulatorControllerConfig = z.infer<typeof simulatorControllerConfigSchema>
