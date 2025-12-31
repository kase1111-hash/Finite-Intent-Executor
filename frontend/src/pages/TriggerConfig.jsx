import React, { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { TRIGGER_TYPES } from '../contracts/config'
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
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

function TriggerConfig() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [triggerConfig, setTriggerConfig] = useState(null)
  const [signatureCount, setSignatureCount] = useState(0)

  // Form state
  const [selectedType, setSelectedType] = useState(1) // Deadman switch default
  const [deadmanTimeout, setDeadmanTimeout] = useState(90) // days
  const [trustedSigners, setTrustedSigners] = useState(['', ''])
  const [requiredSignatures, setRequiredSignatures] = useState(2)
  const [oracleAddresses, setOracleAddresses] = useState([''])

  const fetchTriggerConfig = useCallback(async () => {
    if (!isConnected || !account || !contracts.TriggerMechanism) return

    setLoading(true)
    try {
      const config = await contracts.TriggerMechanism.getTriggerConfig(account)
      setTriggerConfig(config)

      if (config.triggerType === 2) {
        const count = await contracts.TriggerMechanism.getSignatureCount(account)
        setSignatureCount(Number(count))
      }
    } catch (err) {
      console.error('Failed to fetch trigger config:', err)
    } finally {
      setLoading(false)
    }
  }, [account, contracts, isConnected])

  useEffect(() => {
    fetchTriggerConfig()
  }, [fetchTriggerConfig])

  const handleConfigureDeadman = async (e) => {
    e.preventDefault()
    if (deadmanTimeout < 30) {
      toast.error('Minimum timeout is 30 days')
      return
    }

    setSubmitting(true)
    try {
      const timeoutSeconds = deadmanTimeout * 24 * 60 * 60
      const tx = await contracts.TriggerMechanism.configureDeadmanSwitch(timeoutSeconds)
      toast.loading('Configuring deadman switch...', { id: 'config' })
      await tx.wait()
      toast.success('Deadman switch configured!', { id: 'config' })
      fetchTriggerConfig()
    } catch (err) {
      console.error('Failed to configure:', err)
      toast.error(err.reason || 'Failed to configure deadman switch')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfigureQuorum = async (e) => {
    e.preventDefault()

    const validSigners = trustedSigners.filter(addr => addr.trim() && ethers.isAddress(addr))
    if (validSigners.length < 2) {
      toast.error('At least 2 trusted signers required')
      return
    }
    if (requiredSignatures < 2 || requiredSignatures > validSigners.length) {
      toast.error(`Required signatures must be between 2 and ${validSigners.length}`)
      return
    }

    setSubmitting(true)
    try {
      const tx = await contracts.TriggerMechanism.configureTrustedQuorum(
        validSigners,
        requiredSignatures
      )
      toast.loading('Configuring trusted quorum...', { id: 'config' })
      await tx.wait()
      toast.success('Trusted quorum configured!', { id: 'config' })
      fetchTriggerConfig()
    } catch (err) {
      console.error('Failed to configure:', err)
      toast.error(err.reason || 'Failed to configure trusted quorum')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfigureOracle = async (e) => {
    e.preventDefault()

    const validOracles = oracleAddresses.filter(addr => addr.trim() && ethers.isAddress(addr))
    if (validOracles.length === 0) {
      toast.error('At least one oracle address required')
      return
    }

    setSubmitting(true)
    try {
      const tx = await contracts.TriggerMechanism.configureOracleVerified(validOracles)
      toast.loading('Configuring oracle verification...', { id: 'config' })
      await tx.wait()
      toast.success('Oracle verification configured!', { id: 'config' })
      fetchTriggerConfig()
    } catch (err) {
      console.error('Failed to configure:', err)
      toast.error(err.reason || 'Failed to configure oracle verification')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckIn = async () => {
    setSubmitting(true)
    try {
      const tx = await contracts.TriggerMechanism.checkIn()
      toast.loading('Checking in...', { id: 'checkin' })
      await tx.wait()
      toast.success('Check-in successful! Timer reset.', { id: 'checkin' })
      fetchTriggerConfig()
    } catch (err) {
      console.error('Failed to check in:', err)
      toast.error(err.reason || 'Failed to check in')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitSignature = async () => {
    setSubmitting(true)
    try {
      const tx = await contracts.TriggerMechanism.submitTrustedSignature()
      toast.loading('Submitting signature...', { id: 'sig' })
      await tx.wait()
      toast.success('Signature submitted!', { id: 'sig' })
      fetchTriggerConfig()
    } catch (err) {
      console.error('Failed to submit signature:', err)
      toast.error(err.reason || 'Failed to submit signature')
    } finally {
      setSubmitting(false)
    }
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
    newSigners[index] = value
    setTrustedSigners(newSigners)
  }

  const addOracleField = () => {
    setOracleAddresses([...oracleAddresses, ''])
  }

  const removeOracleField = (index) => {
    if (oracleAddresses.length > 1) {
      setOracleAddresses(oracleAddresses.filter((_, i) => i !== index))
    }
  }

  const updateOracleField = (index, value) => {
    const newOracles = [...oracleAddresses]
    newOracles[index] = value
    setOracleAddresses(newOracles)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const hasConfig = triggerConfig && triggerConfig.triggerType > 0
  const isTriggered = triggerConfig?.isTriggered

  // Calculate time until trigger for deadman switch
  let timeUntilTrigger = null
  let triggerDate = null
  if (triggerConfig?.triggerType === 1 && triggerConfig.lastCheckIn > 0) {
    const lastCheckIn = new Date(Number(triggerConfig.lastCheckIn) * 1000)
    const timeout = Number(triggerConfig.deadmanTimeout) * 1000
    triggerDate = new Date(lastCheckIn.getTime() + timeout)
    timeUntilTrigger = triggerDate > new Date() ? formatDistanceToNow(triggerDate) : 'Overdue'
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
                    {TRIGGER_TYPES[triggerConfig.triggerType]}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {isTriggered ? 'Trigger has been activated' : 'Configured and active'}
                  </p>
                </div>
              </div>

              {/* Deadman switch check-in button */}
              {triggerConfig.triggerType === 1 && !isTriggered && (
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
            {triggerConfig.triggerType === 1 && !isTriggered && (
              <div className="mt-4 p-4 bg-white rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Last Check-in:</span>
                    <p className="font-medium">
                      {triggerConfig.lastCheckIn > 0
                        ? format(new Date(Number(triggerConfig.lastCheckIn) * 1000), 'PPpp')
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Timeout:</span>
                    <p className="font-medium">
                      {Math.round(Number(triggerConfig.deadmanTimeout) / 86400)} days
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
                    <p className="font-medium text-sunset-600">{timeUntilTrigger}</p>
                  </div>
                </div>
              </div>
            )}

            {triggerConfig.triggerType === 2 && (
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
                      width: `${(signatureCount / Number(triggerConfig.requiredSignatures)) * 100}%`
                    }}
                  />
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleSubmitSignature}
                    disabled={submitting}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Play size={18} />
                    Submit My Signature
                  </button>
                </div>
              </div>
            )}

            {isTriggered && (
              <div className="mt-4 p-4 bg-white rounded-lg">
                <p className="text-sm text-gray-600">
                  Triggered at: {format(new Date(Number(triggerConfig.triggeredAt) * 1000), 'PPpp')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configuration Forms */}
      {!isTriggered && (
        <div className="space-y-6">
          <div className="flex gap-2">
            {[
              { type: 1, label: 'Deadman Switch', icon: Clock },
              { type: 2, label: 'Trusted Quorum', icon: Users },
              { type: 3, label: 'Oracle Verified', icon: Radio },
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
          {selectedType === 1 && (
            <form onSubmit={handleConfigureDeadman} className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock size={20} />
                  Deadman Switch
                </h2>
              </div>
              <div className="card-body space-y-4">
                <p className="text-sm text-gray-600">
                  If you do not check in within the timeout period, the trigger will activate.
                  Minimum timeout is 30 days.
                </p>
                <div>
                  <label className="label">Timeout (days)</label>
                  <input
                    type="number"
                    value={deadmanTimeout}
                    onChange={(e) => setDeadmanTimeout(parseInt(e.target.value))}
                    min="30"
                    max="365"
                    className="input"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Trigger will activate if no check-in for {deadmanTimeout} days
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
          {selectedType === 2 && (
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
                  <label className="label">Required Signatures</label>
                  <input
                    type="number"
                    value={requiredSignatures}
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
          {selectedType === 3 && (
            <form onSubmit={handleConfigureOracle} className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Radio size={20} />
                  Oracle Verified
                </h2>
              </div>
              <div className="card-body space-y-4">
                <p className="text-sm text-gray-600">
                  Use verified oracles (Chainlink, UMA) to verify events like death certificates,
                  medical incapacitation, or legal events.
                </p>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Oracle Addresses</label>
                    <button
                      type="button"
                      onClick={addOracleField}
                      className="btn-secondary text-sm flex items-center gap-1"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {oracleAddresses.map((addr, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={addr}
                          onChange={(e) => updateOracleField(index, e.target.value)}
                          placeholder="0x..."
                          className={`input flex-1 font-mono ${
                            addr && !ethers.isAddress(addr) ? 'input-error' : ''
                          }`}
                        />
                        {oracleAddresses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOracleField(index)}
                            className="p-2 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                  Configure Oracle Verification
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export default TriggerConfig
