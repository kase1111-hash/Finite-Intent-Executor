import React, { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { LICENSE_TYPES } from '../contracts/config'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  Sunset,
  Archive,
  FileText,
  Globe,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  ChevronRight,
} from 'lucide-react'
import { format, differenceInDays, differenceInYears, addYears } from 'date-fns'

function SunsetStatus() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sunsetStatus, setSunsetStatus] = useState(null)
  const [triggerTimestamp, setTriggerTimestamp] = useState(null)
  const [isSunsetDue, setIsSunsetDue] = useState(false)

  // Archive form
  const [archiveForm, setArchiveForm] = useState({
    assets: [''],
    uris: [''],
    hashes: [''],
  })

  const fetchSunsetData = useCallback(async () => {
    if (!isConnected || !account || !contracts.SunsetProtocol) return

    setLoading(true)
    try {
      const status = await contracts.SunsetProtocol.getSunsetStatus(account)
      setSunsetStatus(status)

      // Try to get trigger timestamp from trigger mechanism
      if (contracts.TriggerMechanism) {
        const triggerConfig = await contracts.TriggerMechanism.getTriggerConfig(account)
        if (triggerConfig.triggeredAt > 0) {
          setTriggerTimestamp(Number(triggerConfig.triggeredAt))

          // Check if sunset is due
          const due = await contracts.SunsetProtocol.isSunsetDue(
            account,
            triggerConfig.triggeredAt
          )
          setIsSunsetDue(due)
        }
      }
    } catch (err) {
      console.error('Failed to fetch sunset data:', err)
    } finally {
      setLoading(false)
    }
  }, [account, contracts, isConnected])

  useEffect(() => {
    fetchSunsetData()
  }, [fetchSunsetData])

  const handleInitiateSunset = async () => {
    if (!triggerTimestamp) {
      toast.error('No trigger timestamp found')
      return
    }

    setSubmitting(true)
    try {
      const tx = await contracts.SunsetProtocol.initiateSunset(account, triggerTimestamp)
      toast.loading('Initiating sunset...', { id: 'sunset' })
      await tx.wait()
      toast.success('Sunset initiated!', { id: 'sunset' })
      fetchSunsetData()
    } catch (err) {
      console.error('Failed to initiate sunset:', err)
      toast.error(err.reason || 'Failed to initiate sunset')
    } finally {
      setSubmitting(false)
    }
  }

  const handleArchiveAssets = async (e) => {
    e.preventDefault()

    const validAssets = archiveForm.assets.filter(a => ethers.isAddress(a))
    const validUris = archiveForm.uris.filter(u => u.trim())
    const validHashes = archiveForm.hashes.filter(h => h.trim())

    if (validAssets.length === 0) {
      toast.error('At least one valid asset address required')
      return
    }

    setSubmitting(true)
    try {
      // Pad arrays to match lengths
      const maxLen = Math.max(validAssets.length, validUris.length, validHashes.length)
      const assets = validAssets.slice(0, maxLen)
      const uris = validUris.slice(0, maxLen)
      const hashes = validHashes.map(h => h.startsWith('0x') ? h : ethers.ZeroHash).slice(0, maxLen)

      const tx = await contracts.SunsetProtocol.archiveAssets(account, assets, uris, hashes)
      toast.loading('Archiving assets...', { id: 'archive' })
      await tx.wait()
      toast.success('Assets archived!', { id: 'archive' })
      fetchSunsetData()
    } catch (err) {
      console.error('Failed to archive assets:', err)
      toast.error(err.reason || 'Failed to archive assets')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTransitionIP = async (licenseType) => {
    setSubmitting(true)
    try {
      const tx = await contracts.SunsetProtocol.transitionIP(account, licenseType)
      toast.loading('Transitioning IP...', { id: 'transition' })
      await tx.wait()
      toast.success('IP transitioned to public domain!', { id: 'transition' })
      fetchSunsetData()
    } catch (err) {
      console.error('Failed to transition IP:', err)
      toast.error(err.reason || 'Failed to transition IP')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCompleteSunset = async () => {
    setSubmitting(true)
    try {
      const tx = await contracts.SunsetProtocol.completeSunset(account)
      toast.loading('Completing sunset...', { id: 'complete' })
      await tx.wait()
      toast.success('Sunset completed!', { id: 'complete' })
      fetchSunsetData()
    } catch (err) {
      console.error('Failed to complete sunset:', err)
      toast.error(err.reason || 'Failed to complete sunset')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEmergencySunset = async () => {
    if (!confirm('This will immediately trigger sunset. This action cannot be undone. Continue?')) {
      return
    }

    setSubmitting(true)
    try {
      const tx = await contracts.SunsetProtocol.emergencySunset(account, triggerTimestamp || 0)
      toast.loading('Emergency sunset...', { id: 'emergency' })
      await tx.wait()
      toast.success('Emergency sunset initiated!', { id: 'emergency' })
      fetchSunsetData()
    } catch (err) {
      console.error('Failed to trigger emergency sunset:', err)
      toast.error(err.reason || 'Failed to trigger emergency sunset')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <Sunset size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Connect your wallet to view sunset status</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const currentPhase = sunsetStatus ? Number(sunsetStatus.phase) : 0
  const isComplete = sunsetStatus?.isComplete

  // Calculate progress
  let sunsetProgress = 0
  let daysRemaining = null
  let yearsRemaining = null
  let sunsetDate = null

  if (triggerTimestamp) {
    const triggerDate = new Date(triggerTimestamp * 1000)
    sunsetDate = addYears(triggerDate, 20)
    const now = new Date()
    const totalDays = 20 * 365
    const daysElapsed = differenceInDays(now, triggerDate)
    daysRemaining = Math.max(0, differenceInDays(sunsetDate, now))
    yearsRemaining = Math.max(0, differenceInYears(sunsetDate, now))
    sunsetProgress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100))
  }

  const phases = [
    { phase: 1, label: 'Initiated', icon: Play, description: 'Sunset process started' },
    { phase: 2, label: 'Assets Archived', icon: Archive, description: 'Assets stored on decentralized storage' },
    { phase: 3, label: 'IP Transitioned', icon: Globe, description: 'IP moved to public domain' },
    { phase: 4, label: 'Legacy Clustered', icon: FileText, description: 'Semantic clustering complete' },
    { phase: 5, label: 'Completed', icon: CheckCircle, description: 'Sunset fully complete' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sunset Protocol</h1>
          <p className="text-gray-600 mt-1">
            20-year mandatory termination and public domain transition
          </p>
        </div>
        <button
          onClick={fetchSunsetData}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Countdown Card */}
      {triggerTimestamp && !isComplete && (
        <div className="card bg-gradient-to-br from-sunset-50 to-sunset-100 border-sunset-200">
          <div className="card-body">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-white rounded-xl shadow-sm">
                  <Sunset size={32} className="text-sunset-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Time Until Sunset</h2>
                  <p className="text-gray-600">
                    Mandatory public domain transition
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold text-sunset-600">
                  {yearsRemaining !== null ? `${yearsRemaining}y ${daysRemaining % 365}d` : 'N/A'}
                </p>
                <p className="text-sm text-gray-500">
                  {sunsetDate ? format(sunsetDate, 'PPP') : ''}
                </p>
              </div>
            </div>

            <div className="sunset-progress h-6">
              <div className="sunset-progress-bar" style={{ width: `${sunsetProgress}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Triggered: {format(new Date(triggerTimestamp * 1000), 'PP')}</span>
              <span className="font-medium">{sunsetProgress.toFixed(1)}% complete</span>
              <span>Sunset: {sunsetDate ? format(sunsetDate, 'PP') : ''}</span>
            </div>
          </div>
        </div>
      )}

      {/* Phase Progress */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold text-gray-900">Sunset Phases</h3>
        </div>
        <div className="card-body">
          <div className="relative">
            {/* Progress line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div
              className="absolute left-6 top-0 w-0.5 bg-sunset-500 transition-all duration-500"
              style={{ height: `${(currentPhase / 5) * 100}%` }}
            />

            <div className="space-y-6 relative">
              {phases.map(({ phase, label, icon: Icon, description }) => {
                const isCompleted = currentPhase >= phase
                const isCurrent = currentPhase === phase - 1

                return (
                  <div key={phase} className="flex items-center gap-4">
                    <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-sunset-500 text-white' :
                      isCurrent ? 'bg-sunset-100 text-sunset-600 ring-2 ring-sunset-500' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${isCompleted ? 'text-gray-900' : 'text-gray-500'}`}>
                        {label}
                      </p>
                      <p className="text-sm text-gray-500">{description}</p>
                    </div>
                    {isCompleted && (
                      <CheckCircle size={20} className="text-sunset-500" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Action Cards */}
      {!isComplete && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Initiate Sunset */}
          {currentPhase === 0 && isSunsetDue && (
            <div className="card border-sunset-200">
              <div className="card-header bg-sunset-50">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-sunset-600" />
                  Sunset Due
                </h3>
              </div>
              <div className="card-body">
                <p className="text-gray-600 mb-4">
                  The 20-year period has elapsed. You can now initiate the sunset process.
                </p>
                <button
                  onClick={handleInitiateSunset}
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
                  Initiate Sunset
                </button>
              </div>
            </div>
          )}

          {/* Archive Assets */}
          {currentPhase === 1 && (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Archive size={20} />
                  Archive Assets
                </h3>
              </div>
              <form onSubmit={handleArchiveAssets} className="card-body space-y-4">
                <div>
                  <label className="label">Asset Address</label>
                  <input
                    type="text"
                    value={archiveForm.assets[0]}
                    onChange={(e) => setArchiveForm(prev => ({
                      ...prev,
                      assets: [e.target.value]
                    }))}
                    placeholder="0x..."
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label className="label">Archive URI</label>
                  <input
                    type="text"
                    value={archiveForm.uris[0]}
                    onChange={(e) => setArchiveForm(prev => ({
                      ...prev,
                      uris: [e.target.value]
                    }))}
                    placeholder="ipfs://..."
                    className="input font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Archive size={18} />}
                  Archive Assets
                </button>
              </form>
            </div>
          )}

          {/* Transition IP */}
          {currentPhase === 2 && (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Globe size={20} />
                  Transition to Public Domain
                </h3>
              </div>
              <div className="card-body">
                <p className="text-gray-600 mb-4">
                  Select the public domain license for your IP:
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleTransitionIP(0)}
                    disabled={submitting}
                    className="btn-primary w-full text-left flex items-center justify-between"
                  >
                    <span>CC0 (Public Domain Dedication)</span>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => handleTransitionIP(1)}
                    disabled={submitting}
                    className="btn-secondary w-full text-left flex items-center justify-between"
                  >
                    <span>CC-BY (Attribution)</span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Complete Sunset */}
          {currentPhase >= 3 && currentPhase < 5 && (
            <div className="card border-green-200">
              <div className="card-header bg-green-50">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-600" />
                  Complete Sunset
                </h3>
              </div>
              <div className="card-body">
                <p className="text-gray-600 mb-4">
                  All phases complete. Finalize the sunset process.
                </p>
                <button
                  onClick={handleCompleteSunset}
                  disabled={submitting}
                  className="btn-success w-full flex items-center justify-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                  Complete Sunset
                </button>
              </div>
            </div>
          )}

          {/* Emergency Sunset */}
          {isSunsetDue && !isComplete && (
            <div className="card border-red-200">
              <div className="card-header bg-red-50">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-600" />
                  Emergency Sunset
                </h3>
              </div>
              <div className="card-body">
                <p className="text-gray-600 mb-4">
                  Anyone can trigger this after 20 years if the owner has not.
                </p>
                <button
                  onClick={handleEmergencySunset}
                  disabled={submitting}
                  className="btn-danger w-full flex items-center justify-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
                  Emergency Sunset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed State */}
      {isComplete && (
        <div className="card bg-green-50 border-green-200">
          <div className="card-body text-center py-12">
            <CheckCircle size={64} className="mx-auto text-green-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sunset Complete</h2>
            <p className="text-gray-600 max-w-md mx-auto">
              Your legacy has been successfully transitioned to public domain.
              All IP is now freely available under {LICENSE_TYPES[sunsetStatus?.licenseType || 0]}.
            </p>
            {sunsetStatus?.completedAt > 0 && (
              <p className="text-sm text-gray-500 mt-4">
                Completed: {format(new Date(Number(sunsetStatus.completedAt) * 1000), 'PPpp')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SunsetStatus
