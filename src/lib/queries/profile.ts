import { supabase } from '../supabase'
import type { Profile } from '../types'

export async function updateProfile(
  id: string,
  input: {
    display_name?: string | null
    day_start?: string
    day_end?: string
  }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Profile
}
