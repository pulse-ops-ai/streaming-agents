import { Controller, Get, Inject, Logger } from '@nestjs/common'
import type { FleetOverviewResponse } from '@streaming-agents/domain-models'
import { AssetStateAdapter } from '../adapters/asset-state.adapter.js'
import { IncidentAdapter } from '../adapters/incident.adapter.js'
import { toFleetOverviewResponse } from '../mappers/fleet.mapper.js'

@Controller('api/fleet')
export class FleetController {
  private readonly logger = new Logger(FleetController.name)

  constructor(
    @Inject(AssetStateAdapter) private readonly assetState: AssetStateAdapter,
    @Inject(IncidentAdapter) private readonly incidents: IncidentAdapter
  ) {}

  @Get()
  async getFleetOverview(): Promise<FleetOverviewResponse> {
    const [assets, incidentAssetIds] = await Promise.all([
      this.assetState.scanAllAssets(),
      this.incidents.getAssetIdsWithActiveIncidents(),
    ])

    this.logger.debug(`Fleet overview: ${assets.length} assets, ${incidentAssetIds.size} incidents`)

    return toFleetOverviewResponse(assets, incidentAssetIds)
  }
}
