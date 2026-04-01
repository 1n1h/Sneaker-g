import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { v4 as uuidv4 } from 'uuid';
import type { WatchlistEntry } from '../types.js';

const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL!,
  token: process.env.STORAGE_KV_REST_API_TOKEN!,
});

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

async function findShoeImage(name: string): Promise<string | null> {
  const sources = [
    `https://www.google.com/search?q=${encodeURIComponent(name + ' sneaker')}&tbm=isch`,
    `https://sneakernews.com/?s=${encodeURIComponent(name)}`,
    `https://stockx.com/search?s=${encodeURIComponent(name)}`,
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Try og:image first
      const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i)
        ?? html.match(/content="([^"]+)"\s+property="og:image"/i);
      if (ogMatch?.[1] && !ogMatch[1].includes('logo') && !ogMatch[1].includes('favicon')) {
        return ogMatch[1];
      }

      // Try product images with common sneaker image patterns
      const imgMatches = [...html.matchAll(/<img[^>]+src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)];
      const keywords = name.toLowerCase().split(' ').filter(w => w.length > 2);
      for (const match of imgMatches) {
        const src = match[1];
        const lower = src.toLowerCase();
        // Skip tiny icons, logos, tracking pixels
        if (lower.includes('logo') || lower.includes('icon') || lower.includes('1x1') || lower.includes('pixel')) continue;
        // Prefer images with shoe-related keywords or large product images
        if (keywords.some(k => lower.includes(k)) || lower.includes('product') || lower.includes('sneaker')) {
          return src;
        }
      }

      // Fallback: grab the first reasonably-sized image from SneakerNews/StockX
      if (url.includes('sneakernews') || url.includes('stockx')) {
        for (const match of imgMatches) {
          const src = match[1];
          if (!src.includes('logo') && !src.includes('icon') && !src.includes('avatar') && src.includes('http')) {
            return src;
          }
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

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

      // Auto-fetch image if none provided
      let finalImageUrl = imageUrl ?? null;
      if (!finalImageUrl) {
        finalImageUrl = await findShoeImage(name);
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
        imageUrl: finalImageUrl,
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
