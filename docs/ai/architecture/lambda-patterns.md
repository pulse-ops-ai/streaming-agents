# Architecture: Lambda Patterns & Package Map

## Hexagonal Architecture

Every Lambda follows the same hexagonal (ports & adapters) pattern from Lattice:

```
                    ┌─────────────────────────────┐
  Kinesis/          │         Lambda Handler       │
  EventBridge  ───▶ │  ┌───────────────────────┐  │ ───▶ Kinesis/
  (input port)      │  │    Business Logic      │  │      DynamoDB/SQS
                    │  │    (pure functions)     │  │      (output port)
                    │  └───────────────────────┘  │
                    │         ▲         ▲          │
                    │    Config    Telemetry       │
                    └─────────────────────────────┘
```

The `process()` method contains business logic. It does NOT know:
- Where the event came from (Kinesis, EventBridge, direct invoke)
- Where results go (Kinesis, DynamoDB, SQS)
- How observability works (OTel, CloudWatch)

Adapters handle I/O. Business logic is pure and testable.

---

## BaseLambdaHandler<TIn, TOut>

Adapted from Lattice's `BaseWorkerService<TIn, TOut>`. The key difference:
Kafka consumer polling → Lambda event trigger. The `process()` contract is identical.

```typescript
// packages/lambda-base/src/handler.ts

export type ProcessResult<TOut> =
  | { status: 'success'; output?: TOut }
  | { status: 'skip'; reason: string }
  | { status: 'retry'; reason: string }
  | { status: 'dlq'; reason: string; error: Error };

export abstract class BaseLambdaHandler<TIn, TOut = void> {
  constructor(
    protected readonly config: LambdaConfig,
    protected readonly telemetry: TelemetryService,
    protected readonly logger: LoggerService,
  ) {}

  /**
   * Implement this method. The handler does NOT know
   * where the event came from or where results go.
   */
  protected abstract process(
    payload: TIn,
    context: HandlerContext,
  ): Promise<ProcessResult<TOut>>;

  /**
   * Override to handle successful output (e.g., write to Kinesis).
   * Default: no-op.
   */
  protected async onSuccess(output: TOut, context: HandlerContext): Promise<void> {
    // Override in subclass
  }

  /**
   * Override to handle DLQ routing.
   * Default: sends to configured SQS DLQ.
   */
  protected async onDLQ(
    error: Error,
    reason: string,
    originalPayload: TIn,
    context: HandlerContext,
  ): Promise<void> {
    // Default implementation sends to SQS DLQ
  }

  /**
   * Entry point called by the Lambda runtime adapter.
   * Wraps process() with OTel spans, error handling, and metrics.
   */
  async handle(event: TIn, context: HandlerContext): Promise<void> {
    const span = this.telemetry.startSpan(`${this.config.serviceName}.process`);
    const startTime = Date.now();

    try {
      const result = await this.process(event, context);

      switch (result.status) {
        case 'success':
          if (result.output) await this.onSuccess(result.output, context);
          this.telemetry.increment('messages.processed', { status: 'success' });
          break;
        case 'skip':
          this.telemetry.increment('messages.processed', { status: 'skip' });
          this.logger.info('Skipped', { reason: result.reason });
          break;
        case 'retry':
          this.telemetry.increment('messages.processed', { status: 'retry' });
          throw new Error(`Retry: ${result.reason}`); // Lambda retry
          break;
        case 'dlq':
          await this.onDLQ(result.error, result.reason, event, context);
          this.telemetry.increment('messages.dlq', { reason: result.reason });
          break;
      }
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error; // Let Lambda runtime handle retry
    } finally {
      this.telemetry.timing('processing_time_ms', Date.now() - startTime);
      span.end();
    }
  }
}
```

### HandlerContext

```typescript
interface HandlerContext {
  requestId: string;       // Lambda request ID
  functionName: string;    // Lambda function name
  traceId?: string;        // Propagated OTel trace ID
  sourceStream?: string;   // Kinesis stream name (if applicable)
  sourcePartition?: string;
  sourceSequence?: string;
}
```

---

## Package Map

### Dependency Graph

