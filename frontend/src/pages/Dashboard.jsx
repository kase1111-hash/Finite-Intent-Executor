import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWeb3 } from '../context/Web3Context'
import { TRIGGER_TYPES, SUNSET_PHASES } from '../contracts/config'
import {
  FileText,
  Zap,
  Coins,
  Activity,
  Sunset,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { formatDistanceToNow, format, differenceInDays } from 'date-fns'

function StatCard({ icon: Icon, label, value, subValue, color = 'primary', link }) {
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    sunset: 'bg-sunset-50 text-sunset-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  }

  const content = (
    <div className="stat-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-1">{value}</p>
          {subValue && <p className="text-sm text-gray-500 mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  )

  if (link) {
    return <Link to={link}>{content}</Link>
  }

  return content
}

function StatusBadge({ status }) {
  const statusConfig = {
    active: { icon: CheckCircle, color: 'badge-success', text: 'Active' },
    pending: { icon: Clock, color: 'badge-warning', text: 'Pending' },
    triggered: { icon: AlertTriangle, color: 'badge-danger', text: 'Triggered' },
    revoked: { icon: XCircle, color: 'badge-neutral', text: 'Revoked' },
    sunset: { icon: Sunset, color: 'badge-info', text: 'Sunset' },
  }

  const config = statusConfig[status] || statusConfig.pending

  return (
    <span className={config.color}>
      <config.icon size={14} className="mr-1" />
      {config.text}
    </span>
  )
}

function Dashboard() {
  const { account, contracts, isConnected } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({
    intent: null,
    trigger: null,
    execution: null,
    sunset: null,
    tokenCount: 0,
  })

  const fetchData = async () => {
    if (!isConnected || !account || !contracts.IntentCaptureModule) return

    setLoading(true)
    try {
      const [intent, trigger, execution, sunset] = await Promise.all([
        contracts.IntentCaptureModule?.getIntent(account).catch(() => null),
        contracts.TriggerMechanism?.getTriggerConfig(account).catch(() => null),
        contracts.ExecutionAgent?.getExecutionStatus(account).catch(() => null),
        contracts.SunsetProtocol?.getSunsetStatus(account).catch(() => null),
      ])

      let tokenCount = 0
      try {
        tokenCount = Number(await contracts.IPToken?.balanceOf(account) || 0)
      } catch {}

      setData({ intent, trigger, execution, sunset, tokenCount })
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [account, contracts, isConnected])

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Activity size={40} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Welcome to Finite Intent Executor
        </h2>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          Connect your wallet to manage your posthumous intent with strict temporal bounds and safeguards.
        </p>
        <div className="text-sm text-gray-500">
          Connect using the sidebar to get started
        </div>
      </div>
    )
  }

  const hasIntent = data.intent && data.intent.intentHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
  const triggerType = data.trigger ? TRIGGER_TYPES[data.trigger.triggerType] : 'Not Configured'
  const isTriggered = data.trigger?.isTriggered
  const isExecutionActive = data.execution?.isActive
  const sunsetPhase = data.sunset ? SUNSET_PHASES[data.sunset.phase] : 'Not Started'
  const isSunset = data.sunset?.isComplete

  // Calculate sunset countdown
  let sunsetCountdown = null
  let sunsetProgress = 0
  if (data.trigger?.triggeredAt && !isSunset) {
    const triggerDate = new Date(Number(data.trigger.triggeredAt) * 1000)
    const sunsetDate = new Date(triggerDate.getTime() + 20 * 365 * 24 * 60 * 60 * 1000)
    const now = new Date()
    const totalDays = 20 * 365
    const daysElapsed = differenceInDays(now, triggerDate)
    const daysRemaining = differenceInDays(sunsetDate, now)
    sunsetProgress = Math.min(100, (daysElapsed / totalDays) * 100)
    sunsetCountdown = daysRemaining > 0 ? daysRemaining : 0
  }

  const getOverallStatus = () => {
    if (isSunset) return 'sunset'
    if (data.intent?.isRevoked) return 'revoked'
    if (isTriggered) return 'triggered'
    if (hasIntent) return 'active'
    return 'pending'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Overview of your Finite Intent Executor status
          </p>
        </div>
        <button
          onClick={fetchData}
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
        isTriggered ? 'bg-yellow-50 border-yellow-200' :
        hasIntent ? 'bg-green-50 border-green-200' :
        'bg-gray-50'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <StatusBadge status={getOverallStatus()} />
            <span className="text-gray-700">
              {isSunset ? 'Your legacy has been sunset and transitioned to public domain.' :
               isTriggered ? 'Trigger activated. Execution agent is active.' :
               hasIntent ? 'Intent captured and secured on-chain.' :
               'No intent captured yet. Get started below.'}
            </span>
          </div>
          {!hasIntent && (
            <Link to="/intent" className="btn-primary flex items-center gap-2">
              Get Started
              <ArrowRight size={18} />
            </Link>
          )}
        </div>
      </div>

      {/* Sunset Countdown */}
      {isTriggered && !isSunset && sunsetCountdown !== null && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sunset size={24} className="text-sunset-500" />
              <div>
                <h3 className="font-semibold text-gray-900">Sunset Countdown</h3>
                <p className="text-sm text-gray-600">Time until public domain transition</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-sunset-600">{sunsetCountdown.toLocaleString()} days</p>
              <p className="text-sm text-gray-500">~{Math.round(sunsetCountdown / 365)} years remaining</p>
            </div>
          </div>
          <div className="sunset-progress">
            <div className="sunset-progress-bar" style={{ width: `${sunsetProgress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Triggered</span>
            <span>{sunsetProgress.toFixed(1)}% complete</span>
            <span>20-Year Sunset</span>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={FileText}
          label="Intent Status"
          value={hasIntent ? 'Captured' : 'Not Set'}
          subValue={hasIntent && data.intent ? `Version ${data.intent.version}` : null}
          color={hasIntent ? 'green' : 'yellow'}
          link="/intent"
        />
        <StatCard
          icon={Zap}
          label="Trigger"
          value={triggerType}
          subValue={isTriggered ? 'Activated' : 'Waiting'}
          color={isTriggered ? 'sunset' : 'primary'}
          link="/triggers"
        />
        <StatCard
          icon={Coins}
          label="IP Tokens"
          value={data.tokenCount}
          subValue="Minted tokens"
          color="primary"
          link="/tokens"
        />
        <StatCard
          icon={Activity}
          label="Execution"
          value={isExecutionActive ? 'Active' : 'Inactive'}
          subValue={data.execution ? `${data.execution.actionsExecuted || 0} actions` : null}
          color={isExecutionActive ? 'green' : 'yellow'}
          link="/execution"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link to="/intent" className="card p-6 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-50 text-primary-600 rounded-xl group-hover:bg-primary-100 transition-colors">
              <FileText size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Capture Intent</h3>
              <p className="text-sm text-gray-600">Define your goals and constraints</p>
            </div>
            <ArrowRight size={20} className="text-gray-400 group-hover:text-primary-600 transition-colors" />
          </div>
        </Link>

        <Link to="/tokens" className="card p-6 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-100 transition-colors">
              <Coins size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Tokenize IP</h3>
              <p className="text-sm text-gray-600">Mint ERC721 tokens for your IP</p>
            </div>
            <ArrowRight size={20} className="text-gray-400 group-hover:text-green-600 transition-colors" />
          </div>
        </Link>

        <Link to="/triggers" className="card p-6 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-sunset-50 text-sunset-600 rounded-xl group-hover:bg-sunset-100 transition-colors">
              <Zap size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Configure Triggers</h3>
              <p className="text-sm text-gray-600">Set up activation conditions</p>
            </div>
            <ArrowRight size={20} className="text-gray-400 group-hover:text-sunset-600 transition-colors" />
          </div>
        </Link>
      </div>

      {/* Recent Activity */}
      {hasIntent && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Intent Details</h3>
            <Link to="/intent" className="text-sm text-primary-600 hover:text-primary-700">
              View Details
            </Link>
          </div>
          <div className="card-body">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Intent Hash</dt>
                <dd className="font-mono text-sm text-gray-900 break-all">
                  {data.intent?.intentHash?.slice(0, 20)}...
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Corpus Window</dt>
                <dd className="text-gray-900">
                  {data.intent?.corpusStartYear?.toString()} - {data.intent?.corpusEndYear?.toString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Created</dt>
                <dd className="text-gray-900">
                  {data.intent?.createdAt ?
                    format(new Date(Number(data.intent.createdAt) * 1000), 'PPP') :
                    'Unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Status</dt>
                <dd>
                  <StatusBadge status={data.intent?.isRevoked ? 'revoked' : 'active'} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
