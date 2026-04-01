import { useState, useEffect } from 'react';
import { Eye, AlertTriangle, Clock, Power, Plus, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import StatusBadge from '../components/StatusBadge';
import { getWatchlist, addToWatchlist, updateMonitoringStatus } from '../lib/api';
import type { WatchlistEntry, MonitoringStatus } from '../types';

const RETAILERS = [
  'All',
  'Nike SNKRS',
  'Foot Locker',
  'Finish Line',
  'Champs Sports',
  'GOAT',
  'StockX',
];

export default function Dashboard() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>('active');

  // Quick add form
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [retailer, setRetailer] = useState('All');
  const [interval, setInterval_] = useState(30);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const data = await getWatchlist();
      setWatchlist(data);
    } catch {
      toast.error('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleMonitoring() {
    const next: MonitoringStatus = monitoringStatus === 'active' ? 'paused' : 'active';
    try {
      await updateMonitoringStatus(next);
      setMonitoringStatus(next);
      toast.success(`Monitoring ${next === 'active' ? 'resumed' : 'paused'}`);
    } catch {
      toast.error('Failed to update monitoring status');
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      const entry = await addToWatchlist({
        name: name.trim(),
        url: url.trim(),
        retailer,
        scrapeInterval: interval,
      });
      setWatchlist((prev) => [entry, ...prev]);
      setName('');
      setUrl('');
      toast.success(`Added "${entry.name}" to watchlist`);
    } catch {
      toast.error('Failed to add shoe');
    } finally {
      setAdding(false);
    }
  }

  const alertsToday = watchlist.filter(
    (w) => w.lastResult === 'in_stock' && w.lastChecked && new Date(w.lastChecked).toDateString() === new Date().toDateString()
  ).length;

  const lastScrape = watchlist
    .filter((w) => w.lastChecked)
    .sort((a, b) => new Date(b.lastChecked!).getTime() - new Date(a.lastChecked!).getTime())[0];

  const recentActivity = [...watchlist]
    .filter((w) => w.lastChecked)
    .sort((a, b) => new Date(b.lastChecked!).getTime() - new Date(a.lastChecked!).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[#00ff87]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-bold text-[#ffffff]">Dashboard</h1>
        <p className="text-[#888888] text-sm mt-1">Monitor your sneaker watchlist at a glance</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#00ff87]/10">
              <Eye size={18} className="text-[#00ff87]" />
            </div>
            <span className="text-[#888888] text-sm">Watching</span>
          </div>
          <p className="text-2xl font-bold text-[#ffffff]">{watchlist.length}</p>
        </div>

        <div className="bg-[#111111] border border-[#222222] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#ff6b35]/10">
              <AlertTriangle size={18} className="text-[#ff6b35]" />
            </div>
            <span className="text-[#888888] text-sm">Alerts Today</span>
          </div>
          <p className="text-2xl font-bold text-[#ffffff]">{alertsToday}</p>
        </div>

        <div className="bg-[#111111] border border-[#222222] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#888888]/10">
              <Clock size={18} className="text-[#888888]" />
            </div>
            <span className="text-[#888888] text-sm">Last Scrape</span>
          </div>
          <p className="text-sm font-medium text-[#ffffff]">
            {lastScrape?.lastChecked
              ? formatDistanceToNow(new Date(lastScrape.lastChecked), { addSuffix: true })
              : 'Never'}
          </p>
        </div>

        <div className="bg-[#111111] border border-[#222222] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${monitoringStatus === 'active' ? 'bg-[#00ff87]/10' : 'bg-[#eab308]/10'}`}>
              <Power size={18} className={monitoringStatus === 'active' ? 'text-[#00ff87]' : 'text-[#eab308]'} />
            </div>
            <span className="text-[#888888] text-sm">Monitoring</span>
          </div>
          <button
            onClick={handleToggleMonitoring}
            className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
              monitoringStatus === 'active'
                ? 'bg-[#00ff87]/10 text-[#00ff87] hover:bg-[#00ff87]/20'
                : 'bg-[#eab308]/10 text-[#eab308] hover:bg-[#eab308]/20'
            }`}
          >
            {monitoringStatus === 'active' ? 'Active' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Quick Add */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5">
        <h2 className="text-lg font-semibold text-[#ffffff] mb-4 flex items-center gap-2">
          <Plus size={18} className="text-[#00ff87]" />
          Quick Add Shoe
        </h2>
        <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Shoe name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors"
            required
          />
          <input
            type="url"
            placeholder="Product URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors"
          />
          <select
            value={retailer}
            onChange={(e) => setRetailer(e.target.value)}
            className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2 text-sm text-[#ffffff] focus:outline-none focus:border-[#00ff87] transition-colors"
          >
            {RETAILERS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={1440}
              value={interval}
              onChange={(e) => setInterval_(Number(e.target.value))}
              className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2 text-sm text-[#ffffff] w-full focus:outline-none focus:border-[#00ff87] transition-colors"
            />
            <span className="text-[#888888] text-xs whitespace-nowrap">min</span>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="bg-[#00ff87] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2 hover:bg-[#00ff87]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>
        </form>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5">
        <h2 className="text-lg font-semibold text-[#ffffff] mb-4">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <div className="text-center py-8">
            <Clock size={32} className="text-[#888888] mx-auto mb-3" />
            <p className="text-[#888888] text-sm">No activity yet. Add shoes to your watchlist to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3 px-4 rounded-lg bg-[#0a0a0a] border border-[#222222]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#ffffff] truncate">{item.name}</p>
                    <p className="text-xs text-[#888888]">
                      {item.retailer} &middot;{' '}
                      {item.lastChecked
                        ? formatDistanceToNow(new Date(item.lastChecked), { addSuffix: true })
                        : 'Pending'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={item.status} />
                  {item.lastResult && <StatusBadge status={item.lastResult} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
