import { z } from 'zod'

/** Config for Lambdas that read/write DynamoDB. */
export const dynamodbConfigSchema = z.object({
  DYNAMODB_TABLE: z.string().min(1),
})

export type DynamodbConfig = z.infer<typeof dynamodbConfigSchema>
