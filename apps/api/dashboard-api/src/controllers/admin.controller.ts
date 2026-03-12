import {
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  EventBridgeClient,
} from '@aws-sdk/client-eventbridge'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Body, Controller, Get, Inject, Logger, Param, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDocClient } from '../adapters/dynamodb.factory.js'

const VALID_SCENARIOS = [
  'healthy',
  'joint_3_degradation',
  'thermal_runaway',
  'vibration_anomaly',
  'random_walk',
] as const

/**
 * Demo fleet manifest — each asset gets a specific degradation scenario.
 *
 * Scenarios use a two-phase approach: 90 ticks of healthy baseline, then
 * degradation onset. Risk is driven by threshold severity (absolute values
 * vs warn/critical thresholds), not z-scores alone, so burst_count doesn't
 * need precise tuning — 180 ticks is sufficient for all scenarios.
 */
const DEMO_FLEET = [
  {
    asset_id: 'R-1',
    scenario: 'joint_3_degradation',
    source: 'simulator' as const,
    intended_state: 'critical' as const,
    burst_count: 180,
  },
  {
    asset_id: 'R-2',
    scenario: 'vibration_anomaly',
    source: 'simulator' as const,
    intended_state: 'elevated' as const,
    burst_count: 180,
  },
  {
    asset_id: 'R-8',
    scenario: 'thermal_runaway',
    source: 'simulator' as const,
    intended_state: 'elevated' as const,
    burst_count: 180,
  },
  {
    asset_id: 'R-50',
    scenario: 'healthy',
    source: 'simulator' as const,
    intended_state: 'nominal' as const,
    burst_count: 180,
  },
]

