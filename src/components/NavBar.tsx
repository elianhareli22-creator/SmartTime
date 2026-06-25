import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function NavBar() {
  const handleSignOut = () => supabase.auth.signOut()

  return (
    <nav className="navbar">
      <span className="navbar-brand">SmartTime</span>
      <div className="navbar-links">
        <Link to="/dashboard">לוח זמנים</Link>
        <Link to="/tasks">משימות</Link>
        <Link to="/profile">פרופיל</Link>
        <button onClick={handleSignOut} className="btn-link">יציאה</button>
      </div>
    </nav>
  )
}
