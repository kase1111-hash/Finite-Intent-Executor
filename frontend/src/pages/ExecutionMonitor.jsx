import React, { useState, useEffect } from 'react'
import { useWeb3 } from '../context/Web3Context'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import {
  Activity,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  DollarSign,
  Shield,
  RefreshCw,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import { format } from 'date-fns'

function ExecutionMonitor() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [executionStatus, setExecutionStatus] = useState(null)
  const [actionLogs, setActionLogs] = useState([])

  // Action form
  const [actionForm, setActionForm] = useState({
    actionType: 'fund_project',
    query: '',
    corpusHash: '',
  })

  // Fund project form
  const [fundForm, setFundForm] = useState({
    projectAddress: '',
    amount: '',
    justification: '',
    corpusHash: '',
  })

  const fetchExecutionData = async () => {
    if (!isConnected || !account || !contracts.ExecutionAgent) return

    setLoading(true)
    try {
      const status = await contracts.ExecutionAgent.getExecutionStatus(account)
      setExecutionStatus(status)

      // Fetch action logs
      const logCount = await contracts.ExecutionAgent.getActionLogCount(account)
      const logs = []

      for (let i = 0; i < Math.min(Number(logCount), 50); i++) {
        try {
          const log = await contracts.ExecutionAgent.getActionLog(account, i)
          logs.push({ index: i, ...log })
        } catch {}
      }

      setActionLogs(logs.reverse()) // Most recent first
    } catch (err) {
      console.error('Failed to fetch execution data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExecutionData()
  }, [account, contracts, isConnected])

  const handleActivateExecution = async () => {
    setSubmitting(true)
    try {
      const tx = await contracts.ExecutionAgent.activateExecution(account)
      toast.loading('Activating execution...', { id: 'activate' })
      await tx.wait()
      toast.success('Execution activated!', { id: 'activate' })
      fetchExecutionData()
    } catch (err) {
      console.error('Failed to activate:', err)
      toast.error(err.reason || 'Failed to activate execution')
    } finally {
      setSubmitting(false)
    }
  }

  const handleExecuteAction = async (e) => {
    e.preventDefault()

    if (!actionForm.query.trim() || !actionForm.corpusHash.trim()) {
      toast.error('Query and corpus hash are required')
      return
    }

    setSubmitting(true)
    try {
      const tx = await contracts.ExecutionAgent.executeAction(
        account,
        actionForm.actionType,
        actionForm.query,
        actionForm.corpusHash
      )
      toast.loading('Executing action...', { id: 'action' })
      await tx.wait()
      toast.success('Action executed!', { id: 'action' })
      setActionForm({ actionType: 'fund_project', query: '', corpusHash: '' })
      fetchExecutionData()
    } catch (err) {
      console.error('Failed to execute action:', err)
      toast.error(err.reason || 'Failed to execute action')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFundProject = async (e) => {
    e.preventDefault()

    if (!ethers.isAddress(fundForm.projectAddress)) {
      toast.error('Invalid project address')
      return
    }

    setSubmitting(true)
    try {
      const amount = ethers.parseEther(fundForm.amount)
      const tx = await contracts.ExecutionAgent.fundProject(
        account,
        fundForm.projectAddress,
        amount,
        fundForm.justification,
        fundForm.corpusHash || ethers.ZeroHash
      )
      toast.loading('Funding project...', { id: 'fund' })
      await tx.wait()
      toast.success('Project funded!', { id: 'fund' })
      setFundForm({ projectAddress: '', amount: '', justification: '', corpusHash: '' })
      fetchExecutionData()
    } catch (err) {
      console.error('Failed to fund project:', err)
      toast.error(err.reason || 'Failed to fund project')
    } finally {
      setSubmitting(false)
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  const isActive = executionStatus?.isActive
  const isSunset = executionStatus?.isSunset

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

      {/* Status Banner */}
      <div className={`card p-6 ${
        isSunset ? 'bg-sunset-50 border-sunset-200' :
        isActive ? 'bg-green-50 border-green-200' :
        'bg-gray-50'
      }`}>
        <div className="flex items-center justify-between">
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
                {isSunset ? 'Sunset Complete' :
                 isActive ? 'Execution Active' :
                 'Execution Inactive'}
              </h2>
              <p className="text-sm text-gray-600">
                {isSunset ? 'Intent has been sunset and transitioned to public domain' :
                 isActive ? `Activated ${executionStatus?.activatedAt ?
                   format(new Date(Number(executionStatus.activatedAt) * 1000), 'PPpp') : ''}` :
                 'Waiting for trigger activation'}
              </p>
            </div>
          </div>

          {!isActive && !isSunset && (
            <button
              onClick={handleActivateExecution}
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              <Play size={18} />
              Activate Execution
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {executionStatus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Zap size={18} />
              <span className="text-sm">Actions Executed</span>
            </div>
            <p className="stat-value">{Number(executionStatus.actionsExecuted || 0)}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Shield size={18} />
              <span className="text-sm">Licenses Issued</span>
            </div>
            <p className="stat-value">{Number(executionStatus.licensesIssued || 0)}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <DollarSign size={18} />
              <span className="text-sm">Projects Funded</span>
            </div>
            <p className="stat-value">{Number(executionStatus.projectsFunded || 0)}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <DollarSign size={18} />
              <span className="text-sm">Revenue Distributed</span>
            </div>
            <p className="stat-value">{Number(executionStatus.revenueDistributed || 0)} ETH</p>
          </div>
        </div>
      )}

      {/* Action Forms */}
      {isActive && !isSunset && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Execute Action */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-gray-900">Execute Action</h3>
            </div>
            <form onSubmit={handleExecuteAction} className="card-body space-y-4">
              <div>
                <label className="label">Action Type</label>
                <select
                  value={actionForm.actionType}
                  onChange={(e) => setActionForm(prev => ({ ...prev, actionType: e.target.value }))}
                  className="input"
                >
                  <option value="fund_project">Fund Project</option>
                  <option value="issue_license">Issue License</option>
                  <option value="distribute_revenue">Distribute Revenue</option>
                  <option value="custom">Custom Action</option>
                </select>
              </div>
              <div>
                <label className="label">Query</label>
                <textarea
                  value={actionForm.query}
                  onChange={(e) => setActionForm(prev => ({ ...prev, query: e.target.value }))}
                  placeholder="Should I fund this AI safety project?"
                  className="input min-h-[80px]"
                />
              </div>
              <div>
                <label className="label">Corpus Hash</label>
                <input
                  type="text"
                  value={actionForm.corpusHash}
                  onChange={(e) => setActionForm(prev => ({ ...prev, corpusHash: e.target.value }))}
                  placeholder="0x..."
                  className="input font-mono"
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
              <div>
                <label className="label">Project Address</label>
                <input
                  type="text"
                  value={fundForm.projectAddress}
                  onChange={(e) => setFundForm(prev => ({ ...prev, projectAddress: e.target.value }))}
                  placeholder="0x..."
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="label">Amount (ETH)</label>
                <input
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
                <label className="label">Justification</label>
                <textarea
                  value={fundForm.justification}
                  onChange={(e) => setFundForm(prev => ({ ...prev, justification: e.target.value }))}
                  placeholder="Aligned with goal: Fund AI safety research..."
                  className="input min-h-[60px]"
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
          <span className="text-sm text-gray-500">{actionLogs.length} actions</span>
        </div>
        <div className="divide-y divide-gray-100">
          {actionLogs.length > 0 ? (
            actionLogs.map((log, index) => (
              <div key={index} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      log.executed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {log.executed ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{log.actionType}</p>
                      <p className="text-sm text-gray-600 mt-1">{log.query}</p>
                      {log.citation && (
                        <p className="text-sm text-primary-600 mt-1 italic">
                          Citation: {log.citation}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${
                      log.confidence >= 95 ? 'badge-success' :
                      log.confidence >= 80 ? 'badge-warning' :
                      'badge-danger'
                    }`}>
                      {log.confidence}% confidence
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {log.timestamp ? format(new Date(Number(log.timestamp) * 1000), 'PP p') : ''}
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
    </div>
  )
}

export default ExecutionMonitor
