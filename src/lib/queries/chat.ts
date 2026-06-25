import { supabase } from '../supabase'

export type ChatMessage = { role: 'user' | 'model'; text: string }

export type ToolCallResult = {
  tool: string
  args: Record<string, unknown>
  result: 'ok' | 'error'
  detail?: string
}

export type ChatResponse = {
  reply: string
  actionsPerformed: ToolCallResult[]
}

// The Edge Function fetches tasks/blocks/profile itself (the DB is the source
// of truth). The client only sends the message, prior conversation turns, and
// its own local time — which the server can't reliably know.
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  nowTime: string,
  today: string,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { message, history, nowTime, today },
  })
  if (error) throw error
  return data as ChatResponse
}
