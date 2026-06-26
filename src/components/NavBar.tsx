import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

export default function NavBar() {
  const { profile } = useAuth()
  const handleSignOut = () => supabase.auth.signOut()

  return (
    <nav className="navbar">
      <div className="navbar-start">
        <span className="navbar-brand">SmartTime</span>
        {profile?.display_name && (
          <span className="navbar-user">{timeGreeting()}, {profile.display_name}</span>
        )}
      </div>
      <div className="navbar-links">
        <Link to="/dashboard">לוח זמנים</Link>
        <Link to="/tasks">משימות</Link>
        <Link to="/chat">צ'אט</Link>
        <Link to="/profile">פרופיל</Link>
        <button onClick={handleSignOut} className="btn-link">יציאה</button>
      </div>
    </nav>
  )
}