const DEMO_ASSET_IDS = DEMO_FLEET.map((a) => a.asset_id)

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name)
  private readonly lambda: LambdaClient
  private readonly eventBridge: EventBridgeClient
  private readonly docClient: DynamoDBDocumentClient
  private readonly assetTableName: string
  private readonly incidentsTableName: string
  private readonly historyTableName: string

  private static readonly SIMULATOR_FUNCTION = 'streaming-agents-simulator-controller'
  private static readonly WORKER_FUNCTION = 'streaming-agents-simulator-worker'
  private static readonly CRON_RULE = 'streaming-agents-simulator-cron'

  constructor(@Inject(ConfigService) config: ConfigService) {
    const region = config.get('AWS_REGION') || 'us-east-1'
    this.lambda = new LambdaClient({ region })
    this.eventBridge = new EventBridgeClient({ region })
    this.docClient = createDocClient(config)
    this.assetTableName =
      config.get<string>('DYNAMODB_ASSET_TABLE') ?? 'streaming-agents-asset-state'
    this.incidentsTableName =
      config.get<string>('DYNAMODB_INCIDENTS_TABLE') ?? 'streaming-agents-incidents'
    this.historyTableName =
      config.get<string>('DYNAMODB_HISTORY_TABLE') ?? 'streaming-agents-asset-history'
  }

  // ── Simulator ──────────────────────────────────────────

  @Post('simulator/run')
  async runSimulator() {
    this.logger.log('Invoking simulator controller Lambda')
    const response = await this.lambda.send(
      new InvokeCommand({
        FunctionName: AdminController.SIMULATOR_FUNCTION,
        InvocationType: 'Event',
      })
    )
    return { statusCode: response.StatusCode, message: 'Simulator invoked' }
  }

  // ── Cron ───────────────────────────────────────────────

  @Post('cron/enable')
  async enableCron() {
    this.logger.log('Enabling simulator cron rule')
    await this.eventBridge.send(new EnableRuleCommand({ Name: AdminController.CRON_RULE }))
    return { rule: AdminController.CRON_RULE, state: 'ENABLED' }
  }

  @Post('cron/disable')
  async disableCron() {
    this.logger.log('Disabling simulator cron rule')
    await this.eventBridge.send(new DisableRuleCommand({ Name: AdminController.CRON_RULE }))
    return { rule: AdminController.CRON_RULE, state: 'DISABLED' }
  }

  @Get('cron/status')
  async getCronStatus() {
    const response = await this.eventBridge.send(
      new DescribeRuleCommand({ Name: AdminController.CRON_RULE })
    )
    return {
      rule: AdminController.CRON_RULE,
      state: response.State,
      schedule: response.ScheduleExpression,
    }
  }

  // ── Demo Fleet ─────────────────────────────────────────

  @Get('demo/fleet')
  getDemoFleetManifest() {
    return {
      fleet: [
        {
          asset_id: 'R-17',
          scenario: 'live telemetry',
          source: 'reachy_mini',
          intended_state: 'nominal',
        },
        ...DEMO_FLEET,
      ],
      scenarios: [...VALID_SCENARIOS],
    }
  }

  @Get('demo/readiness')
  async getDemoReadiness() {
    const manifest = [
      { asset_id: 'R-17', intended_state: 'nominal', source: 'reachy_mini' },
      ...DEMO_FLEET.map((a) => ({
        asset_id: a.asset_id,
        intended_state: a.intended_state,
        source: a.source,
      })),
    ]

    const assetChecks = await Promise.all(
      manifest.map(async (asset) => {
        const response = await this.docClient.send(
          new GetCommand({ TableName: this.assetTableName, Key: { asset_id: asset.asset_id } })
        )
        const item = response.Item
        const actualState = (item?.risk_state as string) ?? null
        const isLive = asset.source === 'reachy_mini'
        return {
          asset_id: asset.asset_id,
          intended_state: asset.intended_state,
          actual_state: actualState,
          match: isLive ? !!item : actualState === asset.intended_state,
          has_data: !!item,
        }
      })
    )

    const incidentResponse = await this.docClient.send(
      new ScanCommand({
        TableName: this.incidentsTableName,
        FilterExpression: `asset_id IN (${DEMO_ASSET_IDS.map((_, i) => `:a${i}`).join(', ')}) AND #s IN (:s1, :s2)`,
        ExpressionAttributeValues: {
          ...Object.fromEntries(DEMO_ASSET_IDS.map((id, i) => [`:a${i}`, id])),
          ':s1': 'opened',
          ':s2': 'escalated',
        },
        ExpressionAttributeNames: { '#s': 'status' },
        Select: 'COUNT',
      })
    )
    const incidentCount = incidentResponse.Count ?? 0

    const simAssets = assetChecks.filter((a) => DEMO_ASSET_IDS.includes(a.asset_id))
    const allMatch = simAssets.every((a) => a.match)

    return {
      ready: allMatch && incidentCount > 0,
      checked_at: new Date().toISOString(),
      assets: assetChecks,
      incident_count: incidentCount,
    }
  }

  @Post('demo/bootstrap')
  async bootstrapDemoFleet() {
    this.logger.log('Bootstrapping demo fleet')

    // 1. Clear asset-state for demo fleet
    for (const assetId of DEMO_ASSET_IDS) {
      await this.docClient
        .send(new DeleteCommand({ TableName: this.assetTableName, Key: { asset_id: assetId } }))
        .catch(() => {})
    }
    this.logger.log(`Cleared ${DEMO_ASSET_IDS.length} asset-state records`)

    // 2. Clear incidents for demo fleet
    const incidentDeletes = await this.deleteIncidentsForAssets(DEMO_ASSET_IDS)
    this.logger.log(`Cleared ${incidentDeletes} incident records`)

    // 3. Clear history for demo fleet
    let historyDeletes = 0
    for (const assetId of DEMO_ASSET_IDS) {
      historyDeletes += await this.deleteHistoryForAsset(assetId)
    }
    this.logger.log(`Cleared ${historyDeletes} history records`)

    // 4. Invoke simulator workers with demo scenarios
    const dateStr = new Date().toISOString().slice(0, 10)
    const invokePromises = DEMO_FLEET.map((asset) =>
      this.lambda.send(
        new InvokeCommand({
          FunctionName: AdminController.WORKER_FUNCTION,
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              asset_id: asset.asset_id,
              scenario: asset.scenario,
              seed: `demo:${dateStr}:${asset.asset_id}`,
              burst_count: asset.burst_count,
            })
          ),
        })
      )
    )
    await Promise.all(invokePromises)

    return {
      message: 'Demo fleet bootstrap initiated',
      cleared: {
        asset_state: DEMO_ASSET_IDS.length,
        incidents: incidentDeletes,
        history: historyDeletes,
      },
      assets: DEMO_FLEET.map((a) => ({
        asset_id: a.asset_id,
        scenario: a.scenario,
        burst_count: a.burst_count,
      })),
      note: 'Workers invoked async — fleet will populate over ~30s as pipeline processes events',
    }
  }

  // ── Per-Asset Scenario ─────────────────────────────────

  @Post('demo/run-scenario')
  async runScenario(@Body() body: { asset_id: string; scenario: string; burst_count?: number }) {
    const { asset_id, scenario, burst_count = 240 } = body

    if (!VALID_SCENARIOS.includes(scenario as (typeof VALID_SCENARIOS)[number])) {
      return { error: `Invalid scenario: ${scenario}`, valid: [...VALID_SCENARIOS] }
    }

    this.logger.log(`Running scenario '${scenario}' for ${asset_id}`)

    // Clear existing state for this asset
    await this.docClient
      .send(new DeleteCommand({ TableName: this.assetTableName, Key: { asset_id } }))
      .catch(() => {})

    const dateStr = new Date().toISOString().slice(0, 10)
    await this.lambda.send(
      new InvokeCommand({
        FunctionName: AdminController.WORKER_FUNCTION,
        InvocationType: 'Event',
        Payload: Buffer.from(
          JSON.stringify({
            asset_id,
            scenario,
            seed: `demo:${dateStr}:${asset_id}`,
            burst_count,
          })
        ),
      })
    )

    return { asset_id, scenario, burst_count, message: 'Scenario worker invoked' }
  }

  // ── Baselines ──────────────────────────────────────────

  @Post('baselines/reset/:assetId')
  async resetBaseline(@Param('assetId') assetId: string) {
    this.logger.log(`Resetting baseline for asset ${assetId}`)
    await this.docClient.send(
      new DeleteCommand({ TableName: this.assetTableName, Key: { asset_id: assetId } })
    )
    return { assetId, message: 'Baseline reset — state deleted' }
  }

  // ── Incident Cleanup ──────────────────────────────────

  @Post('incidents/clear/:assetId')
  async clearIncidentsForAsset(@Param('assetId') assetId: string) {
    this.logger.log(`Clearing incidents for ${assetId}`)
    const deleted = await this.deleteIncidentsForAssets([assetId])
    return { asset_id: assetId, deleted, message: `Cleared ${deleted} incidents` }
  }

  @Post('incidents/clear-demo')
  async clearDemoIncidents() {
    this.logger.log('Clearing all demo fleet incidents')
    const deleted = await this.deleteIncidentsForAssets(DEMO_ASSET_IDS)
    return { assets: DEMO_ASSET_IDS, deleted, message: `Cleared ${deleted} incidents` }
  }

  // ── History Cleanup ────────────────────────────────────

  @Post('history/clear/:assetId')
  async clearHistoryForAsset(@Param('assetId') assetId: string) {
    this.logger.log(`Clearing history for ${assetId}`)
    const deleted = await this.deleteHistoryForAsset(assetId)
    return { asset_id: assetId, deleted, message: `Cleared ${deleted} history records` }
  }

  @Post('history/clear-demo')
  async clearDemoHistory() {
    this.logger.log('Clearing all demo fleet history')
    let total = 0
    for (const assetId of DEMO_ASSET_IDS) {
      total += await this.deleteHistoryForAsset(assetId)
    }
    return { assets: DEMO_ASSET_IDS, deleted: total, message: `Cleared ${total} history records` }
  }

  // ── Private helpers ────────────────────────────────────

  private async deleteIncidentsForAssets(assetIds: string[]): Promise<number> {
    const response = await this.docClient.send(
      new ScanCommand({
        TableName: this.incidentsTableName,
        FilterExpression: `asset_id IN (${assetIds.map((_, i) => `:a${i}`).join(', ')})`,
        ExpressionAttributeValues: Object.fromEntries(assetIds.map((id, i) => [`:a${i}`, id])),
        ProjectionExpression: 'incident_id',
      })
    )
    const items = response.Items ?? []
    if (items.length === 0) return 0

    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25)
      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.incidentsTableName]: chunk.map((item) => ({
              DeleteRequest: { Key: { incident_id: item.incident_id } },
            })),
          },
        })
      )
    }
    return items.length
  }

  private async deleteHistoryForAsset(assetId: string): Promise<number> {
    // Query all history keys for this asset, then batch delete
    let deleted = 0
    let lastKey: Record<string, unknown> | undefined

    do {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.historyTableName,
          KeyConditionExpression: 'asset_id = :id',
          ExpressionAttributeValues: { ':id': assetId },
          ProjectionExpression: 'asset_id, #ts',
          ExpressionAttributeNames: { '#ts': 'timestamp' },
          ExclusiveStartKey: lastKey,
        })
      )
      const items = response.Items ?? []
      lastKey = response.LastEvaluatedKey as Record<string, unknown> | undefined

      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25)
        await this.docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.historyTableName]: chunk.map((item) => ({
                DeleteRequest: {
                  Key: { asset_id: item.asset_id, timestamp: item.timestamp },
                },
              })),
            },
          })
        )
      }
      deleted += items.length
    } while (lastKey)

    return deleted
  }
}
