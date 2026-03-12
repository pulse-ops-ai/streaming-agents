/**
 * Preview SSML output through Amazon Polly.
 *
 * Takes an SSML string as a CLI argument, calls Polly SynthesizeSpeech
 * with the neural engine (VoiceId=Matthew), and writes the output to
 * /tmp/polly-preview.mp3.
 *
 * Usage:
 *   npx tsx tools/preview-polly.ts '<speak>Hello <emphasis level="strong">world</emphasis></speak>'
 *
 * Requires:
 *   - Real AWS credentials with polly:SynthesizeSpeech permission
 *   - @aws-sdk/client-polly installed as a devDependency
 */

import { writeFileSync } from 'node:fs'
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'

const ssml = process.argv[2]

if (!ssml) {
  console.error("Usage: npx tsx tools/preview-polly.ts '<speak>...</speak>'")
  process.exit(1)
}

if (!ssml.startsWith('<speak>')) {
  console.error('Error: Input must be valid SSML starting with <speak>')
  process.exit(1)
}

const OUTPUT_PATH = '/tmp/polly-preview.mp3'

async function main() {
  const polly = new PollyClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

  console.log('Synthesizing speech...')
  console.log(`SSML: ${ssml}`)

  const response = await polly.send(
    new SynthesizeSpeechCommand({
      Text: ssml,
      TextType: 'ssml',
      OutputFormat: 'mp3',
      VoiceId: 'Matthew',
      Engine: 'neural',
    })
  )

  if (!response.AudioStream) {
    console.error('Error: No audio stream returned from Polly')
    process.exit(1)
  }

  const chunks: Uint8Array[] = []
  for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  writeFileSync(OUTPUT_PATH, buffer)
  console.log(`Written ${buffer.length} bytes to ${OUTPUT_PATH}`)
  console.log(`Play with: afplay ${OUTPUT_PATH}  (macOS) or mpv ${OUTPUT_PATH}  (Linux)`)
}

main().catch((err) => {
  console.error('Polly synthesis failed:', err.message)
  process.exit(1)
})
