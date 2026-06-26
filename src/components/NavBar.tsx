import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

export default function NavBar() {
  const { profile } = useAuth()
  const { notifications, unreadCount, markAllRead, dismissNotification } = useNotifications()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)

  const handleSignOut = () => supabase.auth.signOut()

  useEffect(() => {
    if (!open && !menuOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open, menuOpen])

  function handleBellClick() {
    setOpen(prev => {
      if (prev) markAllRead()
      return !prev
    })
  }

  return (
    <nav className="navbar" ref={navRef}>
      <div className="navbar-start">
        <span className="navbar-brand">SmartTime</span>
        {profile?.display_name && (
          <span className="navbar-user">{timeGreeting()}, {profile.display_name}</span>
        )}
        <div className="navbar-bell" ref={bellRef}>
          <button className="navbar-bell-btn" onClick={handleBellClick} aria-label="התראות" aria-expanded={open}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>
          {open && (
            <div className="bell-dropdown">
              <div className="bell-dropdown-header">
                <span className="bell-dropdown-title">התראות</span>
                {notifications.some(n => !n.read) && (
                  <button className="bell-mark-read" onClick={markAllRead}>סמן הכל כנקרא</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="bell-empty">אין התראות</p>
              ) : (
                <ul className="bell-list">
                  {[...notifications]
                    .sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime())
                    .map(n => (
                    <li key={n.id} className={`bell-item${n.read ? '' : ' bell-item--unread'}`}>
                      <div className="bell-item-body">
                        <span className="bell-item-title">{n.title}</span>
                        <span className="bell-item-meta">
                          {n.threshold === '10' ? '10 דקות לפני' : 'דקה אחת לפני'}
                          {' · '}
                          {n.firedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <button
                        className="bell-item-dismiss"
                        onClick={() => dismissNotification(n.id)}
                        aria-label="הסר התראה"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Desktop navigation — hidden on mobile */}
      <div className="navbar-links">
        <Link to="/dashboard">לוח זמנים</Link>
        <Link to="/tasks">משימות</Link>
        <Link to="/chat">צ'אט</Link>
        <Link to="/profile">פרופיל</Link>
        <button onClick={handleSignOut} className="btn-link">יציאה</button>
      </div>

      {/* Mobile hamburger button — hidden on desktop */}
      <button
        className={`navbar-hamburger${menuOpen ? ' navbar-hamburger--open' : ''}`}
        onClick={() => setMenuOpen(prev => !prev)}
        aria-label="תפריט ניווט"
        aria-expanded={menuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="navbar-mobile-menu">
          <Link to="/dashboard" onClick={() => setMenuOpen(false)}>לוח זמנים</Link>
          <Link to="/tasks" onClick={() => setMenuOpen(false)}>משימות</Link>
          <Link to="/chat" onClick={() => setMenuOpen(false)}>צ'אט</Link>
          <Link to="/profile" onClick={() => setMenuOpen(false)}>פרופיל</Link>
          <button onClick={() => { setMenuOpen(false); handleSignOut() }} className="navbar-mobile-signout">יציאה</button>
        </div>
      )}
    </nav>
  )
}
