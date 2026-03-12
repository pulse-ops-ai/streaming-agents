import { AssetCard } from '@/components/asset-card'
import { ConversationPanel } from '@/components/conversation-panel'
import { ErrorBanner } from '@/components/error-banner'
import { IncidentList } from '@/components/incident-list'
import { MetricCard } from '@/components/metric-card'
import { RiskByAssetChart } from '@/components/risk-by-asset-chart'
import { RiskDistributionChart } from '@/components/risk-distribution-chart'
import { RiskSummaryBar } from '@/components/risk-summary-bar'
import { Spinner } from '@/components/spinner'
import { useActiveIncidents, useFleetOverview, useRecentConversations } from '@/hooks/use-fleet'
import type { FleetAssetCard } from '@streaming-agents/domain-models'

/** Sort assets: critical first, then elevated, then nominal. */
function sortByRisk(assets: FleetAssetCard[]): FleetAssetCard[] {
  const order = { critical: 0, elevated: 1, nominal: 2 }
  return [...assets].sort(
    (a, b) => order[a.risk_state] - order[b.risk_state] || b.composite_risk - a.composite_risk
  )
}

export function FleetOverviewPage() {
  const fleet = useFleetOverview()
  const incidents = useActiveIncidents()
  const conversations = useRecentConversations()

  if (fleet.isLoading) return <Spinner />
  if (fleet.error) return <ErrorBanner message={fleet.error.message} />

  // biome-ignore lint/style/noNonNullAssertion: guarded by error check above
  const data = fleet.data!
  const atRisk = data.risk_summary.elevated + data.risk_summary.critical
  const sorted = sortByRisk(data.assets)

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Total Assets" value={data.total_assets} sub="in fleet" />
        <MetricCard
          label="Nominal"
          value={data.risk_summary.nominal}
          sub={`of ${data.total_assets}`}
          accent="nominal"
        />
        <MetricCard label="At Risk" value={atRisk} accent={atRisk > 0 ? 'elevated' : undefined} />
        <MetricCard
          label="Active Incidents"
          value={data.active_incidents}
          accent={data.active_incidents > 0 ? 'critical' : undefined}
        />
      </div>

      {/* Risk distribution bar */}
      <RiskSummaryBar {...data.risk_summary} />

      {/* Section heading — spans full width above the grid */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Fleet Assets
        <span className="ml-2 text-gray-600">({data.total_assets})</span>
      </h2>

      {/* Main content: asset cards + sidebar charts — tops aligned */}
      <div className="-mt-3 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Asset grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {sorted.map((asset) => (
            <AssetCard key={asset.asset_id} asset={asset} />
          ))}
        </div>

        {/* Sidebar charts */}
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-surface-alt p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Risk Distribution
            </h2>
            <RiskDistributionChart {...data.risk_summary} />
          </section>

          <section className="rounded-lg border border-border bg-surface-alt p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Risk by Asset
            </h2>
            <RiskByAssetChart assets={sorted} />
          </section>

          {/* Voice Assistant */}
          <section className="rounded-lg border border-border bg-surface-alt p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Voice Assistant
            </h2>
            <ConversationPanel conversations={conversations.data?.conversations ?? []} />
          </section>
        </aside>
      </div>

      {/* Active Incidents — full width */}
      {incidents.data && incidents.data.count > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Active Incidents
            <span className="ml-2 text-critical">({incidents.data.count})</span>
          </h2>
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <IncidentList incidents={incidents.data.incidents} />
          </div>
        </section>
      )}
    </div>
  )
}
