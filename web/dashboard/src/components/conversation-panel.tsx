import { INTENT_LABELS, timeAgo } from '@/lib/format'
import type { RecentConversationItem } from '@streaming-agents/domain-models'

export function ConversationPanel({
  conversations,
}: {
  conversations: RecentConversationItem[]
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="mb-2 text-2xl">&#127908;</div>
        <p className="text-sm text-gray-400">No recent voice interactions</p>
        <p className="mt-1 text-xs text-gray-600">
          Conversations with the voice assistant will appear here
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {conversations.map((conv, i) => (
        <li key={`${conv.timestamp}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                  {INTENT_LABELS[conv.intent] ?? conv.intent}
                </span>
                <span className="text-[10px] text-gray-600">{timeAgo(conv.timestamp)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-gray-300">{conv.response_summary}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
