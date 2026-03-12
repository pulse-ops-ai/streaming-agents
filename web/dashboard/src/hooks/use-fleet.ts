import { fetchActiveIncidents, fetchFleetOverview, fetchRecentConversations } from '@/api/client'
import { useQuery } from '@tanstack/react-query'

export function useFleetOverview() {
  return useQuery({
    queryKey: ['fleet'],
    queryFn: fetchFleetOverview,
    refetchInterval: 2000,
  })
}

export function useActiveIncidents() {
  return useQuery({
    queryKey: ['incidents', 'active'],
    queryFn: fetchActiveIncidents,
    refetchInterval: 5000,
  })
}

export function useRecentConversations() {
  return useQuery({
    queryKey: ['conversations', 'recent'],
    queryFn: fetchRecentConversations,
    refetchInterval: 15000,
  })
}
