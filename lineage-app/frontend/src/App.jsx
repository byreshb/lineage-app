import React from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ReportManagement from './pages/ReportManagement'
import LineageViewer from './pages/LineageViewer'
import PbiViewer from './pages/PbiViewer'
import HowItWorks from './pages/HowItWorks'

function App() {
  const location = useLocation()

  return (
    <div className="app">
      <header className="app-header">
        <h1>LINEAGE TRACKER</h1>
        <nav>
          <Link
            to="/"
            className={location.pathname === '/' || location.pathname.startsWith('/lineage') || location.pathname.startsWith('/pbi') ? 'active' : ''}
          >
            Reports
          </Link>
          <Link
            to="/how-it-works"
            className={location.pathname === '/how-it-works' ? 'active' : ''}
          >
            How It Works
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<ReportManagement />} />
          <Route path="/lineage/:reportId" element={<LineageViewer />} />
          <Route path="/pbi/:reportId" element={<PbiViewer />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
