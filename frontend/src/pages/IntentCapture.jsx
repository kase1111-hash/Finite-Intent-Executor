import React, { useState, useEffect } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  FileText,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Hash,
  Calendar,
  Link as LinkIcon,
  Upload,
} from 'lucide-react'
import { format } from 'date-fns'
import DocumentUploadArea from '../components/DocumentUploadArea'

function IntentCapture() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [existingIntent, setExistingIntent] = useState(null)
  const [goals, setGoals] = useState([])

  // Form state
  const [form, setForm] = useState({
    intentDocument: '',
    corpusContent: '',
    corpusUri: '',
    assetsUri: '',
    corpusStartYear: new Date().getFullYear() - 5,
    corpusEndYear: new Date().getFullYear() + 3,
    assetAddresses: [''],
  })

  const [newGoal, setNewGoal] = useState({
    description: '',
    constraints: '',
    priority: 50,
  })

  const fetchExistingIntent = async () => {
    if (!isConnected || !account || !contracts.IntentCaptureModule) return

    setLoading(true)
    try {
      const intent = await contracts.IntentCaptureModule.getIntent(account)
      const hasIntent = intent.intentHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'

      if (hasIntent) {
        setExistingIntent(intent)

        // Fetch goals
        const goalCount = await contracts.IntentCaptureModule.getGoalCount(account)
        const fetchedGoals = await contracts.IntentCaptureModule.getGoals(account)
        setGoals(fetchedGoals || [])
      }
    } catch (err) {
      console.error('Failed to fetch intent:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExistingIntent()
  }, [account, contracts, isConnected])

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleDocumentImport = (content, targetField) => {
    if (targetField === 'intentDocument' || targetField === 'corpusContent') {
      setForm(prev => ({ ...prev, [targetField]: content }))
    }
  }

  const handleAssetAddressChange = (index, value) => {
    const newAddresses = [...form.assetAddresses]
    newAddresses[index] = value
    setForm(prev => ({ ...prev, assetAddresses: newAddresses }))
  }

  const addAssetAddress = () => {
    setForm(prev => ({ ...prev, assetAddresses: [...prev.assetAddresses, ''] }))
  }

  const removeAssetAddress = (index) => {
    if (form.assetAddresses.length > 1) {
      setForm(prev => ({
        ...prev,
        assetAddresses: prev.assetAddresses.filter((_, i) => i !== index)
      }))
    }
  }

  const validateForm = () => {
    if (!form.intentDocument.trim()) {
      toast.error('Intent document is required')
      return false
    }
    if (!form.corpusContent.trim()) {
      toast.error('Corpus content is required')
      return false
    }
    if (!form.corpusUri.trim()) {
      toast.error('Corpus URI is required')
      return false
    }

    const yearDiff = form.corpusEndYear - form.corpusStartYear
    if (yearDiff < 5 || yearDiff > 10) {
      toast.error('Corpus window must be 5-10 years')
      return false
    }

    const validAddresses = form.assetAddresses.filter(addr => addr.trim())
    if (validAddresses.length === 0) {
      toast.error('At least one asset address is required')
      return false
    }

    for (const addr of validAddresses) {
      if (!ethers.isAddress(addr)) {
        toast.error(`Invalid address: ${addr}`)
        return false
      }
    }

    return true
  }

  const handleCaptureIntent = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setSubmitting(true)
    try {
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes(form.intentDocument))
      const corpusHash = ethers.keccak256(ethers.toUtf8Bytes(form.corpusContent))
      const validAddresses = form.assetAddresses.filter(addr => addr.trim() && ethers.isAddress(addr))

      const tx = await contracts.IntentCaptureModule.captureIntent(
        intentHash,
        corpusHash,
        form.corpusUri,
        form.assetsUri || form.corpusUri,
        form.corpusStartYear,
        form.corpusEndYear,
        validAddresses
      )

      toast.loading('Capturing intent...', { id: 'capture' })
      await tx.wait()
      toast.success('Intent captured successfully!', { id: 'capture' })

      fetchExistingIntent()
    } catch (err) {
      console.error('Failed to capture intent:', err)
      toast.error(err.reason || 'Failed to capture intent')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddGoal = async (e) => {
    e.preventDefault()
    if (!newGoal.description.trim()) {
      toast.error('Goal description is required')
      return
    }

    setSubmitting(true)
    try {
      const constraintsHash = newGoal.constraints.trim()
        ? ethers.keccak256(ethers.toUtf8Bytes(newGoal.constraints))
        : ethers.ZeroHash

      const tx = await contracts.IntentCaptureModule.addGoal(
        newGoal.description,
        constraintsHash,
        newGoal.priority
      )

      toast.loading('Adding goal...', { id: 'goal' })
      await tx.wait()
      toast.success('Goal added successfully!', { id: 'goal' })

      setNewGoal({ description: '', constraints: '', priority: 50 })
      fetchExistingIntent()
    } catch (err) {
      console.error('Failed to add goal:', err)
      toast.error(err.reason || 'Failed to add goal')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke your intent? This action cannot be undone.')) {
      return
    }

    setSubmitting(true)
    try {
      const tx = await contracts.IntentCaptureModule.revokeIntent()
      toast.loading('Revoking intent...', { id: 'revoke' })
      await tx.wait()
      toast.success('Intent revoked successfully!', { id: 'revoke' })
      setExistingIntent(null)
      setGoals([])
    } catch (err) {
      console.error('Failed to revoke intent:', err)
      toast.error(err.reason || 'Failed to revoke intent')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <FileText size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Connect your wallet to capture your intent</p>
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

  // Show existing intent view
  if (existingIntent && !existingIntent.isRevoked) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Intent Captured</h1>
            <p className="text-gray-600 mt-1">Your intent has been secured on-chain</p>
          </div>
          <button
            onClick={handleRevoke}
            disabled={submitting}
            className="btn-danger flex items-center gap-2"
          >
            <XCircle size={18} />
            Revoke Intent
          </button>
        </div>

        {/* Intent Details Card */}
        <div className="card">
          <div className="card-header flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Intent Details</h2>
          </div>
          <div className="card-body">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <dt className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Hash size={14} />
                  Intent Hash
                </dt>
                <dd className="font-mono text-sm bg-gray-50 p-2 rounded break-all">
                  {existingIntent.intentHash}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Hash size={14} />
                  Corpus Hash
                </dt>
                <dd className="font-mono text-sm bg-gray-50 p-2 rounded break-all">
                  {existingIntent.corpusHash}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <LinkIcon size={14} />
                  Corpus URI
                </dt>
                <dd className="text-sm">
                  <a href={existingIntent.corpusUri} target="_blank" rel="noopener noreferrer"
                     className="text-primary-600 hover:underline break-all">
                    {existingIntent.corpusUri}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Calendar size={14} />
                  Corpus Window
                </dt>
                <dd className="text-gray-900">
                  {existingIntent.corpusStartYear?.toString()} - {existingIntent.corpusEndYear?.toString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500 mb-1">Version</dt>
                <dd className="text-gray-900">{existingIntent.version?.toString()}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500 mb-1">Created</dt>
                <dd className="text-gray-900">
                  {format(new Date(Number(existingIntent.createdAt) * 1000), 'PPpp')}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Goals Section */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Goals ({goals.length})</h2>
          </div>
          <div className="card-body">
            {goals.length > 0 ? (
              <ul className="space-y-4">
                {goals.map((goal, index) => (
                  <li key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-semibold">
                      {goal.priority}
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900">{goal.description}</p>
                      {!goal.isActive && (
                        <span className="badge-neutral mt-2">Inactive</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-center py-4">No goals added yet</p>
            )}

            {/* Add Goal Form */}
            <form onSubmit={handleAddGoal} className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="font-medium text-gray-900 mb-4">Add New Goal</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Description</label>
                  <input
                    type="text"
                    value={newGoal.description}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="e.g., Fund open-source AI safety research"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Constraints (optional)</label>
                  <textarea
                    value={newGoal.constraints}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, constraints: e.target.value }))}
                    placeholder="e.g., No commercial use without attribution"
                    className="input min-h-[80px]"
                  />
                </div>
                <div>
                  <label className="label">Priority (1-100)</label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={newGoal.priority}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Low</span>
                    <span className="font-medium text-gray-900">{newGoal.priority}</span>
                    <span>High</span>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Show capture form
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Capture Intent</h1>
        <p className="text-gray-600 mt-1">
          Define your posthumous intent with goals, constraints, and contextual information
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle size={20} />
            <span className="font-medium">Important Notice</span>
          </div>
        </div>
        <div className="card-body text-sm text-gray-600 space-y-2">
          <p>Your intent will be immutably stored on-chain. Once captured:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>You can add new goals and sign new versions</li>
            <li>You can revoke completely while alive via your private key</li>
            <li>The corpus window must be 5-10 years</li>
            <li>After trigger, execution follows 95% confidence threshold</li>
            <li>Mandatory sunset occurs exactly 20 years after trigger</li>
          </ul>
        </div>
      </div>

      <form onSubmit={handleCaptureIntent} className="space-y-6">
        {/* Document Import Section */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Upload size={20} className="text-primary-600" />
              <h2 className="font-semibold text-gray-900">Import Documents</h2>
            </div>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-600 mb-4">
              Upload existing documents to auto-populate the intent or corpus fields below.
            </p>
            <DocumentUploadArea
              onDocumentImport={handleDocumentImport}
              targetField="intentDocument"
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Intent Document</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Intent Description *</label>
              <textarea
                value={form.intentDocument}
                onChange={(e) => handleFormChange('intentDocument', e.target.value)}
                placeholder="Describe your complete intent, including values, goals, and how you want your assets managed..."
                className="input min-h-[150px]"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be hashed and stored on-chain. Store the original document securely.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Contextual Corpus</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Corpus Content *</label>
              <textarea
                value={form.corpusContent}
                onChange={(e) => handleFormChange('corpusContent', e.target.value)}
                placeholder="Your contextual corpus for intent interpretation (writings, notes, recordings transcripts, etc.)..."
                className="input min-h-[150px]"
                required
              />
            </div>
            <div>
              <label className="label">Corpus URI (IPFS/Arweave) *</label>
              <input
                type="text"
                value={form.corpusUri}
                onChange={(e) => handleFormChange('corpusUri', e.target.value)}
                placeholder="ipfs://..."
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Assets Metadata URI (optional)</label>
              <input
                type="text"
                value={form.assetsUri}
                onChange={(e) => handleFormChange('assetsUri', e.target.value)}
                placeholder="ipfs://..."
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Corpus Start Year</label>
                <input
                  type="number"
                  value={form.corpusStartYear}
                  onChange={(e) => handleFormChange('corpusStartYear', parseInt(e.target.value))}
                  min="1900"
                  max={new Date().getFullYear()}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Corpus End Year</label>
                <input
                  type="number"
                  value={form.corpusEndYear}
                  onChange={(e) => handleFormChange('corpusEndYear', parseInt(e.target.value))}
                  min={form.corpusStartYear}
                  max={new Date().getFullYear() + 10}
                  className="input"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Window: {form.corpusEndYear - form.corpusStartYear} years
              {(form.corpusEndYear - form.corpusStartYear < 5 || form.corpusEndYear - form.corpusStartYear > 10) && (
                <span className="text-red-500 ml-1">(must be 5-10 years)</span>
              )}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Asset Addresses</h2>
            <button
              type="button"
              onClick={addAssetAddress}
              className="btn-secondary text-sm flex items-center gap-1"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
          <div className="card-body space-y-3">
            {form.assetAddresses.map((address, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => handleAssetAddressChange(index, e.target.value)}
                  placeholder="0x..."
                  className={`input flex-1 font-mono ${
                    address && !ethers.isAddress(address) ? 'input-error' : ''
                  }`}
                />
                {form.assetAddresses.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAssetAddress(index)}
                    className="p-2 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-500">
              Add addresses of tokenized assets (IPToken contracts, etc.)
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary flex items-center gap-2"
          >
            {submitting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <Save size={18} />
                Capture Intent
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default IntentCapture
