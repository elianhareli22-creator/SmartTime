import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function NavBar() {
  const { profile } = useAuth()
  const handleSignOut = () => supabase.auth.signOut()

  return (
    <nav className="navbar">
      <span className="navbar-brand">SmartTime</span>
      <div className="navbar-links">
        <Link to="/dashboard">לוח זמנים</Link>
        <Link to="/tasks">משימות</Link>
        <Link to="/chat">צ'אט</Link>
        <Link to="/profile">פרופיל</Link>
        {profile?.display_name && (
          <span className="navbar-user">{profile.display_name}</span>
        )}
        <button onClick={handleSignOut} className="btn-link">יציאה</button>
      </div>
    </nav>
  )
}
