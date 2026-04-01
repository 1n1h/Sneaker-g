import { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Plus, Trash2, Pause, Play, Loader2, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../components/StatusBadge';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistEntry,
} from '../lib/api';
import type { WatchlistEntry } from '../types';

const RETAILERS = [
  'All',
  'Nike SNKRS',
  'Foot Locker',
  'Finish Line',
  'Champs Sports',
  'GOAT',
  'StockX',
];

const PLACEHOLDER_IMG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#111111" width="200" height="200"/><rect x="70" y="80" width="60" height="35" rx="8" fill="#222222"/><rect x="60" y="95" width="80" height="20" rx="6" fill="#222222"/></svg>')}`;

function formatReleaseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return dateStr;
    return format(parsed, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export default function Watchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formRetailer, setFormRetailer] = useState('All');
  const [formInterval, setFormInterval] = useState(30);
  const [formNotes, setFormNotes] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Editing intervals
  const [editingInterval, setEditingInterval] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(30);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const entry = await addToWatchlist({
        name: formName.trim(),
        url: formUrl.trim(),
        retailer: formRetailer,
        scrapeInterval: formInterval,
        notes: formNotes.trim() || undefined,
      });
      setWatchlist((prev) => [entry, ...prev]);
      toast.success(`Added "${entry.name}"`);
      resetForm();
      setModalOpen(false);
    } catch {
      toast.error('Failed to add shoe');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await removeFromWatchlist(id);
      setWatchlist((prev) => prev.filter((w) => w.id !== id));
      toast.success(`Removed "${name}"`);
    } catch {
      toast.error('Failed to remove shoe');
    }
  }

  async function handleTogglePause(entry: WatchlistEntry) {
    const newStatus = entry.status === 'paused' ? 'monitoring' : 'paused';
    try {
      const updated = await updateWatchlistEntry(entry.id, { status: newStatus });
      setWatchlist((prev) => prev.map((w) => (w.id === entry.id ? updated : w)));
      toast.success(`${newStatus === 'paused' ? 'Paused' : 'Resumed'} "${entry.name}"`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function handleSaveInterval(id: string) {
    try {
      const updated = await updateWatchlistEntry(id, { scrapeInterval: editValue });
      setWatchlist((prev) => prev.map((w) => (w.id === id ? updated : w)));
      setEditingInterval(null);
      toast.success('Interval updated');
    } catch {
      toast.error('Failed to update interval');
    }
  }

  function resetForm() {
    setFormName('');
    setFormUrl('');
    setFormRetailer('All');
    setFormInterval(30);
    setFormNotes('');
    setFormImageUrl('');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[#3B9EFF]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#ffffff]">Watchlist</h1>
          <p className="text-[#888888] text-sm mt-1">{watchlist.length} shoes being monitored</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-[#3B9EFF] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2.5 hover:bg-[#3B9EFF]/90 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Add Shoe</span>
        </button>
      </div>

      {watchlist.length === 0 ? (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-8 sm:p-12 text-center">
          <Eye size={48} className="text-[#888888] mx-auto mb-4" />
          <h3 className="text-[#ffffff] font-semibold text-lg mb-2">No shoes in your watchlist</h3>
          <p className="text-[#888888] text-sm mb-4">
            Start by adding a shoe to monitor its stock status automatically.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-[#3B9EFF] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2.5 hover:bg-[#3B9EFF]/90 transition-colors inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Add Your First Shoe
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {watchlist.map((entry) => (
            <div
              key={entry.id}
              className="bg-[#111111] border border-[#222222] rounded-xl overflow-hidden flex flex-col hover:border-[#333333] transition-colors"
            >
              {/* Shoe image */}
              <div className="w-full h-40 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
                <img
                  src={entry.imageUrl || PLACEHOLDER_IMG}
                  alt={entry.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PLACEHOLDER_IMG;
                  }}
                />
              </div>

              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[#ffffff] font-semibold text-sm truncate">{entry.name}</h3>
                    {entry.releaseDate && (
                      <p className="text-[#888888] text-xs mt-0.5">
                        {'\uD83D\uDCC5'} Release: {formatReleaseDate(entry.releaseDate)}
                      </p>
                    )}
                    {entry.retailPrice && (
                      <p className="text-[#3B9EFF] text-xs mt-0.5">
                        {'\uD83D\uDCB0'} {entry.retailPrice}
                      </p>
                    )}
                    <p className="text-[#888888] text-xs mt-0.5">{entry.retailer}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <StatusBadge status={entry.status} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[#888888] mb-0.5">Interval</p>
                    {editingInterval === entry.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={5}
                          max={1440}
                          value={editValue}
                          onChange={(e) => setEditValue(Number(e.target.value))}
                          className="bg-[#0a0a0a] border border-[#222222] rounded px-2 py-1 text-xs text-[#ffffff] w-16 focus:outline-none focus:border-[#3B9EFF]"
                        />
                        <button
                          onClick={() => handleSaveInterval(entry.id)}
                          className="text-[#3B9EFF] hover:text-[#3B9EFF]/80 text-xs font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingInterval(null)}
                          className="text-[#888888] hover:text-[#ffffff] text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingInterval(entry.id);
                          setEditValue(entry.scrapeInterval);
                        }}
                        className="text-[#ffffff] hover:text-[#3B9EFF] transition-colors"
                      >
                        {entry.scrapeInterval}m
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="text-[#888888] mb-0.5">Last Checked</p>
                    <p className="text-[#ffffff]">
                      {entry.lastChecked
                        ? formatDistanceToNow(new Date(entry.lastChecked), { addSuffix: true })
                        : 'Never'}
                    </p>
                  </div>
                </div>

                {entry.lastResult && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#888888] text-xs">Last Result:</span>
                    <StatusBadge status={entry.lastResult} />
                  </div>
                )}

                {entry.url && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#888888] hover:text-[#3B9EFF] truncate transition-colors"
                  >
                    {entry.url}
                  </a>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-[#222222] mt-auto">
                  <button
                    onClick={() => handleTogglePause(entry)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      entry.status === 'paused'
                        ? 'bg-[#3B9EFF]/10 text-[#3B9EFF] hover:bg-[#3B9EFF]/20'
                        : 'bg-[#eab308]/10 text-[#eab308] hover:bg-[#eab308]/20'
                    }`}
                  >
                    {entry.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                    {entry.status === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id, entry.name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Shoe Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setModalOpen(false)} />
          <div className="relative bg-[#111111] border border-[#222222] rounded-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#ffffff]">Add Shoe to Watchlist</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[#888888] hover:text-[#ffffff] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs text-[#888888] mb-1">Shoe Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nike Air Jordan 1 Retro High OG"
                  className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#3B9EFF] transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#888888] mb-1">Product URL</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://www.nike.com/launch/..."
                  className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#3B9EFF] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-[#888888] mb-1">Image URL (optional)</label>
                <input
                  type="url"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="https://example.com/shoe-image.jpg"
                  className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#3B9EFF] transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#888888] mb-1">Retailer</label>
                  <select
                    value={formRetailer}
                    onChange={(e) => setFormRetailer(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] focus:outline-none focus:border-[#3B9EFF] transition-colors"
                  >
                    {RETAILERS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#888888] mb-1">Interval (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={formInterval}
                    onChange={(e) => setFormInterval(Number(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] focus:outline-none focus:border-[#3B9EFF] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#888888] mb-1">Notes (optional)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Size 10, any colorway..."
                  rows={2}
                  className="w-full bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#3B9EFF] transition-colors resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#3B9EFF] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2.5 hover:bg-[#3B9EFF]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add to Watchlist
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
