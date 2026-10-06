import React, { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  Activity,
  Play,
  CheckCircle,
  Clock,
  FileText,
  DollarSign,
  Shield,
  RefreshCw,
  AlertTriangle,
  Zap,
  Wallet,
} from 'lucide-react'
import { format } from 'date-fns'
import CreatorSelector from '../components/CreatorSelector'
import { sendTx, findInaction } from '../utils/transactions'

function ExecutionMonitor() {
  const { account, contracts, isConnected, refreshKey } = useWeb3()
  const [creatorOverride, setCreatorOverride] = useState(null)
  const creator = creatorOverride ?? account
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null)

  // Action form
  const [actionForm, setActionForm] = useState({ action: '', query: '' })

  // Fund project form
  const [fundForm, setFundForm] = useState({ recipient: '', amount: '', description: '' })

  const [depositAmount, setDepositAmount] = useState('')

  const fetchExecutionData = useCallback(async () => {
    const agent = contracts.ExecutionAgent
    if (!isConnected || !creator || !agent) return

    setLoading(true)
    try {
      const [isActive, activatedAt, isSunset, treasury, logs, licenses, projects, intent, corpus] =
        await Promise.all([
          agent.isExecutionActive(creator),
          agent.triggerTimestamps(creator),
          agent.isSunset(creator),
          agent.treasuries(creator),
          agent.getExecutionLogs(creator),
          agent.getLicenses(creator),
          agent.getFundedProjects(creator),
          contracts.IntentCaptureModule?.getIntent(creator).catch(() => null),
          contracts.LexiconHolder?.getCorpus(creator).catch(() => null),
        ])
      setStatus({
        isActive,
        activatedAt: Number(activatedAt),
        isSunset,
        treasury,
        logs: [...logs].reverse(), // Most recent first
        licenseCount: licenses.length,
        projects: [...projects].reverse(),
        isTriggered: intent?.isTriggered ?? false,
        corpusHash: corpus?.isFrozen ? corpus.corpusHash : null,
      })
    } catch (err) {
      console.error('Failed to fetch execution data:', err)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [contracts, creator, isConnected])

  useEffect(() => {
    fetchExecutionData()
  }, [fetchExecutionData, refreshKey])

  const submit = async (txPromise, messages) => {
    setSubmitting(true)
    const receipt = await sendTx(txPromise, messages)
    setSubmitting(false)
    if (receipt) fetchExecutionData()
    return receipt
  }

  const inactionWarning = (receipt) => {
    const inaction = findInaction(receipt, contracts.ExecutionAgent)
    return inaction
      ? `No action taken: ${inaction.reason} (${inaction.confidence}% < 95% required). ` +
        'Default to inaction.'
      : null
  }

  const handleActivateExecution = () => {
    submit(contracts.ExecutionAgent.activateExecution(creator), {
      id: 'activate',
      pending: 'Activating execution...',
      success: 'Execution activated! The 20-year sunset clock has started.',
      failure: 'Failed to activate execution',
    })
  }

  const handleExecuteAction = async (e) => {
    e.preventDefault()

    if (!actionForm.action.trim()) {
      toast.error('Describe the action to execute')
      return
    }

    const receipt = await submit(
      contracts.ExecutionAgent.executeAction(
        creator,
        actionForm.action,
        actionForm.query.trim() || actionForm.action,
        status.corpusHash
      ),
      {
        id: 'action',
        pending: 'Executing action...',
        success: 'Action executed and logged with its corpus citation.',
        failure: 'Action rejected',
        inspect: inactionWarning,
      }
    )
    if (receipt) setActionForm({ action: '', query: '' })
  }

  const handleFundProject = async (e) => {
    e.preventDefault()

    if (!ethers.isAddress(fundForm.recipient)) {
      toast.error('Invalid recipient address')
      return
    }
    if (!fundForm.description.trim()) {
      toast.error('Project description is required')
      return
    }
    let amount
    try {
      amount = ethers.parseEther(fundForm.amount)
    } catch {
      toast.error('Enter a valid ETH amount')
      return
    }

    const receipt = await submit(
      contracts.ExecutionAgent.fundProject(
        creator,
        fundForm.recipient,
        amount,
        fundForm.description,
        status.corpusHash
      ),
      {
        id: 'fund',
        pending: 'Funding project...',
        success: 'Project funded!',
        failure: 'Failed to fund project',
        inspect: inactionWarning,
      }
    )
    if (receipt) setFundForm({ recipient: '', amount: '', description: '' })
  }

  const handleDeposit = async (e) => {
    e.preventDefault()
    let value
    try {
      value = ethers.parseEther(depositAmount)
    } catch {
      toast.error('Enter a valid ETH amount')
      return
    }
    const receipt = await submit(
      contracts.ExecutionAgent.depositToTreasury(creator, { value }),
      { id: 'deposit', pending: 'Depositing...', success: 'Deposited to treasury.', failure: 'Failed to deposit' }
    )
    if (receipt) setDepositAmount('')
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <Activity size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-600">Connect your wallet to monitor execution</p>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const isActive = status?.isActive
  const isSunset = status?.isSunset
  const isActivated = status?.activatedAt > 0
  const canActivate = status && !isActivated && status.isTriggered

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Execution Monitor</h1>
          <p className="text-gray-600 mt-1">Monitor and manage posthumous intent execution</p>
        </div>
        <button
          onClick={fetchExecutionData}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <CreatorSelector account={account} creator={creator} onChange={setCreatorOverride} />

      {/* Status Banner */}
      <div className={`card p-6 ${
        isSunset ? 'bg-sunset-50 border-sunset-200' :
        isActive ? 'bg-green-50 border-green-200' :
        'bg-gray-50'
      }`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {isSunset ? (
              <AlertTriangle size={32} className="text-sunset-600" />
            ) : isActive ? (
              <CheckCircle size={32} className="text-green-600" />
            ) : (
              <Clock size={32} className="text-gray-400" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isSunset ? 'Sunset' :
                 isActive ? 'Execution Active' :
                 isActivated ? 'Execution Window Ended' :
                 canActivate ? 'Ready to Activate' :
                 'Execution Inactive'}
              </h2>
              <p className="text-sm text-gray-600">
                {isSunset ? 'Execution has permanently halted; assets move to the public domain.' :
                 isActive ? `Activated ${format(new Date(status.activatedAt * 1000), 'PPpp')}` :
                 isActivated ? 'The 20-year execution window has elapsed. Sunset is due.' :
                 canActivate ? 'The intent has been triggered. An executor can now activate execution.' :
                 'Waiting for the intent to be triggered.'}
              </p>
            </div>
          </div>

          {canActivate && (
            <button
              onClick={handleActivateExecution}
              disabled={submitting}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              <Play size={18} />
              Activate Execution
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Zap size={18} />
              <span className="text-sm">Actions Executed</span>
            </div>
            <p className="stat-value">{status.logs.length}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Shield size={18} />
              <span className="text-sm">Licenses Issued</span>
            </div>
            <p className="stat-value">{status.licenseCount}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <DollarSign size={18} />
              <span className="text-sm">Projects Funded</span>
            </div>
            <p className="stat-value">{status.projects.length}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Wallet size={18} />
              <span className="text-sm">Treasury</span>
            </div>
            <p className="stat-value">{ethers.formatEther(status.treasury)} ETH</p>
          </div>
        </div>
      )}

      {/* Treasury deposit (anyone) */}
      {status && !isSunset && (
        <form onSubmit={handleDeposit} className="card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="label" htmlFor="deposit-amount">Deposit to this creator&apos;s treasury (ETH)</label>
            <input
              id="deposit-amount"
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="1.0"
              step="0.001"
              min="0"
              className="input"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-secondary flex items-center gap-2 justify-center">
            <Wallet size={18} />
            Deposit
          </button>
        </form>
      )}

      {/* Action Forms */}
      {isActive && !status.corpusHash && (
        <div className="card p-4 bg-yellow-50 border-yellow-200 text-sm text-yellow-800 flex gap-3">
          <AlertTriangle size={20} className="text-yellow-600 shrink-0" />
          <p>
            This creator&apos;s corpus has not been frozen in the Lexicon, so no action can be
            resolved against it. An indexer must freeze the corpus first.
          </p>
        </div>
      )}

      {isActive && status.corpusHash && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Execute Action */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-gray-900">Execute Action</h3>
            </div>
            <form onSubmit={handleExecuteAction} className="card-body space-y-4">
              <p className="text-sm text-gray-600">
                The query is resolved against the frozen corpus. The action executes only at 95%+
                confidence; otherwise nothing happens. Political actions are always blocked.
              </p>
              <div>
                <label className="label" htmlFor="action-text">Action</label>
                <input
                  id="action-text"
                  type="text"
                  value={actionForm.action}
                  onChange={(e) => setActionForm(prev => ({ ...prev, action: e.target.value }))}
                  placeholder="e.g. fund_digital_rights"
                  className="input"
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="label" htmlFor="action-query">Corpus query (defaults to the action)</label>
                <input
                  id="action-query"
                  type="text"
                  value={actionForm.query}
                  onChange={(e) => setActionForm(prev => ({ ...prev, query: e.target.value }))}
                  placeholder="Semantic index keyword or resolved query"
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex items-center gap-2 w-full justify-center"
              >
                {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                Execute Action
              </button>
            </form>
          </div>

          {/* Fund Project */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-gray-900">Fund Project</h3>
            </div>
            <form onSubmit={handleFundProject} className="card-body space-y-4">
              <p className="text-sm text-gray-600">
                Paid from the treasury. Resolves the corpus query
                {' '}<code className="font-mono">fund_project:&lt;description&gt;</code>.
              </p>
              <div>
                <label className="label" htmlFor="fund-recipient">Recipient Address</label>
                <input
                  id="fund-recipient"
                  type="text"
                  value={fundForm.recipient}
                  onChange={(e) => setFundForm(prev => ({ ...prev, recipient: e.target.value.trim() }))}
                  placeholder="0x..."
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="label" htmlFor="fund-amount">Amount (ETH)</label>
                <input
                  id="fund-amount"
                  type="number"
                  value={fundForm.amount}
                  onChange={(e) => setFundForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="1.0"
                  step="0.001"
                  min="0"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="fund-description">Description</label>
                <input
                  id="fund-description"
                  type="text"
                  value={fundForm.description}
                  onChange={(e) => setFundForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. digital_rights_grant"
                  className="input"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="btn-success flex items-center gap-2 w-full justify-center"
              >
                {submitting ? <RefreshCw size={18} className="animate-spin" /> : <DollarSign size={18} />}
                Fund Project
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Action Logs */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Action Log</h3>
          <span className="text-sm text-gray-500">{status?.logs.length ?? 0} actions</span>
        </div>
        <div className="divide-y divide-gray-100">
          {status?.logs.length > 0 ? (
            status.logs.map((log, index) => (
              <div key={`${index}-${log.decisionHash}`} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-50 text-green-600">
                      <CheckCircle size={18} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{log.action}</p>
                      {log.corpusCitation && (
                        <p className="text-sm text-primary-600 mt-1 italic">
                          Citation: {log.corpusCitation}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="badge badge-success">
                      {Number(log.confidence)}% confidence
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(Number(log.timestamp) * 1000), 'PP p')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              <FileText size={32} className="mx-auto mb-2 text-gray-300" />
              <p>No actions executed yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Funded Projects */}
      {status?.projects.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900">Funded Projects</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {status.projects.map((project, index) => (
              <div key={index} className="p-4 flex items-start justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{project.description}</p>
                  <p className="font-mono text-gray-500 truncate">{project.recipient}</p>
                  {project.corpusCitation && (
                    <p className="text-primary-600 italic mt-1">Citation: {project.corpusCitation}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-medium">{ethers.formatEther(project.fundingAmount)} ETH</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(Number(project.fundedAt) * 1000), 'PP p')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ExecutionMonitor
