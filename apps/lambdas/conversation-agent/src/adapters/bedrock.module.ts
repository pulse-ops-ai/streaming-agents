import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TELEMETRY, type TelemetryService } from '@streaming-agents/core-telemetry'
import { ConversationBedrockAdapter } from './bedrock.adapter.js'
import { LiveBedrockAdapter } from './live-bedrock.adapter.js'
import { MockBedrockAdapter } from './mock-bedrock.adapter.js'

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ConversationBedrockAdapter,
      inject: [ConfigService, TELEMETRY],
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
