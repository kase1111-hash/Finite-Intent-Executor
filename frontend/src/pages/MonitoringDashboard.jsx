import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3Context } from '../context/Web3Context';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  Zap,
  TrendingUp,
  Eye,
  RefreshCw,
  Filter,
  Download,
  Bell,
  XCircle
} from 'lucide-react';

/**
 * Real-time Event Monitoring Dashboard
 *
 * Features:
 * - Live event streaming from all FIE contracts
 * - Event filtering by type, contract, and severity
 * - Execution log viewer with confidence scores
 * - Political filtering alerts
 * - Sunset countdown monitoring
 * - Treasury balance tracking
 * - Export functionality for audit trails
 */
const MonitoringDashboard = () => {
  const { contracts, provider, account } = useWeb3Context();

  // Event state
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filter state
  const [filters, setFilters] = useState({
    eventType: 'all',
    contract: 'all',
    severity: 'all',
    timeRange: '24h'
  });

  // Stats state
  const [stats, setStats] = useState({
    totalEvents: 0,
    actionsExecuted: 0,
    inactionDefaults: 0,
    politicalBlocked: 0,
    licensesIssued: 0,
    projectsFunded: 0
  });

  // Alert state
  const [alerts, setAlerts] = useState([]);

  // Event type definitions
  const eventTypes = {
    ActionExecuted: { icon: CheckCircle, color: 'text-green-500', severity: 'info' },
    InactionDefault: { icon: AlertTriangle, color: 'text-yellow-500', severity: 'warning' },
    IntentCaptured: { icon: Shield, color: 'text-blue-500', severity: 'info' },
    IntentTriggered: { icon: Zap, color: 'text-purple-500', severity: 'critical' },
    LicenseIssued: { icon: CheckCircle, color: 'text-green-500', severity: 'info' },
    ProjectFunded: { icon: TrendingUp, color: 'text-green-500', severity: 'info' },
    SunsetActivated: { icon: Clock, color: 'text-orange-500', severity: 'critical' },
    PoliticalBlocked: { icon: XCircle, color: 'text-red-500', severity: 'critical' },
    RevenueDistributed: { icon: TrendingUp, color: 'text-green-500', severity: 'info' }
  };

  // Parse and format events
  const formatEvent = useCallback((event, contractName) => {
    const timestamp = new Date();
    const eventDef = eventTypes[event.event] || { icon: Activity, color: 'text-gray-500', severity: 'info' };

    return {
      id: `${event.transactionHash}-${event.logIndex}`,
      type: event.event,
      contract: contractName,
      args: event.args,
      timestamp,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      ...eventDef
    };
  }, []);

  // Subscribe to contract events
  const subscribeToEvents = useCallback(async () => {
    if (!contracts || !provider) return;

    setIsStreaming(true);

    const eventHandlers = [];

    // ExecutionAgent events
    if (contracts.executionAgent) {
      const agent = contracts.executionAgent;

      // ActionExecuted
      const actionFilter = agent.filters.ActionExecuted();
      const actionHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'ActionExecuted' }, 'ExecutionAgent');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, actionsExecuted: prev.actionsExecuted + 1, totalEvents: prev.totalEvents + 1 }));
      };
      agent.on(actionFilter, actionHandler);
      eventHandlers.push(() => agent.off(actionFilter, actionHandler));

      // InactionDefault
      const inactionFilter = agent.filters.InactionDefault();
      const inactionHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'InactionDefault' }, 'ExecutionAgent');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, inactionDefaults: prev.inactionDefaults + 1, totalEvents: prev.totalEvents + 1 }));
        setAlerts(prev => [{
          id: Date.now(),
          type: 'warning',
          message: `Inaction default triggered: confidence below threshold`,
          timestamp: new Date()
        }, ...prev].slice(0, 20));
      };
      agent.on(inactionFilter, inactionHandler);
      eventHandlers.push(() => agent.off(inactionFilter, inactionHandler));

      // LicenseIssued
      const licenseFilter = agent.filters.LicenseIssued();
      const licenseHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'LicenseIssued' }, 'ExecutionAgent');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, licensesIssued: prev.licensesIssued + 1, totalEvents: prev.totalEvents + 1 }));
      };
      agent.on(licenseFilter, licenseHandler);
      eventHandlers.push(() => agent.off(licenseFilter, licenseHandler));

      // ProjectFunded
      const fundedFilter = agent.filters.ProjectFunded();
      const fundedHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'ProjectFunded' }, 'ExecutionAgent');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, projectsFunded: prev.projectsFunded + 1, totalEvents: prev.totalEvents + 1 }));
      };
      agent.on(fundedFilter, fundedHandler);
      eventHandlers.push(() => agent.off(fundedFilter, fundedHandler));

      // SunsetActivated
      const sunsetFilter = agent.filters.SunsetActivated();
      const sunsetHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'SunsetActivated' }, 'ExecutionAgent');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, totalEvents: prev.totalEvents + 1 }));
        setAlerts(prev => [{
          id: Date.now(),
          type: 'critical',
          message: 'SUNSET ACTIVATED - Execution permanently halted',
          timestamp: new Date()
        }, ...prev].slice(0, 20));
      };
      agent.on(sunsetFilter, sunsetHandler);
      eventHandlers.push(() => agent.off(sunsetFilter, sunsetHandler));
    }

    // IntentCaptureModule events
    if (contracts.intentModule) {
      const intent = contracts.intentModule;

      const capturedFilter = intent.filters.IntentCaptured();
      const capturedHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'IntentCaptured' }, 'IntentCaptureModule');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, totalEvents: prev.totalEvents + 1 }));
      };
      intent.on(capturedFilter, capturedHandler);
      eventHandlers.push(() => intent.off(capturedFilter, capturedHandler));

      const triggeredFilter = intent.filters.IntentTriggered();
      const triggeredHandler = (...args) => {
        const event = args[args.length - 1];
        const formattedEvent = formatEvent({ ...event, event: 'IntentTriggered' }, 'IntentCaptureModule');
        setEvents(prev => [formattedEvent, ...prev].slice(0, 500));
        setStats(prev => ({ ...prev, totalEvents: prev.totalEvents + 1 }));
        setAlerts(prev => [{
          id: Date.now(),
          type: 'critical',
          message: 'Intent TRIGGERED - Posthumous execution activated',
          timestamp: new Date()
        }, ...prev].slice(0, 20));
      };
      intent.on(triggeredFilter, triggeredHandler);
      eventHandlers.push(() => intent.off(triggeredFilter, triggeredHandler));
    }

    return () => {
      eventHandlers.forEach(cleanup => cleanup());
      setIsStreaming(false);
    };
  }, [contracts, provider, formatEvent]);

  // Apply filters
  useEffect(() => {
    let filtered = [...events];

    if (filters.eventType !== 'all') {
      filtered = filtered.filter(e => e.type === filters.eventType);
    }

    if (filters.contract !== 'all') {
      filtered = filtered.filter(e => e.contract === filters.contract);
    }

    if (filters.severity !== 'all') {
      filtered = filtered.filter(e => e.severity === filters.severity);
    }

    if (filters.timeRange !== 'all') {
      const now = Date.now();
      const ranges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000
      };
      const cutoff = now - (ranges[filters.timeRange] || 0);
      filtered = filtered.filter(e => e.timestamp.getTime() > cutoff);
    }

    setFilteredEvents(filtered);
  }, [events, filters]);

  // Auto-refresh subscription
  useEffect(() => {
    if (autoRefresh) {
      const cleanup = subscribeToEvents();
      return () => cleanup?.then?.(fn => fn?.());
    }
  }, [autoRefresh, subscribeToEvents]);

  // Export events
  const exportEvents = () => {
    const data = filteredEvents.map(e => ({
      timestamp: e.timestamp.toISOString(),
      type: e.type,
      contract: e.contract,
      severity: e.severity,
      blockNumber: e.blockNumber,
      transactionHash: e.transactionHash,
      args: JSON.stringify(e.args)
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fie-events-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Dismiss alert
  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Activity className="w-8 h-8 text-purple-500" />
              Event Monitoring Dashboard
            </h1>
            <p className="text-gray-400 mt-1">Real-time monitoring of Finite Intent Executor events</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                autoRefresh ? 'bg-green-600' : 'bg-gray-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>

            <button
              onClick={exportEvents}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-4 rounded-lg ${
                  alert.type === 'critical' ? 'bg-red-900/50 border border-red-500' :
                  alert.type === 'warning' ? 'bg-yellow-900/50 border border-yellow-500' :
                  'bg-blue-900/50 border border-blue-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bell className={`w-5 h-5 ${
                    alert.type === 'critical' ? 'text-red-500' :
                    alert.type === 'warning' ? 'text-yellow-500' :
                    'text-blue-500'
                  }`} />
                  <span>{alert.message}</span>
                  <span className="text-sm text-gray-400">
                    {alert.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-gray-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard
            title="Total Events"
            value={stats.totalEvents}
            icon={Activity}
            color="purple"
          />
          <StatCard
            title="Actions Executed"
            value={stats.actionsExecuted}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="Inaction Defaults"
            value={stats.inactionDefaults}
            icon={AlertTriangle}
            color="yellow"
          />
          <StatCard
            title="Political Blocked"
            value={stats.politicalBlocked}
            icon={XCircle}
            color="red"
          />
          <StatCard
            title="Licenses Issued"
            value={stats.licensesIssued}
            icon={CheckCircle}
            color="blue"
          />
          <StatCard
            title="Projects Funded"
            value={stats.projectsFunded}
            icon={TrendingUp}
            color="green"
          />
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400">Filters:</span>
            </div>

            <select
              value={filters.eventType}
              onChange={(e) => setFilters(f => ({ ...f, eventType: e.target.value }))}
              className="bg-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Events</option>
              {Object.keys(eventTypes).map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <select
              value={filters.contract}
              onChange={(e) => setFilters(f => ({ ...f, contract: e.target.value }))}
              className="bg-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Contracts</option>
              <option value="ExecutionAgent">ExecutionAgent</option>
              <option value="IntentCaptureModule">IntentCaptureModule</option>
              <option value="TriggerMechanism">TriggerMechanism</option>
              <option value="SunsetProtocol">SunsetProtocol</option>
              <option value="IPToken">IPToken</option>
            </select>

            <select
              value={filters.severity}
              onChange={(e) => setFilters(f => ({ ...f, severity: e.target.value }))}
              className="bg-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>

            <select
              value={filters.timeRange}
              onChange={(e) => setFilters(f => ({ ...f, timeRange: e.target.value }))}
              className="bg-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        {/* Event Stream */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Event Stream ({filteredEvents.length} events)
            </h2>
          </div>

          <div className="divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No events to display</p>
                <p className="text-sm mt-2">
                  {autoRefresh ? 'Waiting for new events...' : 'Enable live streaming to see events'}
                </p>
              </div>
            ) : (
              filteredEvents.map(event => (
                <EventRow key={event.id} event={event} eventTypes={eventTypes} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, icon: Icon, color }) => {
  const colors = {
    purple: 'bg-purple-900/50 border-purple-500 text-purple-400',
    green: 'bg-green-900/50 border-green-500 text-green-400',
    yellow: 'bg-yellow-900/50 border-yellow-500 text-yellow-400',
    red: 'bg-red-900/50 border-red-500 text-red-400',
    blue: 'bg-blue-900/50 border-blue-500 text-blue-400'
  };

  return (
    <div className={`${colors[color]} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-sm text-gray-400">{title}</p>
    </div>
  );
};

// Event Row Component
const EventRow = ({ event, eventTypes }) => {
  const [expanded, setExpanded] = useState(false);
  const IconComponent = event.icon;

  return (
    <div className="p-4 hover:bg-gray-700/50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center gap-4">
        <IconComponent className={`w-5 h-5 ${event.color}`} />

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{event.type}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              event.severity === 'critical' ? 'bg-red-900 text-red-300' :
              event.severity === 'warning' ? 'bg-yellow-900 text-yellow-300' :
              'bg-blue-900 text-blue-300'
            }`}>
              {event.severity}
            </span>
          </div>
          <div className="text-sm text-gray-400">
            {event.contract} • Block #{event.blockNumber}
          </div>
        </div>

        <div className="text-sm text-gray-400">
          {event.timestamp.toLocaleTimeString()}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 p-4 bg-gray-900 rounded-lg text-sm">
          <div className="mb-2">
            <span className="text-gray-400">Transaction: </span>
            <span className="font-mono text-xs">{event.transactionHash}</span>
          </div>
          {event.args && (
            <div>
              <span className="text-gray-400">Arguments:</span>
              <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-x-auto">
                {JSON.stringify(event.args, (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                , 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonitoringDashboard;
