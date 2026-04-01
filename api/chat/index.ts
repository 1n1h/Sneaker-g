import type { VercelRequest, VercelResponse } from '@vercel/node';
import Together from 'together-ai';
import { Redis } from '@upstash/redis';
import type { WatchlistEntry } from '../types.js';

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });
const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL!,
  token: process.env.STORAGE_KV_REST_API_TOKEN!,
});

const RESEARCH_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

async function fetchPage(url: string, maxChars = 3000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);
  } catch {
    return '';
  }
}

async function detectSearchIntent(message: string): Promise<{ isSearch: boolean; query: string }> {
  const searchPatterns = /^(search|find|look up|what is|when does|release date|price of|how much)\b/i;
  if (searchPatterns.test(message.trim())) {
    const query = message.replace(/^(search|find|look up|what is|when does|release date|price of|how much)\s*(for|of|is)?\s*/i, '').trim();
    return { isSearch: true, query: query || message };
  }
  return { isSearch: false, query: message };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { message } = req.body ?? {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing message' });
    }

    const { isSearch, query } = await detectSearchIntent(message);

    // If it looks like a search, scrape real data first
    let webContext = '';
    if (isSearch) {
      const sources = [
        `https://www.google.com/search?q=${encodeURIComponent(query + ' sneaker release date price site:sneakernews.com OR site:solecollector.com OR site:kicksonfire.com')}`,
        `https://sneakernews.com/?s=${encodeURIComponent(query)}`,
      ];
      const fetches = sources.map((url) => fetchPage(url));
      const results = await Promise.all(fetches);
      webContext = results.filter(Boolean).join('\n\n---\n\n');
    }

    // Check watchlist for context
    const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
    const watchlistContext = watchlist.length > 0
      ? `\nUser's watchlist: ${watchlist.map(w => w.name).join(', ')}`
      : '';

    const systemPrompt = `You are Sneaker G AI, a sneaker expert assistant. You help with sneaker releases, pricing, resale, and monitoring.

CRITICAL RULES:
- If web data is provided below, ONLY use facts from that data for specific claims (dates, prices, stock)
- Do NOT make up release dates, prices, or stock information
- If asked about specific releases and no web data is available, say you'd need to search for that
- You CAN discuss general sneaker culture, copping tips, resale strategy, and sneaker history
- Keep responses concise and helpful
- Use emojis sparingly for a clean look
${watchlistContext}
${webContext ? `\nReal web data (use ONLY this for factual claims):\n${webContext}` : ''}`;

    const completion = await together.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() ?? "Sorry, couldn't process that. Try again!";

    return res.status(200).json({ success: true, data: { reply } });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
