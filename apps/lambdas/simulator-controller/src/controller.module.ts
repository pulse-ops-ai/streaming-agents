import { LambdaClient } from '@aws-sdk/client-lambda'
import { Module } from '@nestjs/common'
import { LoggerService, TelemetryService } from '@streaming-agents/core-telemetry'
import { type ControllerConfig, SimulatorControllerHandler } from './controller.handler.js'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

@Module({
  providers: [
    {
      provide: 'CONFIG',
      useFactory: (): ControllerConfig => ({
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'simulator-controller',
        workerFunctionName: requireEnv('WORKER_FUNCTION_NAME'),
        loadScheduleJson: process.env.LOAD_SCHEDULE_JSON,
        defaultScenario: process.env.DEFAULT_SCENARIO ?? 'mixed',
        burstCount: Number(process.env.SIM_BURST_COUNT ?? '120'),
        workerCountOverride: process.env.SIM_WORKER_COUNT
          ? Number(process.env.SIM_WORKER_COUNT)
          : undefined,
      }),
    },
    {
      provide: TelemetryService,
      useFactory: () =>
        new TelemetryService(process.env.OTEL_SERVICE_NAME ?? 'simulator-controller'),
    },
    {
      provide: LoggerService,
      useFactory: () => new LoggerService(process.env.OTEL_SERVICE_NAME ?? 'simulator-controller'),
    },
    {
      provide: LambdaClient,
      useFactory: () => new LambdaClient({ region: process.env.AWS_REGION }),
    },
    {
      provide: SimulatorControllerHandler,
      useFactory: (
        config: ControllerConfig,
        telemetry: TelemetryService,
        logger: LoggerService,
        lambdaClient: LambdaClient
      ) => new SimulatorControllerHandler(config, telemetry, logger, lambdaClient),
      inject: ['CONFIG', TelemetryService, LoggerService, LambdaClient],
    },
  ],
})
export class SimulatorControllerModule {}
