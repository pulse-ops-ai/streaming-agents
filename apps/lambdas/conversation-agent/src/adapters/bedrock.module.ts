import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TelemetryModule, TelemetryService } from '@streaming-agents/core-telemetry'
import { ConversationBedrockAdapter } from './bedrock.adapter.js'
import { LiveBedrockAdapter } from './live-bedrock.adapter.js'
import { MockBedrockAdapter } from './mock-bedrock.adapter.js'

@Module({
  imports: [ConfigModule, TelemetryModule],
  providers: [
    {
      provide: ConversationBedrockAdapter,
      inject: [ConfigService, TelemetryService],
      useFactory: (config: ConfigService, telemetry: TelemetryService) => {
        // Fallback or explicit instruction to mock bedrock requests
        if (config.get('NODE_ENV') === 'local' || config.get('NODE_ENV') === 'localstack') {
          return new MockBedrockAdapter(telemetry)
        }
        return new LiveBedrockAdapter(config, telemetry)
      },
    },
  ],
  exports: [ConversationBedrockAdapter],
})
export class BedrockModule {}
