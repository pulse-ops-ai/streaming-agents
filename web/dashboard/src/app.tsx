import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './components/shell'
import { AdminPage } from './pages/admin'
import { AssetDetailPage } from './pages/asset-detail'
import { FleetOverviewPage } from './pages/fleet-overview'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<FleetOverviewPage />} />
            <Route path="/asset/:assetId" element={<AssetDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