```
apps/lambdas/*
  ├── @streaming-agents/lambda-base
  │     ├── @streaming-agents/core-config
  │     ├── @streaming-agents/core-telemetry
  │     └── @streaming-agents/core-kinesis (optional)
  ├── @streaming-agents/core-contracts
  │     └── @streaming-agents/schemas
  └── @aws-sdk/* (per-service)
```

### Package Definitions

#### `@streaming-agents/schemas` (EXISTS)
- **Location:** `packages/schemas/`
- **Purpose:** Zod schemas + JSON Schema generation
- **Exports:** `R17TelemetryV2Event`, `R17TelemetryV2EventSchema`
- **Status:** ✅ Complete

#### `@streaming-agents/core-contracts` (NEW)
- **Location:** `packages/core-contracts/`
- **Purpose:** TypeScript types for all event payloads flowing through Kinesis
- **Exports:** `IngestedEvent`, `RiskEvent`, `DLQMessage`, `SimulatorWorkerPayload`
- **Dependencies:** `@streaming-agents/schemas`
- **Pattern:** Same as `@lattice/core-contracts`

#### `@streaming-agents/core-config` (NEW)
- **Location:** `packages/core-config/`
- **Purpose:** Zod-validated environment variable loading
- **Exports:** `loadConfig<T>(schema)`, `LambdaConfig`, service-specific config schemas
- **Dependencies:** `zod`
- **Pattern:** Same as `@lattice/core-config`

#### `@streaming-agents/core-telemetry` (NEW)
- **Location:** `packages/core-telemetry/`
- **Purpose:** OTel SDK initialization, span helpers, metric helpers, logger
- **Exports:** `initOtel()`, `TelemetryService`, `LoggerService`, `LOGGER` token
- **Dependencies:** `@opentelemetry/*`
- **Pattern:** Replaces `@lattice/core-telemetry` (OTel instead of Datadog)

#### `@streaming-agents/core-kinesis` (NEW)
- **Location:** `packages/core-kinesis/`
- **Purpose:** Kinesis producer/consumer wrappers with DLQ routing
- **Exports:** `KinesisProducer`, `KinesisConsumer`, `DLQPublisher`
- **Dependencies:** `@aws-sdk/client-kinesis`, `@aws-sdk/client-sqs`, `@streaming-agents/core-telemetry`
- **Pattern:** Replaces `@lattice/core-kafka`

#### `@streaming-agents/lambda-base` (NEW)
- **Location:** `packages/lambda-base/`
- **Purpose:** BaseLambdaHandler, NestJS bootstrap for Lambda, lifecycle
- **Exports:** `BaseLambdaHandler`, `HandlerContext`, `ProcessResult`, `bootstrapLambda()`
- **Dependencies:** `@streaming-agents/core-config`, `@streaming-agents/core-telemetry`, `@nestjs/*`
- **Pattern:** Replaces `@lattice/worker-base`

---

## Lambda Bootstrap Pattern

```typescript
// apps/lambdas/ingestion/src/main.ts
import { bootstrapLambda } from '@streaming-agents/lambda-base';
import { IngestionHandler } from './handler.js';
import { IngestionModule } from './ingestion.module.js';

export const handler = bootstrapLambda(IngestionModule, IngestionHandler);
```

```typescript
// packages/lambda-base/src/bootstrap.ts
export function bootstrapLambda<TModule, THandler>(
  moduleClass: Type<TModule>,
  handlerClass: Type<THandler>,
) {
  let app: INestApplicationContext;

  return async (event: unknown, lambdaContext: Context) => {
    if (!app) {
      app = await NestFactory.createApplicationContext(moduleClass);
    }
    const handler = app.get(handlerClass);
    return handler.handle(event, {
      requestId: lambdaContext.awsRequestId,
      functionName: lambdaContext.functionName,
    });
  };
}
```

NestJS app context is created once per Lambda cold start and reused for warm invocations.

---

## Generator (Phase 2.3, future)

```bash
pnpm generate:lambda signal-agent
```

Creates:
```
apps/lambdas/signal-agent/
├── src/
│   ├── main.ts              # bootstrapLambda entry
│   ├── handler.ts           # extends BaseLambdaHandler
│   ├── handler.module.ts    # NestJS module
│   └── handler.types.ts     # TIn/TOut types
├── package.json
├── tsconfig.json
└── .env.example
```

Same pattern as Lattice `tools/generators/new-worker/`.
