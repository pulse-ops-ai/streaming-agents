import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = process.env.PORT ?? 3000

  // CORS — allow dashboard frontend during local dev
  app.enableCors({
    origin: '*',
    methods: 'GET,OPTIONS',
    allowedHeaders: 'Content-Type',
  })

  await app.listen(port)
  Logger.log(`Dashboard API listening on http://localhost:${port}`, 'Bootstrap')
}

bootstrap()
