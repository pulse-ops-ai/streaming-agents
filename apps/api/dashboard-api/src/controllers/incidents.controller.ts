import { Controller, Get, Inject, Logger } from '@nestjs/common'
import type { IncidentsResponse } from '@streaming-agents/domain-models'
import { IncidentAdapter } from '../adapters/incident.adapter.js'
import { toActiveIncidentSummary } from '../mappers/incident.mapper.js'

@Controller('api/incidents')
export class IncidentsController {
  private readonly logger = new Logger(IncidentsController.name)

  constructor(@Inject(IncidentAdapter) private readonly incidents: IncidentAdapter) {}

  @Get('active')
  async getActiveIncidents(): Promise<IncidentsResponse> {
    const records = await this.incidents.scanActiveIncidents()

    // Sort by opened_at descending (most recent first)
    records.sort((a, b) => (b.opened_at > a.opened_at ? 1 : -1))

    const incidents = records.map(toActiveIncidentSummary)

    this.logger.debug(`Active incidents: ${incidents.length}`)

    return {
      count: incidents.length,
      incidents,
    }
  }
}
