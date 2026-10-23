import MonitorDashboard from "@/components/monitor-dashboard";

export default function MonitoringPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">OLT Monitoring</h1>
      <p className="mb-6 text-sm text-gray-500">
        Live status of every OLT and ONU, and the optical power each ONU receives.
      </p>
      <MonitorDashboard />
    </div>
  );
}
