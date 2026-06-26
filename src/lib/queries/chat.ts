import { supabase } from '../supabase'
import type { ChatSession, ChatMessage } from '../types'

// Wire format sent to the chat edge function — not stored in DB
export type WireMessage = { role: 'user' | 'model'; text: string }

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

export async function createSession(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function appendMessage(
  sessionId: string,
  role: 'user' | 'model',
  text: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, text })
  if (error) throw error
}

export async function fetchSessions(userId: string): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, user_id, title, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, session_id, role, text, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title })
    .eq('id', sessionId)
  if (error) throw error
}

export async function titleChatSession(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('title-chat-session', {
    body: { sessionId },
  })
  if (error) throw error
  return (data as { title: string | null }).title
}

export async function sendChatMessage(
  message: string,
  history: WireMessage[],
  nowTime: string,
  today: string,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { message, history, nowTime, today },
  })
  if (error) throw error
  return data as ChatResponse
}
