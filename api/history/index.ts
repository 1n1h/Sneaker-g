import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import type { ScrapeHistoryEntry } from '../types.js';

const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL!,
  token: process.env.STORAGE_KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const history: ScrapeHistoryEntry[] = (await redis.get<ScrapeHistoryEntry[]>('scrape_history')) ?? [];
    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
