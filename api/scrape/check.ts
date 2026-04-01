import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import Together from 'together-ai';
import { v4 as uuidv4 } from 'uuid';
import type { WatchlistEntry, ScrapeHistoryEntry } from '../types.js';

const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL!,
  token: process.env.STORAGE_KV_REST_API_TOKEN!,
});

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const RESEARCH_MODEL = 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function sendTelegramAlert(text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

async function scrapePage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    // Strip scripts/styles and extract text content, limit to first 4000 chars for AI analysis
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 4000);

    return cleaned;
  } catch (error) {
    console.error(`Scrape error for ${url}:`, error);
    return null;
  }
}

async function classifyAvailability(
  pageText: string,
  shoeName: string
): Promise<{ result: ScrapeHistoryEntry['result']; confidence: number }> {
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are analyzing a scraped sneaker product page to determine availability. Classify the product status and provide a confidence score. Return ONLY valid JSON:
{"result": "in_stock"|"coming_soon"|"sold_out"|"unknown", "confidence": 0.0}

Rules:
- "in_stock": Add to cart button present, size selection available, product clearly purchasable
- "coming_soon": Release date mentioned, notify me button, countdown, "launching soon"
- "sold_out": Sold out text, no sizes available, "currently unavailable"
- "unknown": Cannot determine from available text`,
      },
      {
        role: 'user',
        content: `Shoe: ${shoeName}\n\nPage content:\n${pageText}`,
      },
    ],
    max_tokens: 128,
    temperature: 0,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        result: parsed.result ?? 'unknown',
        confidence: parsed.confidence ?? 0,
      };
    }
  } catch {
    // fall through
  }
  return { result: 'unknown', confidence: 0 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Check if monitoring is paused
    const monitoringStatus = (await redis.get<string>('monitoring_status')) ?? 'active';
    if (monitoringStatus === 'paused') {
      return res.status(200).json({ success: true, data: 'Monitoring is paused' });
    }

    const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
    if (watchlist.length === 0) {
      return res.status(200).json({ success: true, data: 'Watchlist is empty' });
    }

    const now = new Date();
    const history: ScrapeHistoryEntry[] = (await redis.get<ScrapeHistoryEntry[]>('scrape_history')) ?? [];
    let updated = false;

    for (const shoe of watchlist) {
      // Skip paused shoes
      if (shoe.status === 'paused') continue;

      // Skip if no URL
      if (!shoe.url) continue;

      // Respect individual scrape interval
      if (shoe.lastChecked) {
        const lastChecked = new Date(shoe.lastChecked);
        const minutesSince = (now.getTime() - lastChecked.getTime()) / (1000 * 60);
        if (minutesSince < shoe.scrapeInterval) continue;
      }

      // Scrape the page
      const pageText = await scrapePage(shoe.url);

      let result: ScrapeHistoryEntry['result'];
      let confidence: number;

      if (!pageText) {
        result = 'blocked';
        confidence = 0;
      } else {
        const classification = await classifyAvailability(pageText, shoe.name);
        result = classification.result;
        confidence = classification.confidence;
      }

      // Log to scrape history
      const historyEntry: ScrapeHistoryEntry = {
        id: uuidv4(),
        shoeId: shoe.id,
        shoeName: shoe.name,
        timestamp: now.toISOString(),
        result,
        confidence,
        url: shoe.url,
      };
      history.push(historyEntry);

      // Update shoe in watchlist
      shoe.lastChecked = now.toISOString();
      if (result !== 'blocked') {
        shoe.lastResult = result as WatchlistEntry['lastResult'];
      }

      // If in stock, send alert and update status
      if (result === 'in_stock') {
        shoe.status = 'found';
        await sendTelegramAlert(
          `\ud83d\udea8\ud83d\udd25 *DROP ALERT!* \ud83d\udd25\ud83d\udea8\n\n\ud83d\udc5f *${shoe.name}*\n\ud83c\udfea Retailer: ${shoe.retailer}\n\ud83d\udcca Confidence: ${Math.round(confidence * 100)}%\n\ud83d\udd17 [BUY NOW](${shoe.url})\n\n\u26a1 GO GO GO!`
        );
      }

      updated = true;
    }

    if (updated) {
      await redis.set('watchlist', watchlist);
      // Keep history manageable: last 500 entries
      const trimmedHistory = history.slice(-500);
      await redis.set('scrape_history', trimmedHistory);
    }

    return res.status(200).json({
      success: true,
      data: { checked: watchlist.filter((s) => s.url && s.status !== 'paused').length },
    });
  } catch (error) {
    console.error('Scrape check error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
