import { fetchAssetDetail, fetchAssetHistory } from '@/api/client'
import { useQuery } from '@tanstack/react-query'

export function useAssetDetail(assetId: string) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => fetchAssetDetail(assetId),
    refetchInterval: 1000,
    enabled: !!assetId,
  })
}

export function useAssetHistory(assetId: string, minutes = 5) {
  return useQuery({
    queryKey: ['asset', assetId, 'history', minutes],
    queryFn: () => fetchAssetHistory(assetId, minutes),
    refetchInterval: 2000,
    enabled: !!assetId,
  })
}
