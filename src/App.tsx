import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Profile from './pages/Profile'
import Chat from './pages/Chat'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'
import './App.css'

function AppLayout({ children, fullWidth }: { children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <>
      <NavBar />
      <main className={fullWidth ? 'main-content main-content--full' : 'main-content'}>{children}</main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>}
          />
          <Route
            path="/tasks"
            element={<ProtectedRoute><AppLayout><Tasks /></AppLayout></ProtectedRoute>}
          />
          <Route
            path="/profile"
            element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>}
          />
          <Route
            path="/chat"
            element={<ProtectedRoute><AppLayout fullWidth><Chat /></AppLayout></ProtectedRoute>}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
