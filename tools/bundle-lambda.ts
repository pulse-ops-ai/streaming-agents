#!/usr/bin/env node
/**
 * Lambda Bundler
 * Bundles Lambda functions with esbuild for deployment to LocalStack/AWS
 */

import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as esbuild from 'esbuild'

const LAMBDAS_DIR = path.join(process.cwd(), 'apps/lambdas')
const OUTPUT_DIR = path.join(process.cwd(), 'dist/lambdas')

interface LambdaConfig {
  name: string
  dir: string
  entryPoint: string
}

const LAMBDAS: LambdaConfig[] = [
  {
    name: 'simulator-controller',
    dir: path.join(LAMBDAS_DIR, 'simulator-controller'),
    entryPoint: 'src/index.ts',
  },
  {
    name: 'simulator-worker',
    dir: path.join(LAMBDAS_DIR, 'simulator-worker'),
    entryPoint: 'src/index.ts',
  },
  {
    name: 'ingestion',
    dir: path.join(LAMBDAS_DIR, 'ingestion'),
    entryPoint: 'src/index.ts',
  },
  {
    name: 'signal-agent',
    dir: path.join(LAMBDAS_DIR, 'signal-agent'),
    entryPoint: 'src/index.ts',
  },
  {
    name: 'diagnosis-agent',
    dir: path.join(LAMBDAS_DIR, 'diagnosis-agent'),
    entryPoint: 'src/index.ts',
  },
  {
    name: 'actions-agent',
    dir: path.join(LAMBDAS_DIR, 'actions-agent'),
    entryPoint: 'src/index.ts',
  },
  {
    name: 'conversation-agent',
    dir: path.join(LAMBDAS_DIR, 'conversation-agent'),
    entryPoint: 'src/main.ts',
  },
]

async function bundleLambda(lambda: LambdaConfig): Promise<void> {
  console.log(`📦 Bundling ${lambda.name}...`)

  const entryPath = path.join(lambda.dir, lambda.entryPoint)
  const outDir = path.join(OUTPUT_DIR, lambda.name)
  const outFile = path.join(outDir, 'index.js')
  const zipFile = path.join(OUTPUT_DIR, `${lambda.name}.zip`)

  // Create output directory
  fs.mkdirSync(outDir, { recursive: true })

  // Bundle with esbuild
  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: outFile,
    external: [
      '@aws-sdk/*',
      'class-validator',
      'class-transformer',
      '@nestjs/websockets',
      '@nestjs/microservices',
      '@nestjs/platform-express',
    ],
    sourcemap: false,
    minify: false,
    metafile: false,
  })

  // Create zip file
  execSync(`cd ${outDir} && zip -q -r ${zipFile} index.js`, {
    stdio: 'inherit',
  })

  console.log(`✅ ${lambda.name} → ${zipFile}`)
}

async function main() {
  console.log('🚀 Building Lambda bundles...\n')

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // Bundle all Lambdas
  for (const lambda of LAMBDAS) {
    await bundleLambda(lambda)
  }

  console.log('\n✨ All Lambda bundles created successfully!')
}

main().catch((error) => {
  console.error('❌ Bundle failed:', error)
  process.exit(1)
})
