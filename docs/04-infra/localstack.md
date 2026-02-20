# Local Development Architecture

Streaming Agents is developed locally using:

- Terraform
- LocalStack Ultimate
- pnpm (JS/TS services)
- uv (Python services)

## Local Components

- Kinesis Data Streams
- Lambda
- DynamoDB
- API Gateway
- S3

IoT may be simulated directly to Kinesis in local mode.

## Deployment Modes

LocalStack:
- Full streaming + incident pipeline
- Stub LLM provider

AWS Sandbox:
- Real Bedrock
- Optional Lex / Polly
- Final demo deployment
