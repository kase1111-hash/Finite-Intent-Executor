import React, { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { TRIGGER_TYPES, TRIGGER_TYPE } from '../contracts/config'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  Zap,
  Clock,
  Users,
  Radio,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Play,
  Search,
  Info,
} from 'lucide-react'
import { formatDistance, format } from 'date-fns'
import { getErrorMessage } from '../utils/errors'
import { sendTx } from '../utils/transactions'

// IOracle.EventType
const ORACLE_EVENT_TYPES = ['Death', 'Incapacitation', 'Legal Event', 'Custom']

const DAY = 24 * 60 * 60

/** Reads everything needed to act on `creator`'s trigger as `account`. */
async function fetchTriggerLookup(trigger, provider, account, creator) {
  try {
    const [config, signatures, hasSigned, commitBlock, delay, block] = await Promise.all([
      trigger.getTriggerConfig(creator),
      trigger.signatureCount(creator),
      trigger.hasSignedTrigger(creator, account),
      trigger.deadmanCommitBlocks(creator, account),
      trigger.COMMIT_REVEAL_DELAY(),
      provider.getBlock('latest'),
    ])
    return {
      config,
      signatures: Number(signatures),
      hasSigned,
      commitBlock: Number(commitBlock),
      revealBlock: Number(commitBlock) + Number(delay),
      blockNumber: block.number,
      now: block.timestamp,
    }
  } catch (err) {
    toast.error(`Failed to load trigger: ${getErrorMessage(err)}`)
    return null
  }
}

/**
 * Lets a third party act on someone else's trigger: a trusted signer submits
 * their signature, or anyone fires an overdue deadman switch (commit, wait
 * COMMIT_REVEAL_DELAY blocks, then execute).
 */
