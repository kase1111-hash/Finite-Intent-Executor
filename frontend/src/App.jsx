import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import IntentCapture from './pages/IntentCapture'
import TriggerConfig from './pages/TriggerConfig'
import IPTokens from './pages/IPTokens'
import ExecutionMonitor from './pages/ExecutionMonitor'
import SunsetStatus from './pages/SunsetStatus'
import Lexicon from './pages/Lexicon'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="intent" element={<IntentCapture />} />
        <Route path="triggers" element={<TriggerConfig />} />
        <Route path="tokens" element={<IPTokens />} />
        <Route path="execution" element={<ExecutionMonitor />} />
        <Route path="sunset" element={<SunsetStatus />} />
        <Route path="lexicon" element={<Lexicon />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
