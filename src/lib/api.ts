import axios from 'axios';
import type { WatchlistEntry, ReleaseInfo, IdentifyResult, ScrapeHistoryEntry } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const { data } = await api.get<ApiResponse<WatchlistEntry[]>>('/watchlist');
  return data.data ?? [];
}

export async function addToWatchlist(entry: {
  name: string;
  url: string;
  retailer: string;
  scrapeInterval: number;
  notes?: string;
}): Promise<WatchlistEntry> {
  const { data } = await api.post<ApiResponse<WatchlistEntry>>('/watchlist', entry);
  return data.data!;
}

export async function removeFromWatchlist(id: string): Promise<void> {
  await api.delete('/watchlist', { data: { id } });
}

export async function updateWatchlistEntry(
  id: string,
  updates: Partial<Pick<WatchlistEntry, 'scrapeInterval' | 'status' | 'notes'>>
): Promise<WatchlistEntry> {
  const { data } = await api.patch<ApiResponse<WatchlistEntry>>(`/watchlist/${id}`, updates);
  return data.data!;
}

export async function updateMonitoringStatus(status: 'active' | 'paused'): Promise<void> {
  await api.post('/watchlist/status', { status });
}

export async function searchRelease(name: string): Promise<ReleaseInfo> {
  const { data } = await api.post<ApiResponse<ReleaseInfo>>('/search/release', { name });
  return data.data!;
}

export async function identifyImage(base64: string): Promise<IdentifyResult & { release?: ReleaseInfo }> {
  const { data } = await api.post<ApiResponse<{ identification: IdentifyResult; release: ReleaseInfo }>>('/identify/image', { image: base64 });
  return { ...data.data!.identification, release: data.data!.release };
}

export async function getHistory(): Promise<ScrapeHistoryEntry[]> {
  const { data } = await api.get<ApiResponse<ScrapeHistoryEntry[]>>('/history');
  return data.data ?? [];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(message: string): Promise<string> {
  const { data } = await api.post<ApiResponse<{ reply: string }>>('/chat', { message });
  return data.data?.reply ?? 'No response';
}
