import { supabase } from '../supabase'
import type { BreakTemplate } from '../types'

export async function getBreakTemplates(userId: string): Promise<BreakTemplate[]> {
  const { data, error } = await supabase
    .from('break_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as BreakTemplate[]
}

export async function createBreakTemplate(
  userId: string,
  input: Omit<BreakTemplate, 'id' | 'user_id' | 'created_at'>,
): Promise<BreakTemplate> {
  const { data, error } = await supabase
    .from('break_templates')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data as BreakTemplate
}

export async function updateBreakTemplate(
  id: string,
  input: Partial<Omit<BreakTemplate, 'id' | 'user_id' | 'created_at'>>,
): Promise<BreakTemplate> {
  const { data, error } = await supabase
    .from('break_templates')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as BreakTemplate
}

export async function deleteBreakTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('break_templates').delete().eq('id', id)
  if (error) throw error
}
