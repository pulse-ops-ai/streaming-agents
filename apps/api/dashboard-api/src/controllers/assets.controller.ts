import { Controller, Get, Inject, Logger, NotFoundException, Param, Query } from '@nestjs/common'
import type { AssetDetailResponse, AssetHistoryResponse } from '@streaming-agents/domain-models'
import { AssetHistoryAdapter } from '../adapters/asset-history.adapter.js'
import { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import { IncidentAdapter } from '../adapters/incident.adapter.js'
import { toAssetDetailResponse } from '../mappers/asset-detail.mapper.js'
import { toAssetHistoryPoint } from '../mappers/history.mapper.js'

@Controller('api/assets')
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name)

  constructor(
    @Inject(AssetStateAdapter) private readonly assetState: AssetStateAdapter,
    @Inject(IncidentAdapter) private readonly incidents: IncidentAdapter,
    @Inject(AssetHistoryAdapter) private readonly history: AssetHistoryAdapter
  ) {}

  @Get(':assetId')
  async getAssetDetail(@Param('assetId') assetId: string): Promise<AssetDetailResponse> {
    const [state, incident, recentRows] = await Promise.all([
      this.assetState.getAsset(assetId),
      this.incidents.findActiveIncidentForAsset(assetId),
      this.history.queryRecent(assetId, 60),
    ])

    if (!state) {
      throw new NotFoundException(`Asset ${assetId} not found`)
    }

    const recentHistory = recentRows.map(toAssetHistoryPoint)

    this.logger.debug(
      `Asset detail ${assetId}: risk=${state.composite_risk ?? state.risk_score}, history=${recentHistory.length}pts`
    )

    return toAssetDetailResponse(state, recentHistory, incident)
  }

  @Get(':assetId/history')
  async getAssetHistory(
    @Param('assetId') assetId: string,
    @Query('minutes') minutesParam?: string
  ): Promise<AssetHistoryResponse> {
    const minutes = Math.min(Math.max(Number(minutesParam) || 5, 1), 60)
    const to = new Date().toISOString()
    const from = new Date(Date.now() - minutes * 60_000).toISOString()

    const rows = await this.history.queryHistory(assetId, from, to)
    const points = rows.map(toAssetHistoryPoint)

    this.logger.debug(`Asset history ${assetId}: ${minutes}min window, ${points.length} points`)

    return {
      asset_id: assetId,
      from,
      to,
      count: points.length,
      points,
    }
  }
}
