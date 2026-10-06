import React, { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { SUNSET_LICENSE_TYPES } from '../contracts/config'
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
  Plus,
  Trash2,
  Lock,
} from 'lucide-react'
import { format, differenceInDays, differenceInYears, addYears } from 'date-fns'
import CreatorSelector from '../components/CreatorSelector'
import { sendTx } from '../utils/transactions'

const EMPTY_ROW = { address: '', uri: '', content: '' }

const PHASES = [
  { phase: 1, label: 'Initiated', icon: Play, description: 'Execution halted for good' },
  { phase: 2, label: 'Assets Archived', icon: Archive, description: 'Assets stored on decentralized storage' },
  { phase: 3, label: 'IP Transitioned', icon: Globe, description: 'IP moved to the public domain' },
  { phase: 4, label: 'Legacy Clustered', icon: FileText, description: 'Grouped with similar legacies for discovery' },
  { phase: 5, label: 'Completed', icon: CheckCircle, description: 'Sunset fully complete' },
]

function SunsetStatus() {
  const { account, contracts, isConnected, chainNow, refreshKey } = useWeb3()
  const [creatorOverride, setCreatorOverride] = useState(null)
  const creator = creatorOverride ?? account
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState(null)

  const [archiveRows, setArchiveRows] = useState([EMPTY_ROW])
  const [clusterLabel, setClusterLabel] = useState('')

  const fetchSunsetData = useCallback(async () => {
    if (!isConnected || !creator || !contracts.SunsetProtocol) return

    setLoading(true)
    try {
      const [state, isDue, archived, triggerTimestamp, intent] = await Promise.all([
        contracts.SunsetProtocol.getSunsetState(creator),
        contracts.SunsetProtocol.isSunsetDue(creator),
        contracts.SunsetProtocol.getArchivedAssets(creator),
        contracts.ExecutionAgent?.triggerTimestamps(creator).catch(() => 0n) ?? 0n,
        contracts.IntentCaptureModule?.getIntent(creator).catch(() => null),
      ])
      setData({
        state,
        isDue,
        archived,
        triggerTimestamp: Number(triggerTimestamp),
        intentAssets: intent ? [...intent.assetAddresses] : [],
      })
    } catch (err) {
      console.error('Failed to fetch sunset data:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [contracts, creator, isConnected])

  useEffect(() => {
    fetchSunsetData()
  }, [fetchSunsetData, refreshKey])

  const submit = async (txPromise, messages) => {
    setSubmitting(true)
    const receipt = await sendTx(txPromise, messages)
    setSubmitting(false)
    if (receipt) fetchSunsetData()
    return receipt
  }

  const handleInitiateSunset = () => {
    submit(contracts.SunsetProtocol.initiateSunset(creator), {
      id: 'sunset', pending: 'Initiating sunset...', success: 'Sunset initiated!', failure: 'Failed to initiate sunset',
    })
  }

  const handleEmergencySunset = () => {
    if (!confirm('This will immediately start the sunset and permanently halt execution. Continue?')) {
      return
    }
    submit(contracts.SunsetProtocol.emergencySunset(creator), {
      id: 'emergency', pending: 'Starting emergency sunset...', success: 'Sunset initiated!', failure: 'Failed to start emergency sunset',
    })
  }

  const prefillFromIntent = () => {
    const archivedSet = new Set(data.archived.map(a => a.assetAddress.toLowerCase()))
    const pending = data.intentAssets.filter(a => !archivedSet.has(a.toLowerCase()))
    if (pending.length === 0) {
      toast('All of the intent\'s assets are already archived.')
      return
    }
    setArchiveRows(pending.map(address => ({ address, uri: '', content: '' })))
  }

  const updateRow = (index, field, value) => {
    setArchiveRows(rows => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const handleArchiveAssets = async (e) => {
    e.preventDefault()

    const rows = archiveRows.filter(r => r.address.trim() || r.uri.trim() || r.content.trim())
    if (rows.length === 0) {
      toast.error('Add at least one asset to archive')
      return
    }
    for (const row of rows) {
      if (!ethers.isAddress(row.address)) {
        toast.error(`Invalid asset address: ${row.address || '(empty)'}`)
        return
      }
      if (!row.uri.trim() || !row.content.trim()) {
        toast.error('Each asset needs an archive URI and its content (for the integrity hash)')
        return
      }
    }

    const receipt = await submit(
      contracts.SunsetProtocol.archiveAssets(
        creator,
        rows.map(r => r.address),
        rows.map(r => r.uri),
        rows.map(r => ethers.keccak256(ethers.toUtf8Bytes(r.content)))
      ),
      { id: 'archive', pending: 'Archiving assets...', success: 'Assets archived!', failure: 'Failed to archive assets' }
    )
    if (receipt) setArchiveRows([EMPTY_ROW])
  }

  const handleFinalizeArchive = () => {
    submit(contracts.SunsetProtocol.finalizeArchive(creator), {
      id: 'finalize', pending: 'Finalizing archive...', success: 'Archive finalized!', failure: 'Failed to finalize archive',
    })
  }

  const handleTransitionIP = (licenseType) => {
    submit(contracts.SunsetProtocol.transitionIP(creator, licenseType), {
      id: 'transition', pending: 'Transitioning IP...', success: 'IP transitioned to the public domain!', failure: 'Failed to transition IP',
    })
  }

  const handleClusterLegacy = async (e) => {
    e.preventDefault()
    const label = clusterLabel.trim()
    if (!label) {
      toast.error('Name the cluster this legacy belongs to')
      return
    }
    const clusterId = ethers.id(label)

    // Clusters live in the LexiconHolder; create it first if it is new
    const cluster = await contracts.LexiconHolder.getCluster(clusterId)
    if (cluster.clusterId === ethers.ZeroHash) {
      const created = await submit(
        contracts.LexiconHolder.createCluster(clusterId, label),
        { id: 'cluster', pending: `Creating cluster "${label}"...`, success: 'Cluster created.', failure: 'Failed to create cluster' }
      )
      if (!created) return
    }

    const receipt = await submit(
      contracts.SunsetProtocol.clusterLegacy(creator, clusterId),
      { id: 'cluster', pending: 'Clustering legacy...', success: 'Legacy clustered!', failure: 'Failed to cluster legacy' }
    )
    if (receipt) setClusterLabel('')
  }

  const handleCompleteSunset = () => {
    submit(contracts.SunsetProtocol.completeSunset(creator), {
      id: 'complete', pending: 'Completing sunset...', success: 'Sunset completed!', failure: 'Failed to complete sunset',
    })
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

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const state = data?.state
  const isComplete = state?.completed
  const currentPhase = !state ? 0 :
    state.completed ? 5 :
    state.clustered ? 4 :
    state.ipTransitioned ? 3 :
    state.assetsArchived ? 2 :
    state.isSunset ? 1 : 0

  // Countdown from execution activation (ExecutionAgent.triggerTimestamps), in chain time
  let sunsetProgress = 0
  let daysRemaining = null
  let yearsRemaining = null
  let sunsetDate = null

  if (data?.triggerTimestamp && chainNow !== null) {
    const triggerDate = new Date(data.triggerTimestamp * 1000)
    sunsetDate = addYears(triggerDate, 20)
    const now = new Date(chainNow * 1000)
    const totalDays = 20 * 365
    const daysElapsed = differenceInDays(now, triggerDate)
    daysRemaining = Math.max(0, differenceInDays(sunsetDate, now))
    yearsRemaining = Math.max(0, differenceInYears(sunsetDate, now))
    sunsetProgress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100))
  }

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

      <CreatorSelector account={account} creator={creator} onChange={setCreatorOverride} />

      {data && !data.triggerTimestamp && (
        <div className="card p-6 text-gray-600">
          Execution has not been activated for this creator, so the 20-year sunset clock has
          not started.
        </div>
      )}

      {/* Countdown Card */}
      {sunsetDate && !state?.isSunset && (
        <div className="card bg-linear-to-br from-sunset-50 to-sunset-100 border-sunset-200">
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
                  {data.isDue ? 'Due now' : `${yearsRemaining}y ${daysRemaining % 365}d`}
                </p>
                <p className="text-sm text-gray-500">
                  {format(sunsetDate, 'PPP')}
                </p>
              </div>
            </div>

            <div className="sunset-progress h-6">
              <div className="sunset-progress-bar" style={{ width: `${sunsetProgress}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Activated: {format(new Date(data.triggerTimestamp * 1000), 'PP')}</span>
              <span className="font-medium">{sunsetProgress.toFixed(1)}% complete</span>
              <span>Sunset: {format(sunsetDate, 'PP')}</span>
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
              {PHASES.map(({ phase, label, icon: Icon, description }) => {
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
      {data && !isComplete && (
        <div className="space-y-6">
          {currentPhase > 0 && (
            <p className="text-sm text-gray-500">
              Each step requires SUNSET_OPERATOR_ROLE on the SunsetProtocol contract.
            </p>
          )}

          {/* Initiate Sunset */}
          {currentPhase === 0 && data.isDue && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card border-sunset-200">
                <div className="card-header bg-sunset-50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-sunset-600" />
                    Sunset Due
                  </h3>
                </div>
                <div className="card-body">
                  <p className="text-gray-600 mb-4">
                    The 20-year period has elapsed. A sunset operator can now initiate the sunset.
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

              <div className="card border-red-200">
                <div className="card-header bg-red-50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-red-600" />
                    Emergency Sunset
                  </h3>
                </div>
                <div className="card-body">
                  <p className="text-gray-600 mb-4">
                    Anyone can start the sunset once it is due, if no operator has.
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
            </div>
          )}

          {/* Archive Assets */}
          {currentPhase === 1 && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Archive size={20} />
                  Archive Assets
                </h3>
                {data.intentAssets.length > 0 && (
                  <button type="button" onClick={prefillFromIntent} className="btn-secondary text-sm">
                    Use the intent&apos;s assets
                  </button>
                )}
              </div>
              <div className="card-body space-y-4">
                {data.archived.length > 0 && (
                  <div className="text-sm">
                    <p className="text-gray-500 mb-1">Archived so far ({data.archived.length}):</p>
                    <ul className="space-y-1">
                      {data.archived.map((asset, index) => (
                        <li key={index} className="font-mono break-all">
                          {asset.assetAddress} → {asset.storageURI}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <form onSubmit={handleArchiveAssets} className="space-y-3">
                  {archiveRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_2fr_2fr_auto] gap-2">
                      <input
                        type="text"
                        value={row.address}
                        onChange={(e) => updateRow(index, 'address', e.target.value.trim())}
                        placeholder="Asset address 0x..."
                        aria-label={`Asset ${index + 1} address`}
                        className="input font-mono"
                      />
                      <input
                        type="text"
                        value={row.uri}
                        onChange={(e) => updateRow(index, 'uri', e.target.value)}
                        placeholder="Archive URI ipfs://..."
                        aria-label={`Asset ${index + 1} archive URI`}
                        className="input font-mono"
                      />
                      <input
                        type="text"
                        value={row.content}
                        onChange={(e) => updateRow(index, 'content', e.target.value)}
                        placeholder="Archived content (hashed)"
                        aria-label={`Asset ${index + 1} content`}
                        className="input"
                      />
                      <button
                        type="button"
                        onClick={() => setArchiveRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== index) : [EMPTY_ROW])}
                        className="p-2 text-gray-400 hover:text-red-500"
                        title="Remove"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setArchiveRows(rows => [...rows, EMPTY_ROW])}
                      className="btn-secondary text-sm flex items-center gap-1"
                    >
                      <Plus size={16} />
                      Add Asset
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary flex items-center gap-2"
                    >
                      {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Archive size={18} />}
                      Archive Assets
                    </button>
                  </div>
                </form>

                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-600 mb-3">
                    When every asset is archived, finalize the archive. No more assets can be added
                    afterwards.
                  </p>
                  <button
                    onClick={handleFinalizeArchive}
                    disabled={submitting || data.archived.length === 0}
                    className="btn-success flex items-center gap-2"
                  >
                    <Lock size={18} />
                    Finalize Archive
                  </button>
                </div>
              </div>
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
                  Select the post-sunset license for the creator&apos;s IP:
                </p>
                <div className="space-y-2">
                  {Object.entries(SUNSET_LICENSE_TYPES).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => handleTransitionIP(Number(value))}
                      disabled={submitting}
                      className={`${value === '0' ? 'btn-primary' : 'btn-secondary'} w-full text-left flex items-center justify-between`}
                    >
                      <span>{label}</span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cluster Legacy */}
          {currentPhase === 3 && (
            <form onSubmit={handleClusterLegacy} className="card">
              <div className="card-header">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText size={20} />
                  Cluster Legacy
                </h3>
              </div>
              <div className="card-body space-y-4">
                <p className="text-gray-600">
                  Group this legacy with semantically similar archived legacies so it stays
                  discoverable. A new cluster is created in the Lexicon if needed (requires
                  INDEXER_ROLE).
                </p>
                <div>
                  <label className="label" htmlFor="cluster-label">Cluster</label>
                  <input
                    id="cluster-label"
                    type="text"
                    value={clusterLabel}
                    onChange={(e) => setClusterLabel(e.target.value)}
                    placeholder="e.g. digital-rights"
                    className="input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <FileText size={18} />}
                  Cluster Legacy
                </button>
              </div>
            </form>
          )}

          {/* Complete Sunset */}
          {currentPhase === 4 && (
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
        </div>
      )}

      {/* Completed State */}
      {isComplete && (
        <div className="card bg-green-50 border-green-200">
          <div className="card-body text-center py-12">
            <CheckCircle size={64} className="mx-auto text-green-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sunset Complete</h2>
            <p className="text-gray-600 max-w-md mx-auto">
              This legacy has been transitioned to the public domain. All IP is now freely
              available under {SUNSET_LICENSE_TYPES[Number(state.postSunsetLicense)]}.
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Sunset began {format(new Date(Number(state.sunsetTimestamp) * 1000), 'PPpp')}
            </p>
            {state.archiveURI && (
              <p className="text-sm text-gray-500 mt-1 font-mono break-all">
                Archive: {state.archiveURI}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SunsetStatus
