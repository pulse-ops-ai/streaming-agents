import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AssetHistoryAdapter } from './adapters/asset-history.adapter.js'
import { AssetStateAdapter } from './adapters/asset-state.adapter.js'
import { IncidentAdapter } from './adapters/incident.adapter.js'
import { AdminController } from './controllers/admin.controller.js'
import { AssetsController } from './controllers/assets.controller.js'
import { ConversationsController } from './controllers/conversations.controller.js'
import { FleetController } from './controllers/fleet.controller.js'
import { IncidentsController } from './controllers/incidents.controller.js'

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [
    AdminController,
    FleetController,
    AssetsController,
    IncidentsController,
    ConversationsController,
  ],
  providers: [AssetStateAdapter, IncidentAdapter, AssetHistoryAdapter],
})
export class AppModule {}
