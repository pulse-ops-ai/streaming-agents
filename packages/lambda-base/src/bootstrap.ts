import type { INestApplicationContext, Type } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { initOtel } from '@streaming-agents/core-telemetry'
import type { BaseLambdaHandler } from './handler.js'
import type { HandlerContext, LambdaRuntimeContext } from './types.js'

/**
 * Creates a Lambda handler function backed by a NestJS application context.
 *
 * NestJS context is created once on cold start and reused for warm invocations.
 * OTel SDK is initialized before NestJS bootstrap.
 */
export function bootstrapLambda<TIn, TOut>(
  moduleClass: Type,
  handlerClass: Type<BaseLambdaHandler<TIn, TOut>>
): (event: TIn, lambdaContext: LambdaRuntimeContext) => Promise<void> {
  let app: INestApplicationContext | undefined

  return async (event: TIn, lambdaContext: LambdaRuntimeContext): Promise<void> => {
    if (!app) {
      const serviceName = process.env.OTEL_SERVICE_NAME ?? lambdaContext.functionName
      initOtel(serviceName)
      app = await NestFactory.createApplicationContext(moduleClass, { logger: false })
    }

    const handler = app.get(handlerClass)
    const context: HandlerContext = {
      requestId: lambdaContext.awsRequestId,
      functionName: lambdaContext.functionName,
    }

    await handler.handle(event, context)
  }
}
