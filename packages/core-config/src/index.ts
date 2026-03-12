// Loader
export { loadConfig, type LoadConfigOptions } from './loader.js'
export { resolveSecrets } from './secrets.js'

// Schema fragments
export { baseLambdaConfigSchema, type BaseLambdaConfig } from './schemas/base.js'
export {
  kinesisConsumerConfigSchema,
  kinesisProducerConfigSchema,
  type KinesisConsumerConfig,
  type KinesisProducerConfig,
} from './schemas/kinesis.js'
export { dynamodbConfigSchema, type DynamodbConfig } from './schemas/dynamodb.js'
export { dlqConfigSchema, type DlqConfig } from './schemas/dlq.js'
export {
  simulatorControllerConfigSchema,
  type SimulatorControllerConfig,
} from './schemas/simulator.js'
export { bedrockConfigSchema, type BedrockConfig } from './schemas/bedrock.js'
export { incidentsConfigSchema, type IncidentsConfig } from './schemas/incidents.js'
