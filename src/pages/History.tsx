import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Loader2, Clock, Filter, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../components/StatusBadge';
import { getHistory } from '../lib/api';
import type { ScrapeHistoryEntry } from '../types';

const RESULT_TYPES = ['all', 'in_stock', 'coming_soon', 'sold_out', 'unknown', 'blocked'] as const;
const DATE_RANGES = ['all', '24h', '7d', '30d'] as const;

export default function History() {
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResult, setFilterResult] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const data = await getHistory();
      setHistory(data);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  const filteredHistory = useMemo(() => {
    let items = [...history];

    if (filterResult !== 'all') {
      items = items.filter((h) => h.result === filterResult);
    }

    if (filterDate !== 'all') {
      const now = Date.now();
      const ranges: Record<string, number> = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      const cutoff = now - (ranges[filterDate] || 0);
      items = items.filter((h) => new Date(h.timestamp).getTime() >= cutoff);
    }

    return items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [history, filterResult, filterDate]);

  const rowBg: Record<string, string> = {
    in_stock: 'bg-[#00ff87]/5',
    coming_soon: 'bg-[#eab308]/5',
    sold_out: 'bg-[#ef4444]/5',
    blocked: 'bg-[#ff6b35]/5',
    unknown: '',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[#00ff87]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#ffffff]">Scrape History</h1>
        <p className="text-[#888888] text-sm mt-1">
          {filteredHistory.length} entries{filterResult !== 'all' || filterDate !== 'all' ? ' (filtered)' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#888888]" />
          <span className="text-[#888888] text-sm">Filters:</span>
        </div>
        <select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="bg-[#111111] border border-[#222222] rounded-lg px-3 py-2 text-sm text-[#ffffff] focus:outline-none focus:border-[#00ff87] transition-colors"
        >
          {RESULT_TYPES.map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All Results' : r.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="bg-[#111111] border border-[#222222] rounded-lg px-3 py-2 text-sm text-[#ffffff] focus:outline-none focus:border-[#00ff87] transition-colors"
        >
          {DATE_RANGES.map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All Time' : `Last ${r}`}
            </option>
          ))}
        </select>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-12 text-center">
          <Clock size={48} className="text-[#888888] mx-auto mb-4" />
          <h3 className="text-[#ffffff] font-semibold text-lg mb-2">No history entries</h3>
          <p className="text-[#888888] text-sm">
            {history.length === 0
              ? 'Scrape results will appear here once monitoring starts.'
              : 'No entries match the current filters.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-[#111111] border border-[#222222] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#222222]">
                    <th className="text-left text-xs font-medium text-[#888888] px-4 py-3 uppercase tracking-wider">
                      Shoe
                    </th>
                    <th className="text-left text-xs font-medium text-[#888888] px-4 py-3 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="text-left text-xs font-medium text-[#888888] px-4 py-3 uppercase tracking-wider">
                      Result
                    </th>
                    <th className="text-left text-xs font-medium text-[#888888] px-4 py-3 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="text-left text-xs font-medium text-[#888888] px-4 py-3 uppercase tracking-wider">
                      URL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222222]">
                  {filteredHistory.map((entry) => (
                    <tr key={entry.id} className={`${rowBg[entry.result] || ''} hover:bg-[#ffffff]/5 transition-colors`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-[#ffffff] truncate max-w-[200px]">
                          {entry.shoeName}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#888888] whitespace-nowrap">
                        {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={entry.result} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${entry.confidence}%`,
                                backgroundColor:
                                  entry.confidence >= 80
                                    ? '#00ff87'
                                    : entry.confidence >= 50
                                    ? '#eab308'
                                    : '#ef4444',
                              }}
                            />
                          </div>
                          <span className="text-xs text-[#888888]">{entry.confidence}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {entry.url && (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#888888] hover:text-[#00ff87] transition-colors"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filteredHistory.map((entry) => (
              <div
                key={entry.id}
                className={`bg-[#111111] border border-[#222222] rounded-xl p-4 space-y-2 ${rowBg[entry.result] || ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[#ffffff] truncate">{entry.shoeName}</p>
                  <StatusBadge status={entry.result} />
                </div>
                <div className="flex items-center justify-between text-xs text-[#888888]">
                  <span>{format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}</span>
                  <span>Confidence: {entry.confidence}%</span>
                </div>
                {entry.url && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#888888] hover:text-[#00ff87] truncate block transition-colors"
                  >
                    {entry.url}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
