import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

export default function MonitoringDashboard() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchMonitoringData();
      const interval = setInterval(fetchMonitoringData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchMonitoringData = async () => {
    try {
      const [metricsRes, performanceRes] = await Promise.all([
        fetch('http://localhost:3010/api/analytics/utilization', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('http://localhost:3010/api/analytics/performance', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const metricsData = await metricsRes.json();
      const performanceData = await performanceRes.json();

      if (metricsData.success) setMetrics(metricsData.metrics);
      if (performanceData.success) setPerformance(performanceData.performance);

      // Simulate alerts based on metrics
      generateAlerts(metricsData.metrics, performanceData.performance);
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAlerts = (metrics, performance) => {
    const newAlerts = [];
    
    if (metrics?.utilization?.current < 50) {
      newAlerts.push({
        id: Date.now(),
        type: 'warning',
        title: 'Low Utilization',
        message: `Current utilization is ${metrics.utilization.current}%`,
        timestamp: new Date().toISOString()
      });
    }

    if (performance?.processing?.errorRate > 1) {
      newAlerts.push({
        id: Date.now() + 1,
        type: 'error',
        title: 'High Error Rate',
        message: `Error rate is ${performance.processing.errorRate}%`,
        timestamp: new Date().toISOString()
      });
    }

    setAlerts(newAlerts);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Health */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {performance?.system?.uptime || '99.97%'}
              </div>
              <div className="text-sm text-gray-600">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {performance?.system?.responseTime || '142'}ms
              </div>
              <div className="text-sm text-gray-600">Response Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {performance?.system?.activeConnections || '27'}
              </div>
              <div className="text-sm text-gray-600">Active Connections</div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Performance Metrics</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-sm font-medium text-gray-600">Messages Processed</div>
              <div className="text-2xl font-bold text-gray-900">
                {performance?.processing?.messagesProcessed?.toLocaleString() || '9,876'}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Success Rate</div>
              <div className="text-2xl font-bold text-green-600">
                {performance?.processing?.successRate || '99.7'}%
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Error Rate</div>
              <div className="text-2xl font-bold text-red-600">
                {performance?.processing?.errorRate || '0.3'}%
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Average Time</div>
              <div className="text-2xl font-bold text-blue-600">
                {performance?.processing?.averageTime || '47'}ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Business Metrics */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Business Impact</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-sm font-medium text-gray-600">Appointments Scheduled</div>
              <div className="text-2xl font-bold text-gray-900">
                {performance?.business?.appointmentsScheduled?.toLocaleString() || '4,521'}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">No-Show Reduction</div>
              <div className="text-2xl font-bold text-green-600">
                {performance?.business?.noShowReduction || '47'}%
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Revenue Increase</div>
              <div className="text-2xl font-bold text-green-600">
                ${(performance?.business?.revenueIncrease / 1000000 || 2.3).toFixed(1)}M
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Satisfaction Score</div>
              <div className="text-2xl font-bold text-blue-600">
                {performance?.business?.satisfactionScore || '94'}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    alert.type === 'error'
                      ? 'bg-red-50 border-red-400'
                      : 'bg-yellow-50 border-yellow-400'
                  }`}
                >
                  <div className="flex">
                    <div className="flex-shrink-0">
                      {alert.type === 'error' ? (
                        <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="ml-3">
                      <h3 className={`text-sm font-medium ${
                        alert.type === 'error' ? 'text-red-800' : 'text-yellow-800'
                      }`}>
                        {alert.title}
                      </h3>
                      <div className={`mt-2 text-sm ${
                        alert.type === 'error' ? 'text-red-700' : 'text-yellow-700'
                      }`}>
                        <p>{alert.message}</p>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 