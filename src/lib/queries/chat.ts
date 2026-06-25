import { supabase } from '../supabase'
import type { Task, ScheduleBlock, Profile } from '../types'

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

export type ChatContext = {
  tasks: Task[]
  blocks: ScheduleBlock[]
  profile: Profile
  nowTime: string
  today: string
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  context: ChatContext,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { message, history, context },
  })
  if (error) throw error
  return data as ChatResponse
}
