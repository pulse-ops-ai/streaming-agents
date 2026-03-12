/**
 * NestJS module that provides TelemetryService and LoggerService via DI.
 *
 * Usage:
 *   @Module({ imports: [TelemetryModule.forRoot('ingestion')] })
 */

import { type DynamicModule, Module } from '@nestjs/common'
import { LOGGER, TELEMETRY } from './constants.js'
import { LoggerService } from './logger.service.js'
import { TelemetryService } from './telemetry.service.js'

@Module({})
export class TelemetryModule {
  static forRoot(serviceName: string): DynamicModule {
    return {
      module: TelemetryModule,
      global: true,
      providers: [
        {
          provide: TELEMETRY,
          useFactory: () => new TelemetryService(serviceName),
        },
        {
          provide: LOGGER,
          useFactory: () => new LoggerService(serviceName),
        },
      ],
      exports: [TELEMETRY, LOGGER],
    }
  }
}
