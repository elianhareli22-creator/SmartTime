import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { sessionId } = await req.json()

    // Confirm session belongs to this user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()
    if (sessionError || !session) {
      return new Response('Not found', { status: 404, headers: corsHeaders })
    }

    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('role, text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(10)
    if (msgError) throw msgError

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ title: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.text}`)
      .join('\n')

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `סכם את השיחה הבאה ב-4–6 מילים בעברית כשם קצר לשיחה. השב עם השם בלבד, ללא פיסוק:\n\n${transcript}`,
          }],
        }],
      }),
    })

    if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`)
    const json = await res.json()
    const title: string | null = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null

    if (title) {
      const { error: updateError } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId)
      if (updateError) throw updateError
    }

    return new Response(
      JSON.stringify({ title }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
