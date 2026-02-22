import { z } from 'zod'

/** Config for Lambdas that consume from a Kinesis stream. */
export const kinesisConsumerConfigSchema = z.object({
  KINESIS_INPUT_STREAM: z.string().min(1),
})

export type KinesisConsumerConfig = z.infer<typeof kinesisConsumerConfigSchema>

/** Config for Lambdas that produce to a Kinesis stream. */
export const kinesisProducerConfigSchema = z.object({
  KINESIS_OUTPUT_STREAM: z.string().min(1),
  BATCH_SIZE: z.coerce.number().int().positive().default(25),
})

export type KinesisProducerConfig = z.infer<typeof kinesisProducerConfigSchema>
