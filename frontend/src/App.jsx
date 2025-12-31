import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

// Lazy load page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const IntentCapture = lazy(() => import('./pages/IntentCapture'))
const TriggerConfig = lazy(() => import('./pages/TriggerConfig'))
const IPTokens = lazy(() => import('./pages/IPTokens'))
const ExecutionMonitor = lazy(() => import('./pages/ExecutionMonitor'))
const SunsetStatus = lazy(() => import('./pages/SunsetStatus'))
const Lexicon = lazy(() => import('./pages/Lexicon'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={
          <Suspense fallback={<PageLoader />}>
            <Dashboard />
          </Suspense>
        } />
        <Route path="intent" element={
          <Suspense fallback={<PageLoader />}>
            <IntentCapture />
          </Suspense>
        } />
        <Route path="triggers" element={
          <Suspense fallback={<PageLoader />}>
            <TriggerConfig />
          </Suspense>
        } />
        <Route path="tokens" element={
          <Suspense fallback={<PageLoader />}>
            <IPTokens />
          </Suspense>
        } />
        <Route path="execution" element={
          <Suspense fallback={<PageLoader />}>
            <ExecutionMonitor />
          </Suspense>
        } />
        <Route path="sunset" element={
          <Suspense fallback={<PageLoader />}>
            <SunsetStatus />
          </Suspense>
        } />
        <Route path="lexicon" element={
          <Suspense fallback={<PageLoader />}>
            <Lexicon />
          </Suspense>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
