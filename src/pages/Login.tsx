import { supabase } from '../lib/supabase'

export default function Login() {
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>SmartTime</h1>
        <p>מתזמן היום החכם שלך</p>
        <button onClick={handleGoogleLogin} className="btn-google">
          כניסה עם Google
        </button>
      </div>
    </div>
  )
}