function CreatorTriggerActions() {
  const { account, contracts, provider, refreshKey } = useWeb3()
  const [creator, setCreator] = useState('')
  const [loadedCreator, setLoadedCreator] = useState(null)
  const [lookup, setLookup] = useState(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const reload = () => setReloadCount((n) => n + 1)

  useEffect(() => {
    if (!contracts.TriggerMechanism || !provider || !loadedCreator) return
    let cancelled = false
    fetchTriggerLookup(contracts.TriggerMechanism, provider, account, loadedCreator)
      .then((result) => { if (!cancelled) setLookup(result) })
    return () => { cancelled = true }
  }, [account, contracts, provider, loadedCreator, refreshKey, reloadCount])

  const handleLoad = (e) => {
    e.preventDefault()
    if (!ethers.isAddress(creator)) {
      toast.error('Enter a valid creator address')
      return
    }
    setLoadedCreator(ethers.getAddress(creator))
  }

  const act = async (txFn, toastOptions) => {
    setSubmitting(true)
    await sendTx(txFn(), toastOptions)
    setSubmitting(false)
    reload()
  }

  const config = lookup?.config
  const type = config?.isConfigured ? Number(config.triggerType) : null
  const now = lookup?.now
  const dueAt = type === TRIGGER_TYPE.DEADMAN_SWITCH
    ? Number(config.lastCheckIn) + Number(config.deadmanInterval)
    : null
  const isSigner = type === TRIGGER_TYPE.TRUSTED_QUORUM &&
    config.trustedSigners.some(s => s.toLowerCase() === account?.toLowerCase())

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users size={20} />
          Act on Another Creator&apos;s Trigger
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          For trusted signers submitting a quorum signature, or anyone executing an overdue
          deadman switch.
        </p>
      </div>
      <div className="card-body space-y-4">
        <form onSubmit={handleLoad} className="flex gap-2">
          <input
            type="text"
            value={creator}
            onChange={(e) => setCreator(e.target.value.trim())}
            placeholder="Creator address 0x..."
            className={`input flex-1 font-mono ${creator && !ethers.isAddress(creator) ? 'input-error' : ''}`}
            aria-label="Creator address"
          />
          <button type="submit" className="btn-secondary flex items-center gap-2">
            <Search size={18} />
            Load
          </button>
        </form>

        {lookup && !config.isConfigured && (
          <p className="text-sm text-gray-600">This creator has not configured a trigger.</p>
        )}

        {lookup && config.isConfigured && (
          <div className="p-4 bg-gray-50 rounded-lg space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{TRIGGER_TYPES[type]}</span>
              {config.isTriggered
                ? <span className="badge-danger">Triggered</span>
                : <span className="badge-success">Armed</span>}
            </div>

            {!config.isTriggered && type === TRIGGER_TYPE.TRUSTED_QUORUM && (
              <>
                <p>Signatures: {lookup.signatures} / {Number(config.requiredSignatures)} required</p>
                {!isSigner ? (
                  <p className="text-gray-600">Your account is not one of this creator&apos;s trusted signers.</p>
                ) : lookup.hasSigned ? (
                  <p className="text-green-700">You have already signed.</p>
                ) : (
                  <button
                    onClick={() => act(
                      () => contracts.TriggerMechanism.submitTrustedSignature(loadedCreator),
                      { id: 'sig', pending: 'Submitting signature...', success: 'Signature submitted!', failure: 'Failed to submit signature' }
                    )}
                    disabled={submitting}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Play size={18} />
                    Submit My Signature
                  </button>
                )}
              </>
            )}

            {!config.isTriggered && type === TRIGGER_TYPE.DEADMAN_SWITCH && (
              <>
                <p>
                  Fires {now >= dueAt ? 'now (overdue since ' : 'at '}
                  {format(new Date(dueAt * 1000), 'PPpp')}{now >= dueAt ? ')' : ''}
                </p>
                {now < dueAt ? (
                  <p className="text-gray-600">
                    The creator is still within their check-in window
                    ({formatDistance(new Date(dueAt * 1000), new Date(now * 1000))} left).
                  </p>
                ) : lookup.commitBlock === 0 ? (
                  <>
                    <p className="text-gray-600">
                      Step 1 of 2: commit to executing. The execution itself is allowed a few
                      blocks later (front-running protection).
                    </p>
                    <button
                      onClick={() => act(
                        () => contracts.TriggerMechanism.commitDeadmanExecution(loadedCreator),
                        { id: 'commit', pending: 'Committing...', success: 'Committed. Execute after the delay.', failure: 'Failed to commit' }
                      )}
                      disabled={submitting}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Play size={18} />
                      Commit to Execute
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-600">
                      Step 2 of 2: committed at block {lookup.commitBlock}. Execution is allowed
                      from block {lookup.revealBlock} (current block {lookup.blockNumber}).
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => act(
                          () => contracts.TriggerMechanism.executeDeadmanSwitch(loadedCreator),
                          { id: 'execute', pending: 'Executing deadman switch...', success: 'Deadman switch executed. Intent triggered.', failure: 'Failed to execute' }
                        )}
                        disabled={submitting || lookup.blockNumber < lookup.revealBlock}
                        className="btn-danger flex items-center gap-2"
                      >
                        <Zap size={18} />
                        Execute Deadman Switch
                      </button>
                      <button onClick={reload} className="btn-secondary flex items-center gap-2">
                        <RefreshCw size={18} />
                        Check Block
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {!config.isTriggered && type === TRIGGER_TYPE.ORACLE_VERIFIED && (
              <p className="text-gray-600">
                Oracle triggers fire through oracle verification (OracleRegistry or ZK proof),
                not from this dashboard.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TriggerConfig() {
  const { account, contracts, isConnected, chainNow, refreshKey } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [triggerConfig, setTriggerConfig] = useState(null)
  const [signatureCount, setSignatureCount] = useState(0)
  const [hasOracleRegistry, setHasOracleRegistry] = useState(false)

  // Form state
  const [selectedType, setSelectedType] = useState(TRIGGER_TYPE.DEADMAN_SWITCH)
  const [deadmanTimeout, setDeadmanTimeout] = useState(90) // days
  const [trustedSigners, setTrustedSigners] = useState(['', ''])
  const [requiredSignatures, setRequiredSignatures] = useState(2)
  const [oracleForm, setOracleForm] = useState({ eventType: 0, evidence: '', requiredOracles: 0 })

  const fetchTriggerConfig = useCallback(async () => {
    if (!isConnected || !account || !contracts.TriggerMechanism) return

    setLoading(true)
    try {
      const [config, count, registry] = await Promise.all([
        contracts.TriggerMechanism.getTriggerConfig(account),
        contracts.TriggerMechanism.signatureCount(account),
        contracts.TriggerMechanism.oracleRegistry(),
      ])
      setTriggerConfig(config)
      setSignatureCount(Number(count))
      setHasOracleRegistry(registry !== ethers.ZeroAddress)
    } catch (err) {
      console.error('Failed to fetch trigger config:', err)
    } finally {
      setLoading(false)
    }
  }, [account, contracts, isConnected])

  useEffect(() => {
    fetchTriggerConfig()
  }, [fetchTriggerConfig, refreshKey])

  const submit = async (txFn, toastOptions) => {
    setSubmitting(true)
    const receipt = await sendTx(txFn(), toastOptions)
    setSubmitting(false)
    if (receipt) fetchTriggerConfig()
  }

  const handleConfigureDeadman = (e) => {
    e.preventDefault()
    if (!(deadmanTimeout >= 30)) {
      toast.error('Minimum timeout is 30 days')
      return
    }
    submit(
      () => contracts.TriggerMechanism.configureDeadmanSwitch(deadmanTimeout * DAY),
      { id: 'config', pending: 'Configuring deadman switch...', success: 'Deadman switch configured!', failure: 'Failed to configure deadman switch' }
    )
  }

  const handleConfigureQuorum = (e) => {
    e.preventDefault()

    const filledSigners = trustedSigners.filter(addr => addr.trim())
    const invalid = filledSigners.find(addr => !ethers.isAddress(addr))
    if (invalid) {
      toast.error(`Invalid address: ${invalid}`)
      return
    }
    if (filledSigners.length < 2) {
      toast.error('At least 2 trusted signers required')
      return
    }
    if (!(requiredSignatures >= 2 && requiredSignatures <= filledSigners.length)) {
      toast.error(`Required signatures must be between 2 and ${filledSigners.length}`)
      return
    }

    submit(
      () => contracts.TriggerMechanism.configureTrustedQuorum(filledSigners, requiredSignatures),
      { id: 'config', pending: 'Configuring trusted quorum...', success: 'Trusted quorum configured!', failure: 'Failed to configure trusted quorum' }
    )
  }

  const handleConfigureOracle = (e) => {
    e.preventDefault()
    if (!oracleForm.evidence.trim()) {
      toast.error('Describe the verification data to commit to')
      return
    }
    submit(
      () => contracts.TriggerMechanism.configureEnhancedOracleVerified(
        oracleForm.eventType,
        ethers.keccak256(ethers.toUtf8Bytes(oracleForm.evidence)),
        oracleForm.requiredOracles
      ),
      { id: 'config', pending: 'Configuring oracle verification...', success: 'Oracle verification configured!', failure: 'Failed to configure oracle verification' }
    )
  }

  const handleCheckIn = () => {
    submit(
      () => contracts.TriggerMechanism.checkIn(),
      { id: 'checkin', pending: 'Checking in...', success: 'Check-in successful! Timer reset.', failure: 'Failed to check in' }
    )
  }

  const addSignerField = () => {
    setTrustedSigners([...trustedSigners, ''])
  }

  const removeSignerField = (index) => {
    if (trustedSigners.length > 2) {
      setTrustedSigners(trustedSigners.filter((_, i) => i !== index))
    }
  }

  const updateSignerField = (index, value) => {
    const newSigners = [...trustedSigners]
    newSigners[index] = value.trim()
    setTrustedSigners(newSigners)
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <Zap size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Connect your wallet to configure triggers</p>
      </div>
    )
  }

  if (loading && !triggerConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const hasConfig = triggerConfig?.isConfigured
  const configuredType = hasConfig ? Number(triggerConfig.triggerType) : null
  const isTriggered = triggerConfig?.isTriggered

  // Calculate time until trigger for deadman switch (in chain time)
  let timeUntilTrigger = null
  let triggerDate = null
  if (configuredType === TRIGGER_TYPE.DEADMAN_SWITCH) {
    triggerDate = new Date((Number(triggerConfig.lastCheckIn) + Number(triggerConfig.deadmanInterval)) * 1000)
    if (chainNow !== null) {
      const now = new Date(chainNow * 1000)
      timeUntilTrigger = triggerDate > now ? formatDistance(triggerDate, now) : 'Overdue'
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trigger Configuration</h1>
          <p className="text-gray-600 mt-1">Configure how your intent will be triggered</p>
        </div>
        <button
          onClick={fetchTriggerConfig}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Active Configuration Display */}
      {hasConfig && (
        <div className={`card ${isTriggered ? 'border-sunset-300 bg-sunset-50' : 'border-green-300 bg-green-50'}`}>
          <div className="card-body">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {isTriggered ? (
                  <AlertTriangle size={24} className="text-sunset-600" />
                ) : (
                  <CheckCircle size={24} className="text-green-600" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {TRIGGER_TYPES[configuredType]}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {isTriggered ? 'Trigger has been activated' : 'Configured and active'}
                  </p>
                </div>
              </div>

              {/* Deadman switch check-in button */}
              {configuredType === TRIGGER_TYPE.DEADMAN_SWITCH && !isTriggered && (
                <button
                  onClick={handleCheckIn}
                  disabled={submitting}
                  className="btn-success flex items-center gap-2"
                >
                  <CheckCircle size={18} />
                  Check In
                </button>
              )}
            </div>

            {/* Type-specific info */}
            {configuredType === TRIGGER_TYPE.DEADMAN_SWITCH && !isTriggered && (
              <div className="mt-4 p-4 bg-white rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Last Check-in:</span>
                    <p className="font-medium">
                      {format(new Date(Number(triggerConfig.lastCheckIn) * 1000), 'PPpp')}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Timeout:</span>
                    <p className="font-medium">
                      {Math.round(Number(triggerConfig.deadmanInterval) / DAY)} days
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Triggers At:</span>
                    <p className="font-medium text-sunset-600">
                      {triggerDate ? format(triggerDate, 'PPpp') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Time Remaining:</span>
                    <p className="font-medium text-sunset-600">{timeUntilTrigger ?? '…'}</p>
                  </div>
                </div>
              </div>
            )}

            {configuredType === TRIGGER_TYPE.TRUSTED_QUORUM && (
              <div className="mt-4 p-4 bg-white rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-500">Signatures:</span>
                  <span className="font-medium">
                    {signatureCount} / {Number(triggerConfig.requiredSignatures)} required
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (signatureCount / Number(triggerConfig.requiredSignatures)) * 100)}%`
                    }}
                  />
                </div>
                <div className="mt-4 text-sm">
                  <span className="text-gray-500">Trusted signers:</span>
                  <ul className="font-mono mt-1 space-y-1 break-all">
                    {triggerConfig.trustedSigners.map(signer => <li key={signer}>{signer}</li>)}
                  </ul>
                  <p className="text-gray-500 mt-2">
                    Each signer submits their signature from their own account, using
                    &quot;Act on Another Creator&apos;s Trigger&quot; below with your address.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configuration Forms */}
      {!isTriggered && (
        <div className="space-y-6">
          {hasConfig && (
            <p className="text-sm text-gray-600">
              You can replace your trigger configuration until it fires.
            </p>
          )}
          <div className="flex gap-2">
            {[
              { type: TRIGGER_TYPE.DEADMAN_SWITCH, label: 'Deadman Switch', icon: Clock },
              { type: TRIGGER_TYPE.TRUSTED_QUORUM, label: 'Trusted Quorum', icon: Users },
              { type: TRIGGER_TYPE.ORACLE_VERIFIED, label: 'Oracle Verified', icon: Radio },
            ].map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  selectedType === type
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon size={24} className={selectedType === type ? 'text-primary-600' : 'text-gray-400'} />
                <p className={`mt-2 font-medium ${selectedType === type ? 'text-primary-600' : 'text-gray-700'}`}>
                  {label}
                </p>
              </button>
            ))}
          </div>

          {/* Deadman Switch Form */}
          {selectedType === TRIGGER_TYPE.DEADMAN_SWITCH && (
            <form onSubmit={handleConfigureDeadman} className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock size={20} />
                  Deadman Switch
                </h2>
              </div>
              <div className="card-body space-y-4">
                <p className="text-sm text-gray-600">
                  If you do not check in within the timeout period, anyone can fire the trigger.
                  Minimum timeout is 30 days.
                </p>
                <div>
                  <label className="label" htmlFor="deadman-timeout">Timeout (days)</label>
                  <input
                    id="deadman-timeout"
                    type="number"
                    value={Number.isNaN(deadmanTimeout) ? '' : deadmanTimeout}
                    onChange={(e) => setDeadmanTimeout(parseInt(e.target.value))}
                    min="30"
                    className="input"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Trigger will activate if no check-in for {deadmanTimeout || '?'} days
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                  Configure Deadman Switch
                </button>
              </div>
            </form>
          )}

          {/* Trusted Quorum Form */}
          {selectedType === TRIGGER_TYPE.TRUSTED_QUORUM && (
            <form onSubmit={handleConfigureQuorum} className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users size={20} />
                  Trusted Quorum
                </h2>
              </div>
              <div className="card-body space-y-4">
                <p className="text-sm text-gray-600">
                  Require M-of-N signatures from trusted parties to activate trigger.
                  Minimum 2 signers required.
                </p>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Trusted Signers</label>
                    <button
                      type="button"
                      onClick={addSignerField}
                      className="btn-secondary text-sm flex items-center gap-1"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {trustedSigners.map((addr, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={addr}
                          onChange={(e) => updateSignerField(index, e.target.value)}
                          placeholder="0x..."
                          aria-label={`Trusted signer ${index + 1}`}
                          className={`input flex-1 font-mono ${
                            addr && !ethers.isAddress(addr) ? 'input-error' : ''
                          }`}
                        />
                        {trustedSigners.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeSignerField(index)}
                            className="p-2 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="required-signatures">Required Signatures</label>
                  <input
                    id="required-signatures"
                    type="number"
                    value={Number.isNaN(requiredSignatures) ? '' : requiredSignatures}
                    onChange={(e) => setRequiredSignatures(parseInt(e.target.value))}
                    min="2"
                    max={trustedSigners.filter(a => a.trim()).length || 2}
                    className="input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                  Configure Trusted Quorum
                </button>
              </div>
            </form>
          )}

          {/* Oracle Verified Form */}
          {selectedType === TRIGGER_TYPE.ORACLE_VERIFIED && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Radio size={20} />
                  Oracle Verified
                </h2>
              </div>
              <div className="card-body space-y-4">
                <p className="text-sm text-gray-600">
                  Use a consensus of verified oracles (Chainlink, UMA) through the OracleRegistry to
                  verify an event such as a death certificate, medical incapacitation, or a legal event.
                </p>
                {!hasOracleRegistry ? (
                  <div className="flex gap-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
                    <Info size={20} className="text-gray-500 shrink-0" />
                    <p>
                      Not available on this deployment: no OracleRegistry is connected to the
                      TriggerMechanism. The contract owner must deploy one and call
                      {' '}<code className="font-mono">setOracleRegistry</code> first. (Direct
                      single-oracle proofs are disabled for safety.) Use a deadman switch or
                      trusted quorum instead.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleConfigureOracle} className="space-y-4">
                    <div>
                      <label className="label" htmlFor="oracle-event">Event to verify</label>
                      <select
                        id="oracle-event"
                        className="input"
                        value={oracleForm.eventType}
                        onChange={(e) => setOracleForm(prev => ({ ...prev, eventType: Number(e.target.value) }))}
                      >
                        {ORACLE_EVENT_TYPES.map((label, value) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="oracle-evidence">Verification data</label>
                      <textarea
                        id="oracle-evidence"
                        className="input min-h-[80px]"
                        value={oracleForm.evidence}
                        onChange={(e) => setOracleForm(prev => ({ ...prev, evidence: e.target.value }))}
                        placeholder="e.g. full legal name, date of birth, jurisdiction"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Only its hash is stored on-chain; keep the original for the oracles.
                      </p>
                    </div>
                    <div>
                      <label className="label" htmlFor="oracle-count">Required oracles (0 = registry default)</label>
                      <input
                        id="oracle-count"
                        type="number"
                        min="0"
                        className="input"
                        value={oracleForm.requiredOracles}
                        onChange={(e) => setOracleForm(prev => ({ ...prev, requiredOracles: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary flex items-center gap-2"
                    >
                      {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                      Configure Oracle Verification
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <CreatorTriggerActions />
    </div>
  )
}

export default TriggerConfig
