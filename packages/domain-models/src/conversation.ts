import { z } from 'zod'

// ---------------------------------------------------------------------------
// Conversation — /api/assets/:id/conversations (optional)
// ---------------------------------------------------------------------------

/** A recent conversation exchange for the asset detail sidebar. */
export const RecentConversationItemSchema = z.object({
  timestamp: z.string(),
  intent: z.string(),
  user_input: z.string(),
  response_summary: z.string(),
})
export type RecentConversationItem = z.infer<typeof RecentConversationItemSchema>
