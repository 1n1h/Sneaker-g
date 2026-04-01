export interface WatchlistEntry {
  id: string;
  name: string;
  url: string;
  retailer: string;
  scrapeInterval: number;
  addedAt: string;
  lastChecked: string | null;
  status: 'monitoring' | 'paused' | 'found';
  lastResult: 'in_stock' | 'coming_soon' | 'sold_out' | 'unknown' | null;
  imageUrl: string | null;
  notes: string | null;
}

export interface ScrapeHistoryEntry {
  id: string;
  shoeId: string;
  shoeName: string;
  timestamp: string;
  result: 'in_stock' | 'coming_soon' | 'sold_out' | 'unknown' | 'blocked';
  confidence: number;
  url: string;
}

export interface ReleaseInfo {
  name: string;
  releaseDate: string;
  retailers: string[];
  retailPrice: string;
  estimatedResale: string;
  colorway: string;
  sourceUrls?: string[];
}

export interface IdentifyResult {
  brand: string;
  model: string;
  colorway: string;
  year: string;
  confidence: number;
}

export type MonitoringStatus = 'active' | 'paused';
