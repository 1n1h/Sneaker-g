import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { v4 as uuidv4 } from 'uuid';
import type { WatchlistEntry } from '../types.js';

const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL!,
  token: process.env.STORAGE_KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ─── GET: return full watchlist ────────────────────────────────
    if (req.method === 'GET') {
      const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
      return res.status(200).json({ success: true, data: watchlist });
    }

    // ─── POST: add a shoe to watchlist ────────────────────────────
    if (req.method === 'POST') {
      const { name, url, retailer, scrapeInterval, imageUrl, notes } = req.body ?? {};

      if (!name) {
        return res.status(400).json({ success: false, error: 'Missing required field: name' });
      }

      const entry: WatchlistEntry = {
        id: uuidv4(),
        name,
        url: url ?? '',
        retailer: retailer ?? 'Unknown',
        scrapeInterval: scrapeInterval ?? 30,
        addedAt: new Date().toISOString(),
        lastChecked: null,
        status: 'monitoring',
        lastResult: null,
        imageUrl: imageUrl ?? null,
        notes: notes ?? null,
      };

      const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
      watchlist.push(entry);
      await redis.set('watchlist', watchlist);

      return res.status(201).json({ success: true, data: entry });
    }

    // ─── DELETE: remove a shoe by id ──────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing required field: id' });
      }

      const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
      const idx = watchlist.findIndex((e) => e.id === id);

      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Shoe not found in watchlist' });
      }

      const removed = watchlist.splice(idx, 1)[0];
      await redis.set('watchlist', watchlist);

      return res.status(200).json({ success: true, data: removed });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Watchlist API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
