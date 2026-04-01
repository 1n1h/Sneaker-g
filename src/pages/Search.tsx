import { useState } from 'react';
import { Search as SearchIcon, Loader2, Plus, Clock, X, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import { searchRelease, addToWatchlist } from '../lib/api';
import type { ReleaseInfo } from '../types';

const RECENT_SEARCHES_KEY = 'sneakerg_recent_searches';

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const searches = getRecentSearches().filter((s) => s !== query);
  searches.unshift(query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, 10)));
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<ReleaseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const data = await searchRelease(trimmed);
      setResult(data);
      saveRecentSearch(trimmed);
      setRecentSearches(getRecentSearches());
    } catch {
      setError('No results found or search failed. Try a different query.');
    } finally {
      setSearching(false);
    }
  }

  function handleRecentClick(term: string) {
    setQuery(term);
  }

  function clearRecentSearches() {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  }

  async function handleAddToWatchlist() {
    if (!result) return;
    setAddingToWatchlist(true);
    try {
      await addToWatchlist({
        name: result.name,
        url: '',
        retailer: result.retailers[0] || 'Unknown',
        scrapeInterval: 30,
      });
      toast.success(`Added "${result.name}" to watchlist`);
    } catch {
      toast.error('Failed to add to watchlist');
    } finally {
      setAddingToWatchlist(false);
    }
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-bold text-[#ffffff]">Release Search</h1>
        <p className="text-[#888888] text-sm mt-1">Search for sneaker release information</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="relative">
          <SearchIcon
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#888888]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any sneaker..."
            className="w-full bg-[#111111] border border-[#222222] rounded-xl pl-11 pr-4 py-4 text-[#ffffff] placeholder-[#888888] text-sm focus:outline-none focus:border-[#00ff87] transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="w-full sm:w-auto bg-[#00ff87] text-[#0a0a0a] font-semibold text-sm rounded-xl px-6 py-3 hover:bg-[#00ff87]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <SearchIcon size={16} />}
          Search Release Info
        </button>
      </form>

      {/* Recent Searches */}
      {recentSearches.length > 0 && !result && !searching && (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#888888] flex items-center gap-2">
              <Clock size={14} />
              Recent Searches
            </h3>
            <button
              onClick={clearRecentSearches}
              className="text-xs text-[#888888] hover:text-[#ef4444] transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term, i) => (
              <button
                key={i}
                onClick={() => handleRecentClick(term)}
                className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-1.5 text-xs text-[#ffffff] hover:border-[#00ff87] hover:text-[#00ff87] transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {searching && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-[#00ff87] mx-auto mb-3" />
            <p className="text-[#888888] text-sm">Searching real sources for release info...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-8 text-center">
          <X size={32} className="text-[#ef4444] mx-auto mb-3" />
          <p className="text-[#ffffff] font-medium mb-1">No Results</p>
          <p className="text-[#888888] text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-[#ffffff] break-words">{result.name}</h2>
              <p className="text-[#888888] text-sm mt-1">{result.colorway}</p>
            </div>
            <button
              onClick={handleAddToWatchlist}
              disabled={addingToWatchlist}
              className="w-full sm:w-auto bg-[#00ff87] text-[#0a0a0a] font-semibold text-sm rounded-lg px-4 py-2 hover:bg-[#00ff87]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 flex-shrink-0"
            >
              {addingToWatchlist ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Add to Watchlist
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-3 sm:p-4">
              <p className="text-[#888888] text-xs mb-1">Release Date</p>
              <p className="text-[#ffffff] font-semibold text-sm">{result.releaseDate || 'TBD'}</p>
            </div>
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-3 sm:p-4">
              <p className="text-[#888888] text-xs mb-1">Retail Price</p>
              <p className="text-[#ffffff] font-semibold text-sm">{result.retailPrice || 'N/A'}</p>
            </div>
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-3 sm:p-4">
              <p className="text-[#888888] text-xs mb-1">Est. Resale</p>
              <p className="text-[#00ff87] font-semibold text-sm">{result.estimatedResale || 'N/A'}</p>
            </div>
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-lg p-3 sm:p-4">
              <p className="text-[#888888] text-xs mb-1">Colorway</p>
              <p className="text-[#ffffff] font-semibold text-sm break-words">{result.colorway || 'N/A'}</p>
            </div>
          </div>

          {result.retailers && result.retailers.length > 0 && (
            <div>
              <p className="text-[#888888] text-xs mb-2">Available Retailers</p>
              <div className="flex flex-wrap gap-2">
                {result.retailers.map((r, i) => (
                  <span
                    key={i}
                    className="bg-[#0a0a0a] border border-[#222222] rounded-lg px-3 py-1.5 text-xs text-[#ffffff] flex items-center gap-1.5"
                  >
                    <ShoppingBag size={12} className="text-[#00ff87]" />
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.sourceUrls && result.sourceUrls.length > 0 && (
            <div>
              <p className="text-[#888888] text-xs mb-2">Sources</p>
              <div className="space-y-1">
                {result.sourceUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-[#888888] hover:text-[#00ff87] truncate transition-colors"
                  >
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !searching && !error && recentSearches.length === 0 && (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-8 sm:p-12 text-center">
          <SearchIcon size={48} className="text-[#888888] mx-auto mb-4" />
          <h3 className="text-[#ffffff] font-semibold text-lg mb-2">Search for sneaker releases</h3>
          <p className="text-[#888888] text-sm">
            Enter a shoe name to find release dates, retail prices, and resale estimates.
          </p>
        </div>
      )}
    </div>
  );
}
