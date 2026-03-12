import {
  bootstrapDemoFleet,
  clearDemoHistory,
  clearDemoIncidents,
  clearHistory,
  clearIncidents,
  disableCron,
  enableCron,
  fetchCronStatus,
  fetchDemoFleetManifest,
  fetchDemoReadiness,
  resetBaselines,
  runScenario,
  runSimulator,
} from '@/api/client'
import type { DemoFleetAsset, DemoReadiness } from '@/api/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

// ── Types ────────────────────────────────────────────────

type BootstrapState = 'idle' | 'running' | 'completed' | 'failed'

// ── Reusable action button ──────────────────────────────

function ActionButton({
  label,
  onClick,
  variant = 'default',
  small,
  confirm: confirmMsg,
  disabled,
}: {
  label: string
  onClick: () => Promise<unknown>
  variant?: 'default' | 'danger' | 'success'
  small?: boolean
  confirm?: string
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const colors = {
    default: 'bg-gray-600 hover:bg-gray-500',
    danger: 'bg-red-700 hover:bg-red-600',
    success: 'bg-green-700 hover:bg-green-600',
  }

  async function handleClick() {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setLoading(true)
    setResult(null)
    try {
      await onClick()
      setResult('Done')
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const size = small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className={`rounded font-medium text-white transition-colors disabled:opacity-50 ${size} ${colors[variant]}`}
      >
        {loading ? '...' : label}
      </button>
      {result && (
        <span className={`text-xs ${result === 'Done' ? 'text-green-400' : 'text-red-400'}`}>
          {result}
        </span>
      )}
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-surface-alt p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {description && <p className="mb-4 text-xs text-gray-500">{description}</p>}
      {children}
    </section>
  )
}

// ── Scenario picker row ─────────────────────────────────

function ScenarioRow({
  asset,
  scenarios,
  onRun,
}: {
  asset: DemoFleetAsset
  scenarios: string[]
  onRun: () => void
}) {
  const [selectedScenario, setSelectedScenario] = useState(asset.scenario)
  const isLive = asset.source === 'reachy_mini'

  const stateColors: Record<string, string> = {
    nominal: 'text-nominal',
    elevated: 'text-elevated',
    critical: 'text-critical',
  }

  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-3 font-mono text-sm font-semibold">{asset.asset_id}</td>
      <td className="py-2 pr-3">
        {isLive ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-nominal animate-pulse" />
            <span className="text-nominal">Live</span>
          </span>
        ) : (
          <span className="text-xs text-gray-500">Simulator</span>
        )}
      </td>
      <td className={`py-2 pr-3 text-xs ${stateColors[asset.intended_state] ?? 'text-gray-400'}`}>
        {asset.intended_state}
      </td>
      <td className="py-2 pr-3">
        {isLive ? (
          <span className="text-xs text-gray-600">real telemetry</span>
        ) : (
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1 text-xs text-gray-300"
          >
            {scenarios.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="py-2">
        {!isLive && (
          <ActionButton
            label="Run"
            small
            onClick={async () => {
              await runScenario(asset.asset_id, selectedScenario)
              onRun()
            }}
            variant="success"
          />
        )}
      </td>
    </tr>
  )
}

// ── Readiness panel ─────────────────────────────────────

function ReadinessPanel({ readiness }: { readiness: DemoReadiness | undefined }) {
  if (!readiness) {
    return (
      <div className="rounded border border-border/50 bg-surface px-4 py-3">
        <p className="text-xs text-gray-500">Checking fleet readiness...</p>
      </div>
    )
  }

  const stateColors: Record<string, string> = {
    nominal: 'text-nominal',
    elevated: 'text-elevated',
    critical: 'text-critical',
  }

  return (
    <div
      className={`rounded border px-4 py-3 ${readiness.ready ? 'border-green-700/50 bg-green-950/20' : 'border-yellow-700/50 bg-yellow-950/20'}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${readiness.ready ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}
        />
        <span
          className={`text-sm font-semibold ${readiness.ready ? 'text-green-400' : 'text-yellow-400'}`}
        >
          {readiness.ready ? 'Demo Fleet Ready' : 'Fleet Not Ready'}
        </span>
        <span className="ml-auto text-[10px] text-gray-600">
          {readiness.incident_count} active incident{readiness.incident_count !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {readiness.assets.map((asset) => (
          <div
            key={asset.asset_id}
            className={`rounded border px-2 py-1.5 text-center ${asset.match ? 'border-border/30 bg-surface' : 'border-yellow-700/30 bg-yellow-950/10'}`}
          >
            <div className="font-mono text-xs font-semibold">{asset.asset_id}</div>
            {asset.has_data ? (
              <div
                className={`text-[10px] ${stateColors[asset.actual_state ?? ''] ?? 'text-gray-400'}`}
              >
                {asset.actual_state}
              </div>
            ) : (
              <div className="text-[10px] text-gray-600">no data</div>
            )}
            <div className="mt-0.5">
              {asset.match ? (
                <span className="text-[10px] text-green-500">ok</span>
              ) : (
                <span className="text-[10px] text-yellow-500">want {asset.intended_state}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main admin page ─────────────────────────────────────

export function AdminPage() {
  const queryClient = useQueryClient()
  const invalidateFleet = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['fleet'] }),
    [queryClient]
  )

  // ── Bootstrap state ──
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>('idle')
  const [bootstrapTimestamp, setBootstrapTimestamp] = useState<string | null>(null)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  const handleBootstrap = useCallback(async () => {
    if (
      !window.confirm(
        'This will clear all demo asset state, incidents, and history, then start fresh simulator workers. Continue?'
      )
    )
      return
    setBootstrapState('running')
    setBootstrapError(null)
    try {
      await bootstrapDemoFleet()
      setBootstrapState('completed')
      setBootstrapTimestamp(new Date().toLocaleTimeString())
      invalidateFleet()
      queryClient.invalidateQueries({ queryKey: ['admin', 'readiness'] })
    } catch (err) {
      setBootstrapState('failed')
      setBootstrapError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [invalidateFleet, queryClient])

  // ── Queries ──
  const cronStatus = useQuery({
    queryKey: ['admin', 'cron-status'],
    queryFn: fetchCronStatus,
    refetchInterval: 5000,
  })

  const demoFleet = useQuery({
    queryKey: ['admin', 'demo-fleet'],
    queryFn: fetchDemoFleetManifest,
  })

  const readiness = useQuery({
    queryKey: ['admin', 'readiness'],
    queryFn: fetchDemoReadiness,
    refetchInterval: bootstrapState === 'running' || bootstrapState === 'completed' ? 3000 : 10000,
  })

  const cronState = cronStatus.data?.state
  const cronLoading = cronStatus.isLoading
  const cronEnabled = cronState === 'ENABLED'

  const fleet = demoFleet.data?.fleet ?? []
  const scenarios = demoFleet.data?.scenarios ?? []

  // ── Bootstrap status display ──
  const bootstrapStatusLabel: Record<BootstrapState, { text: string; color: string }> = {
    idle: { text: 'Ready to bootstrap', color: 'text-gray-500' },
    running: { text: 'Bootstrap running...', color: 'text-blue-400' },
    completed: { text: `Completed at ${bootstrapTimestamp}`, color: 'text-green-400' },
    failed: { text: `Failed: ${bootstrapError}`, color: 'text-red-400' },
  }
  const bsStatus = bootstrapStatusLabel[bootstrapState]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/" className="text-gray-400 hover:text-gray-200">
          &larr; Fleet
        </Link>
        <h1 className="text-2xl font-bold">Demo Orchestration</h1>
      </div>

      {/* ── Demo Fleet Ready ───────────────────────── */}
      <ReadinessPanel readiness={readiness.data} />

      {/* ── Fleet Composition & Bootstrap ─────────── */}
      <Section
        title="Fleet Composition"
        description="Bootstrap is the standard pre-demo action — it resets state, clears incidents and history, then starts fresh simulator workers. The fleet populates in ~30 seconds."
      >
        {fleet.length > 0 && (
          <table className="mb-4 w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-gray-500">
                <th className="pb-1.5 pr-3">Asset</th>
                <th className="pb-1.5 pr-3">Source</th>
                <th className="pb-1.5 pr-3">Target</th>
                <th className="pb-1.5 pr-3">Scenario</th>
                <th className="pb-1.5" />
              </tr>
            </thead>
            <tbody>
              {fleet.map((asset) => (
                <ScenarioRow
                  key={asset.asset_id}
                  asset={asset}
                  scenarios={scenarios}
                  onRun={invalidateFleet}
                />
              ))}
            </tbody>
          </table>
        )}

        <div className="border-t border-border/50 pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={bootstrapState === 'running'}
              className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              {bootstrapState === 'running' ? 'Bootstrapping...' : 'Bootstrap Demo Fleet'}
            </button>
            <span className={`text-xs ${bsStatus.color}`}>{bsStatus.text}</span>
          </div>
          {bootstrapState === 'completed' && (
            <p className="mt-2 text-[10px] text-gray-600">
              Workers invoked — watch the readiness panel above. Fleet reaches target states in
              ~30s.
            </p>
          )}
        </div>
      </Section>

      {/* ── Incident & History Cleanup ────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section
          title="Incident Cleanup"
          description="Clear incidents for individual assets or the entire demo fleet."
        >
          <div className="space-y-2">
            <ActionButton
              label="Clear All Demo Incidents"
              onClick={async () => {
                await clearDemoIncidents()
                invalidateFleet()
                queryClient.invalidateQueries({ queryKey: ['admin', 'readiness'] })
              }}
              variant="danger"
              confirm="Clear all incidents for R-1, R-2, R-8, R-50?"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {fleet
                .filter((a) => a.source !== 'reachy_mini')
                .map((a) => (
                  <ActionButton
                    key={a.asset_id}
                    label={a.asset_id}
                    small
                    onClick={async () => {
                      await clearIncidents(a.asset_id)
                      invalidateFleet()
                    }}
                    variant="danger"
                  />
                ))}
            </div>
          </div>
        </Section>

        <Section
          title="History Cleanup"
          description="Clear risk history for individual assets or the entire demo fleet."
        >
          <div className="space-y-2">
            <ActionButton
              label="Clear All Demo History"
              onClick={async () => {
                await clearDemoHistory()
                invalidateFleet()
              }}
              variant="danger"
              confirm="Clear all history for R-1, R-2, R-8, R-50?"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {fleet
                .filter((a) => a.source !== 'reachy_mini')
                .map((a) => (
                  <ActionButton
                    key={a.asset_id}
                    label={a.asset_id}
                    small
                    onClick={async () => {
                      await clearHistory(a.asset_id)
                      invalidateFleet()
                    }}
                    variant="danger"
                  />
                ))}
            </div>
          </div>
        </Section>
      </div>

      {/* ── Simulator Controls ────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section
          title="Simulator Controller"
          description="Invoke the simulator controller Lambda to generate a batch of telemetry using the default distribution."
        >
          <ActionButton label="Run Simulator" onClick={runSimulator} variant="success" />
        </Section>

        <Section title="Simulator Cron">
          <p className="mb-3 text-xs text-gray-500">
            EventBridge rule — triggers every 5 min. Status:{' '}
            {cronLoading ? (
              <span className="font-medium text-gray-500">loading...</span>
            ) : (
              <span
                className={cronEnabled ? 'font-medium text-green-400' : 'font-medium text-red-400'}
              >
                {cronState}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <ActionButton
              label="Enable"
              small
              onClick={async () => {
                await enableCron()
                queryClient.invalidateQueries({ queryKey: ['admin', 'cron-status'] })
              }}
              variant="success"
            />
            <ActionButton
              label="Disable"
              small
              onClick={async () => {
                await disableCron()
                queryClient.invalidateQueries({ queryKey: ['admin', 'cron-status'] })
              }}
              variant="danger"
            />
          </div>
        </Section>
      </div>

      {/* ── Baseline Reset ────────────────────────── */}
      <Section
        title="Reset Baselines"
        description="Delete an asset's state from DynamoDB — the signal agent will rebuild baselines from scratch on the next reading."
      >
        <BaselineReset />
      </Section>
    </div>
  )
}

// ── Baseline reset sub-component ────────────────────────

function BaselineReset() {
  const [assetId, setAssetId] = useState('R-17')

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        value={assetId}
        onChange={(e) => setAssetId(e.target.value)}
        className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-white"
        placeholder="Asset ID"
      />
      <ActionButton
        label={`Reset ${assetId}`}
        onClick={() => resetBaselines(assetId)}
        variant="danger"
        confirm={`Delete all state for ${assetId}? Signal agent will rebuild baselines.`}
      />
    </div>
  )
}
