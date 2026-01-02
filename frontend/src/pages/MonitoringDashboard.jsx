import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  XCircle,
  Lock,
  Unlock,
  Server,
  Database,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Wifi,
  WifiOff
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

  // Security integration state
  const [securityStatus, setSecurityStatus] = useState({
    siemConnected: false,
    daemonConnected: false,
    lastHealthCheck: null,
    protectionEnabled: true,
    failClosed: true
  });

  const [securityStats, setSecurityStats] = useState({
    eventsReported: 0,
    protectionChecks: 0,
    deniedActions: 0,
    policyViolations: 0,
    politicalBlocks: 0
  });

  const [securityAlerts, setSecurityAlerts] = useState([]);
  const securityClientRef = useRef(null);

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

  // Initialize security integration
  const initializeSecurity = useCallback(async () => {
    try {
      // Dynamic import for security client (works with webpack code splitting)
      const securityConfig = {
        siem: {
          apiUrl: process.env.REACT_APP_BOUNDARY_SIEM_URL || 'http://localhost:8080',
          apiKey: process.env.REACT_APP_BOUNDARY_SIEM_API_KEY,
          transport: 'rest'
        },
        daemon: {
          host: process.env.REACT_APP_BOUNDARY_DAEMON_HOST || 'localhost',
          port: parseInt(process.env.REACT_APP_BOUNDARY_DAEMON_PORT || '9999')
        },
        enabled: process.env.REACT_APP_SECURITY_ENABLED !== 'false'
      };

      // Attempt to connect to security services
      const healthResponse = await fetch(`${securityConfig.siem.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }).catch(() => null);

      if (healthResponse?.ok) {
        setSecurityStatus(prev => ({
          ...prev,
          siemConnected: true,
          lastHealthCheck: new Date()
        }));
      }

      // Check daemon connection
      const daemonHealth = await fetch(
        `http://${securityConfig.daemon.host}:${securityConfig.daemon.port}/health`,
        { method: 'GET', headers: { 'Accept': 'application/json' } }
      ).catch(() => null);

      if (daemonHealth?.ok) {
        setSecurityStatus(prev => ({
          ...prev,
          daemonConnected: true,
          lastHealthCheck: new Date()
        }));
      }

      securityClientRef.current = securityConfig;
    } catch (err) {
      console.warn('Security integration initialization failed:', err);
    }
  }, []);

  // Report event to SIEM
  const reportToSIEM = useCallback(async (event) => {
    if (!securityStatus.siemConnected || !securityClientRef.current) return;

    try {
      const siemConfig = securityClientRef.current.siem;
      await fetch(`${siemConfig.apiUrl}/api/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': siemConfig.apiKey ? `Bearer ${siemConfig.apiKey}` : ''
        },
        body: JSON.stringify({
          source: 'FIE-Dashboard',
          timestamp: new Date().toISOString(),
          severity: event.severity === 'critical' ? 8 : event.severity === 'warning' ? 4 : 2,
          category: event.contract,
          action: event.type,
          data: {
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            args: event.args
          }
        })
      });

      setSecurityStats(prev => ({
        ...prev,
        eventsReported: prev.eventsReported + 1
      }));
    } catch (err) {
      console.warn('Failed to report to SIEM:', err);
    }
  }, [securityStatus.siemConnected]);

  // Check action with daemon protection
  const checkWithDaemon = useCallback(async (action, context) => {
    if (!securityStatus.daemonConnected || !securityClientRef.current) {
      return { allowed: !securityStatus.failClosed, reason: 'daemon_unavailable' };
    }

    try {
      const daemonConfig = securityClientRef.current.daemon;
      const response = await fetch(
        `http://${daemonConfig.host}:${daemonConfig.port}/api/v1/gate/tool`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: action,
            parameters: context,
            context: { source: 'FIE-Dashboard' }
          })
        }
      );

      const result = await response.json();
      setSecurityStats(prev => ({
        ...prev,
        protectionChecks: prev.protectionChecks + 1,
        deniedActions: result.allowed ? prev.deniedActions : prev.deniedActions + 1
      }));

      if (!result.allowed) {
        setSecurityAlerts(prev => [{
          id: Date.now(),
          type: 'policy',
          message: `Action denied by daemon: ${action} - ${result.reason}`,
          timestamp: new Date()
        }, ...prev].slice(0, 50));
      }

      return result;
    } catch (err) {
      console.warn('Failed to check with daemon:', err);
      return { allowed: !securityStatus.failClosed, reason: 'check_failed' };
    }
  }, [securityStatus.daemonConnected, securityStatus.failClosed]);

  // Initialize security on mount
  useEffect(() => {
    initializeSecurity();

    // Periodic health check
    const healthInterval = setInterval(() => {
      initializeSecurity();
    }, 30000); // Every 30 seconds

    return () => clearInterval(healthInterval);
  }, [initializeSecurity]);

  // Report significant events to SIEM
  useEffect(() => {
    const significantEvents = events.filter(e =>
      e.severity === 'critical' || e.severity === 'warning'
    ).slice(0, 10);

    significantEvents.forEach(event => {
      if (!event.reportedToSIEM) {
        reportToSIEM(event);
        event.reportedToSIEM = true;
      }
    });
  }, [events, reportToSIEM]);

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

        {/* Security Status Panel */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              Security Integration Status
            </h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSecurityStatus(s => ({ ...s, protectionEnabled: !s.protectionEnabled }))}
                className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${
                  securityStatus.protectionEnabled ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                {securityStatus.protectionEnabled ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                Protection {securityStatus.protectionEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={initializeSecurity}
                className="flex items-center gap-2 px-3 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* SIEM Connection */}
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              securityStatus.siemConnected ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
            }`}>
              <Database className={`w-6 h-6 ${securityStatus.siemConnected ? 'text-green-500' : 'text-red-500'}`} />
              <div>
                <div className="text-sm font-medium">Boundary-SIEM</div>
                <div className={`text-xs ${securityStatus.siemConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {securityStatus.siemConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              {securityStatus.siemConnected ?
                <Wifi className="w-4 h-4 text-green-500 ml-auto" /> :
                <WifiOff className="w-4 h-4 text-red-500 ml-auto" />
              }
            </div>

            {/* Daemon Connection */}
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              securityStatus.daemonConnected ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
            }`}>
              <Server className={`w-6 h-6 ${securityStatus.daemonConnected ? 'text-green-500' : 'text-red-500'}`} />
              <div>
                <div className="text-sm font-medium">Boundary-Daemon</div>
                <div className={`text-xs ${securityStatus.daemonConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {securityStatus.daemonConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              {securityStatus.daemonConnected ?
                <ShieldCheck className="w-4 h-4 text-green-500 ml-auto" /> :
                <ShieldAlert className="w-4 h-4 text-red-500 ml-auto" />
              }
            </div>

            {/* Events Reported */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-900/30 border border-blue-700">
              <Radio className="w-6 h-6 text-blue-500" />
              <div>
                <div className="text-sm font-medium">Events Reported</div>
                <div className="text-lg font-bold text-blue-400">{securityStats.eventsReported}</div>
              </div>
            </div>

            {/* Protection Stats */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-900/30 border border-purple-700">
              <Shield className="w-6 h-6 text-purple-500" />
              <div>
                <div className="text-sm font-medium">Protection Checks</div>
                <div className="text-lg font-bold text-purple-400">
                  {securityStats.protectionChecks}
                  {securityStats.deniedActions > 0 && (
                    <span className="text-sm text-red-400 ml-2">({securityStats.deniedActions} denied)</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {securityStatus.lastHealthCheck && (
            <div className="mt-3 text-xs text-gray-500 text-right">
              Last health check: {securityStatus.lastHealthCheck.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Security Alerts */}
        {securityAlerts.length > 0 && (
          <div className="mb-6 space-y-2">
            <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Security Alerts
            </h3>
            {securityAlerts.slice(0, 5).map(alert => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 rounded-lg bg-orange-900/50 border border-orange-500"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-orange-500" />
                  <span className="text-sm">{alert.message}</span>
                  <span className="text-xs text-gray-400">
                    {alert.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={() => setSecurityAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  className="text-gray-400 hover:text-white"
                >
                  <XCircle className="w-4 h-4" />
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
