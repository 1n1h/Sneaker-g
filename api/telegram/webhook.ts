import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import Together from 'together-ai';
import { v4 as uuidv4 } from 'uuid';
import type { WatchlistEntry, ReleaseInfo, IdentifyResult } from '../types.js';

const redis = new Redis({
  url: process.env.STORAGE_KV_REST_API_URL!,
  token: process.env.STORAGE_KV_REST_API_TOKEN!,
});

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });

const RESEARCH_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const VISION_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';

// ─── Telegram helpers ────────────────────────────────────────────────

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const result = await res.json();
  console.log('Telegram sendMessage result:', JSON.stringify(result));
  if (!result.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(result)}`);
  }
}

async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
    });
    const result = await res.json();
    console.log('Telegram sendPhoto result:', JSON.stringify(result));
    return result.ok === true;
  } catch {
    return false;
  }
}

async function downloadTelegramFile(fileId: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const fileData = (await fileRes.json()) as { result: { file_path: string } };
  const filePath = fileData.result.file_path;
  const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  return buffer.toString('base64');
}

// ─── Intent classification ───────────────────────────────────────────

type Intent =
  | 'add_to_watchlist'
  | 'remove_from_watchlist'
  | 'search_release'
  | 'list_watchlist'
  | 'set_delay'
  | 'check_status'
  | 'get_calendar'
  | 'pause_monitoring'
  | 'resume_monitoring'
  | 'general_chat';

interface ParsedIntent {
  intent: Intent;
  params: Record<string, string>;
}

async function classifyIntent(text: string): Promise<ParsedIntent> {
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an intent classifier for a sneaker monitoring bot. Classify the user message into exactly one intent and extract relevant parameters. Return ONLY valid JSON.

Intents:
- add_to_watchlist: user wants to monitor a shoe. Params: name, url (if provided), retailer (if provided), interval (minutes, default "30")
- remove_from_watchlist: user wants to stop monitoring. Params: name
- search_release: user wants release info about a shoe. Params: name
- list_watchlist: user wants to see their watchlist. No params.
- set_delay: user wants to change scrape interval. Params: name, interval
- check_status: user wants current status of a shoe or all shoes. Params: name (optional)
- get_calendar: user wants upcoming releases calendar. No params.
- pause_monitoring: user wants to pause all monitoring. No params.
- resume_monitoring: user wants to resume monitoring. No params.
- general_chat: anything else. No params.

Respond with: {"intent": "...", "params": {...}}`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 256,
    temperature: 0,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ParsedIntent;
  } catch {
    // fall through
  }
  return { intent: 'general_chat', params: {} };
}

// ─── Web scraping helpers ───────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchPage(url: string, maxChars = 3000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
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

function extractImageUrl(html: string, query: string): string | null {
  // Try to find an og:image or product image from raw HTML
  try {
    const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i)
      ?? html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogMatch?.[1] && !ogMatch[1].includes('logo') && !ogMatch[1].includes('favicon')) {
      return ogMatch[1];
    }
    // Try to find an image with the shoe name keywords in src or alt
    const keywords = query.toLowerCase().split(' ').filter(w => w.length > 2);
    const imgMatches = html.matchAll(/<img[^>]+src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
    for (const match of imgMatches) {
      const src = match[1];
      const lower = src.toLowerCase();
      if (keywords.some(k => lower.includes(k)) && !lower.includes('logo') && !lower.includes('icon')) {
        return src;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchPageWithImage(url: string, query: string, maxChars = 3000): Promise<{ text: string; imageUrl: string | null }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { text: '', imageUrl: null };
    const html = await res.text();
    const imageUrl = extractImageUrl(html, query);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);
    return { text, imageUrl };
  } catch {
    return { text: '', imageUrl: null };
  }
}

// ─── Release search (with real web scraping) ────────────────────────

interface SearchResult extends ReleaseInfo {
  imageUrl?: string | null;
}

async function searchRelease(name: string): Promise<SearchResult> {
  const sources = [
    { name: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(name + ' sneaker release date retail price site:sneakernews.com OR site:solecollector.com OR site:hypebeast.com OR site:kicksonfire.com')}` },
    { name: 'SneakerNews', url: `https://sneakernews.com/?s=${encodeURIComponent(name)}` },
    { name: 'StockX', url: `https://stockx.com/search?s=${encodeURIComponent(name)}` },
    { name: 'KicksOnFire', url: `https://www.kicksonfire.com/?s=${encodeURIComponent(name)}` },
    { name: 'NiceKicks', url: `https://nicekicks.com/?s=${encodeURIComponent(name)}` },
  ];

  const results: string[] = [];
  const sourceUrls: string[] = [];
  let imageUrl: string | null = null;

  const fetches = sources.map(async (source) => {
    const { text, imageUrl: img } = await fetchPageWithImage(source.url, name);
    if (text) {
      return { text: `[Source: ${source.name}]\n${text}`, url: source.url, imageUrl: img };
    }
    return null;
  });

  const scraped = await Promise.all(fetches);
  for (const item of scraped) {
    if (item) {
      results.push(item.text);
      sourceUrls.push(item.url);
      if (!imageUrl && item.imageUrl) imageUrl = item.imageUrl;
    }
  }

  const webData = results.join('\n\n---\n\n');

  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sneaker data extractor. Extract ONLY factual information from the scraped web data provided.

CRITICAL RULES:
- ONLY use facts explicitly stated in the scraped data
- If a specific piece of info is NOT found in the data, you MUST use "Unknown"
- Do NOT guess, infer, or make up ANY information
- For release dates, use exact dates found in the data
- For prices, use exact prices found in the data (include $ sign)
- For resale estimates, only include if actual market data is present
- If the scraped data is empty or irrelevant, return ALL fields as "Unknown"

Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}`,
      },
      { role: 'user', content: `Extract release info for "${name}" from this data:\n\n${webData || 'No data found. Return all fields as "Unknown".'}` },
    ],
    max_tokens: 512,
    temperature: 0,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const info = JSON.parse(jsonMatch[0]) as SearchResult;
      info.sourceUrls = sourceUrls;
      info.imageUrl = imageUrl;
      return info;
    }
  } catch {
    // fall through
  }
  return {
    name,
    releaseDate: 'Unknown',
    retailers: [],
    retailPrice: 'Unknown',
    estimatedResale: 'Unknown',
    colorway: 'Unknown',
    sourceUrls,
    imageUrl,
  };
}

// ─── Image identification ───────────────────────────────────────────

async function identifyShoe(base64Image: string, userMessage = ''): Promise<IdentifyResult> {
  const prompt = userMessage
    ? `${userMessage}. Also identify this sneaker shoe and return the result as JSON.`
    : 'Identify this sneaker shoe. Return ONLY valid JSON with: {"brand": "...", "model": "exact model name", "colorway": "...", "year": "...", "confidence": 0.0 to 1.0}';
  const res = await together.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt + '\nReturn ONLY valid JSON: {"brand": "...", "model": "...", "colorway": "...", "year": "...", "confidence": 0.0}' },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 512,
    temperature: 0,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as IdentifyResult;
  } catch {
    // fall through
  }
  return { brand: 'Unknown', model: 'Unknown', colorway: 'Unknown', year: 'Unknown', confidence: 0 };
}

// ─── Intent handlers ─────────────────────────────────────────────────

async function findShoeImage(name: string): Promise<string | null> {
  const sources = [
    `https://sneakernews.com/?s=${encodeURIComponent(name)}`,
    `https://stockx.com/search?s=${encodeURIComponent(name)}`,
    `https://www.google.com/search?q=${encodeURIComponent(name + ' sneaker')}&tbm=isch`,
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': randomUA(), 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Try og:image
      const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i)
        ?? html.match(/content="([^"]+)"\s+property="og:image"/i);
      if (ogMatch?.[1] && !ogMatch[1].includes('logo') && !ogMatch[1].includes('favicon')) {
        return ogMatch[1];
      }

      // Try product images
      const imgMatches = [...html.matchAll(/<img[^>]+src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)];
      const keywords = name.toLowerCase().split(' ').filter(w => w.length > 2);
      for (const match of imgMatches) {
        const src = match[1];
        const lower = src.toLowerCase();
        if (lower.includes('logo') || lower.includes('icon') || lower.includes('1x1')) continue;
        if (keywords.some(k => lower.includes(k)) || lower.includes('product') || lower.includes('sneaker')) {
          return src;
        }
      }

      // Fallback: first real image from sneaker sites
      if (url.includes('sneakernews') || url.includes('stockx')) {
        for (const match of imgMatches) {
          const src = match[1];
          if (!src.includes('logo') && !src.includes('icon') && !src.includes('avatar')) return src;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function handleAddToWatchlist(chatId: string, params: Record<string, string>): Promise<void> {
  const name = params.name ?? 'Unknown Shoe';

  // Scrape for an image
  const imageUrl = await findShoeImage(name);

  const entry: WatchlistEntry = {
    id: uuidv4(),
    name,
    url: params.url ?? '',
    retailer: params.retailer ?? 'Unknown',
    scrapeInterval: parseInt(params.interval ?? '30', 10),
    addedAt: new Date().toISOString(),
    lastChecked: null,
    status: 'monitoring',
    lastResult: null,
    imageUrl,
    notes: null,
  };

  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  watchlist.push(entry);
  await redis.set('watchlist', watchlist);

  const caption = `✅ Added to Watchlist!\n\n👟 ${name}\n🏪 Retailer: ${entry.retailer}\n⏰ Check every: ${entry.scrapeInterval} min\n📌 ID: ${entry.id}\n\nI'll keep an eye on this for you!`;

  // Send with image if found
  if (imageUrl) {
    const sent = await sendTelegramPhoto(chatId, imageUrl, caption);
    if (sent) return;
  }

  await sendTelegramMessage(chatId, caption);
}

async function handleRemoveFromWatchlist(params: Record<string, string>): Promise<string> {
  const name = (params.name ?? '').toLowerCase();
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  const idx = watchlist.findIndex((e) => e.name.toLowerCase().includes(name));

  if (idx === -1) {
    return `❌ Could not find "${params.name}" in your watchlist.`;
  }

  const removed = watchlist.splice(idx, 1)[0];
  await redis.set('watchlist', watchlist);

  return `🗑️ Removed from Watchlist\n\n👟 ${removed.name}\n\nNo longer monitoring this shoe.`;
}

async function handleSearchRelease(chatId: string, params: Record<string, string>): Promise<void> {
  const name = params.name ?? 'Unknown';
  const info = await searchRelease(name);

  const caption = [
    `🔍 Release Info - Sneaker G`,
    `──────────────────`,
    `👟 ${info.name}`,
    `📅 Release: ${info.releaseDate}`,
    `🎨 Colorway: ${info.colorway}`,
    `💰 Retail: ${info.retailPrice}`,
    `📈 Est. Resale: ${info.estimatedResale}`,
    `🏪 Retailers: ${info.retailers.length > 0 ? info.retailers.join(', ') : 'TBD'}`,
    `──────────────────`,
  ].join('\n');

  let sourcesText = '';
  if (info.sourceUrls && info.sourceUrls.length > 0) {
    sourcesText = '\n\n🔗 Sources:\n' + info.sourceUrls.join('\n');
  }

  // Try to send with image first
  if (info.imageUrl) {
    const photoSent = await sendTelegramPhoto(chatId, info.imageUrl, caption + sourcesText);
    if (photoSent) return;
  }

  // Fall back to text-only
  await sendTelegramMessage(chatId, caption + sourcesText);
}

async function handleListWatchlist(): Promise<string> {
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];

  if (watchlist.length === 0) {
    return `📭 Your watchlist is empty.\n\nSend me a shoe name to start monitoring!`;
  }

  const lines = watchlist.map(
    (e, i) =>
      `${i + 1}. 👟 ${e.name}\n   Status: ${e.status === 'monitoring' ? '🟢' : e.status === 'found' ? '🎉' : '⏸️'} ${e.status}\n   Last: ${e.lastResult ?? 'Not checked yet'}`
  );

  return `📋 Your Watchlist (${watchlist.length})\n\n${lines.join('\n\n')}`;
}

async function handleSetDelay(params: Record<string, string>): Promise<string> {
  const name = (params.name ?? '').toLowerCase();
  const interval = parseInt(params.interval ?? '30', 10);
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  const entry = watchlist.find((e) => e.name.toLowerCase().includes(name));

  if (!entry) {
    return `❌ Could not find "${params.name}" in your watchlist.`;
  }

  entry.scrapeInterval = interval;
  await redis.set('watchlist', watchlist);

  return `⏰ Interval Updated\n\n👟 ${entry.name}\n⏱️ New interval: every ${interval} min`;
}

async function handleCheckStatus(params: Record<string, string>): Promise<string> {
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  const monitoringStatus = (await redis.get<string>('monitoring_status')) ?? 'active';

  if (params.name) {
    const entry = watchlist.find((e) => e.name.toLowerCase().includes(params.name.toLowerCase()));
    if (!entry) return `❌ Could not find "${params.name}".`;

    return `📊 Status: ${entry.name}\n\n🟢 Status: ${entry.status}\n📋 Last Result: ${entry.lastResult ?? 'N/A'}\n🕒 Last Checked: ${entry.lastChecked ?? 'Never'}\n⏰ Interval: ${entry.scrapeInterval} min`;
  }

  return `📊 System Status\n\n🤖 Monitoring: ${monitoringStatus === 'active' ? '🟢 Active' : '⏸️ Paused'}\n👟 Shoes tracked: ${watchlist.length}\n🟢 Active: ${watchlist.filter((e) => e.status === 'monitoring').length}\n⏸️ Paused: ${watchlist.filter((e) => e.status === 'paused').length}`;
}

async function parseSneakerNewsCalendar(): Promise<string[]> {
  // Directly parse structured HTML from SneakerNews release calendar
  try {
    const res = await fetch('https://sneakernews.com/release-dates/', {
      headers: { 'User-Agent': randomUA(), 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const releases: string[] = [];
    // Extract product entries: name from prod-name class, date from nearby date fields, price from prod-price
    // Pattern: each release card has a prod-name link and associated date/price
    const entryPattern = /class="prod-name"[^>]*href="[^"]*">([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>(?:[\s\S]*?class="[^"]*price[^"]*"[^>]*>\$?([\d,.]+))?/gi;

    let match;
    while ((match = entryPattern.exec(html)) !== null && releases.length < 30) {
      const name = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      const date = match[2].trim();
      const price = match[3] ? `$${match[3].trim()}` : '';
      releases.push(price ? `• ${date} — ${name} — ${price}` : `• ${date} — ${name}`);
    }

    // Fallback: simpler extraction if regex above didn't match
    if (releases.length === 0) {
      // Extract all prod-names with their associated dates from nearby HTML
      const nameMatches = [...html.matchAll(/class="prod-name"[^>]*>([^<]+)</g)];
      const dateMatches = [...html.matchAll(/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{0,4})/gi)];
      const priceMatches = [...html.matchAll(/\$(\d{2,4})/g)];

      const count = Math.min(nameMatches.length, dateMatches.length, 20);
      for (let i = 0; i < count; i++) {
        const name = nameMatches[i][1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
        const date = dateMatches[i][1].trim();
        const price = priceMatches[i] ? `$${priceMatches[i][1]}` : '';
        releases.push(price ? `• ${date} — ${name} — ${price}` : `• ${date} — ${name}`);
      }
    }

    return releases;
  } catch {
    return [];
  }
}

async function handleGetCalendar(): Promise<string> {
  // Parse SneakerNews calendar directly (structured HTML)
  const snReleases = await parseSneakerNewsCalendar();

  // Also scrape other sources for additional data
  const otherSources = [
    { name: 'SoleCollector', url: 'https://solecollector.com/sneaker-release-dates' },
    { name: 'KicksOnFire', url: 'https://www.kicksonfire.com/release-dates/' },
    { name: 'NiceKicks', url: 'https://nicekicks.com/sneaker-release-dates/' },
  ];

  let extraData = '';
  const fetches = otherSources.map(async (source) => {
    const text = await fetchPage(source.url, 8000);
    return text ? `[Source: ${source.name}]\n${text}` : '';
  });
  const scraped = await Promise.all(fetches);
  extraData = scraped.filter(Boolean).join('\n\n---\n\n');

  const today = new Date().toISOString().slice(0, 10);

  // If we got structured data from SneakerNews, use it directly + supplement from other sources
  let calendarText: string;

  if (snReleases.length > 0) {
    // Filter to upcoming only (this week / next 14 days) using LLM since dates vary in format
    const res = await together.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a date filter. Today is ${today}. You will be given a list of sneaker releases with dates. Return ONLY the releases that fall within the next 14 days from today. Keep the exact format of each line. If none fall within that window, return the next 10 upcoming releases regardless of date. Do NOT add, modify, or invent any entries.`,
        },
        {
          role: 'user',
          content: `Filter these releases to upcoming ones:\n\n${snReleases.join('\n')}${extraData ? '\n\nAdditional data from other sources (extract any releases with dates not already listed):\n' + extraData : ''}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0,
    });
    calendarText = res.choices?.[0]?.message?.content?.trim() ?? snReleases.slice(0, 10).join('\n');
  } else {
    // Fallback to LLM extraction from other sources
    const res = await together.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a sneaker release calendar extractor. Today is ${today}.

CRITICAL RULES:
- ONLY list releases EXPLICITLY mentioned in the data with specific dates
- Do NOT make up ANY releases
- Format as: "• [Date] — [Shoe Name] — [Price if available]"
- If no releases found, say "Could not extract releases. Check the sources below."`,
        },
        { role: 'user', content: `Extract releases:\n\n${extraData || 'No data found.'}` },
      ],
      max_tokens: 1024,
      temperature: 0,
    });
    calendarText = res.choices?.[0]?.message?.content?.trim() ?? 'Could not retrieve release calendar.';
  }

  return `📆 Upcoming Releases - Sneaker G\n──────────────────\n${calendarText}\n──────────────────\n\n🔗 Sources:\nhttps://sneakernews.com/release-dates/\nhttps://solecollector.com/sneaker-release-dates\nhttps://nicekicks.com/sneaker-release-dates/`;
}

async function handlePauseMonitoring(): Promise<string> {
  await redis.set('monitoring_status', 'paused');
  return `⏸️ Monitoring Paused\n\nAll scraping has been paused. Send "resume" to restart.`;
}

async function handleResumeMonitoring(): Promise<string> {
  await redis.set('monitoring_status', 'active');
  return `▶️ Monitoring Resumed\n\nScraping is back online! I'll keep checking your watchlist.`;
}

async function handleGeneralChat(text: string): Promise<string> {
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are Sneaker G, a friendly sneaker bot assistant. Keep responses concise and sneaker-themed.

CRITICAL RULES:
- Do NOT make up specific release dates, prices, stock status, or any factual claims
- If the user asks about specific releases, dates, or prices, tell them to use "search [shoe name]" for real data
- If the user asks about upcoming releases, tell them to say "upcoming releases" or "calendar" for scraped data
- You CAN discuss general sneaker culture, tips on copping, reselling advice, and sneaker history
- Be honest when you don't know something`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 512,
    temperature: 0.7,
  });

  return res.choices?.[0]?.message?.content?.trim() ?? "Couldn't process that, fam. Try again!";
}

// ─── Image handler ───────────────────────────────────────────────────

async function handleImageMessage(chatId: string, base64Image: string, userMessage = ''): Promise<void> {
  const identification = await identifyShoe(base64Image, userMessage);
  const fullName = `${identification.brand} ${identification.model}`;
  const release = await searchRelease(fullName);

  const caption = [
    `👁️ Sneaker Identified - Sneaker G`,
    `──────────────────`,
    `👟 ${identification.brand} ${identification.model}`,
    `🎨 Colorway: ${identification.colorway}`,
    `📅 Year: ${identification.year}`,
    `🎯 Confidence: ${Math.round(identification.confidence * 100)}%`,
    ``,
    `🔍 Release Info`,
    `📅 Release: ${release.releaseDate}`,
    `💰 Retail: ${release.retailPrice}`,
    `📈 Est. Resale: ${release.estimatedResale}`,
    `🏪 Retailers: ${release.retailers.length > 0 ? release.retailers.join(', ') : 'TBD'}`,
    `──────────────────`,
    `Reply "add ${fullName}" to monitor`,
  ].join('\n');

  // Try sending with a product image if found
  if (release.imageUrl) {
    const sent = await sendTelegramPhoto(chatId, release.imageUrl, caption);
    if (sent) return;
  }

  await sendTelegramMessage(chatId, caption);
}

// ─── Main handler ────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) {
      return res.status(200).json({ success: true, data: 'No message in update' });
    }

    const chatId = String(message.chat?.id ?? process.env.TELEGRAM_CHAT_ID!);

    // Handle photo messages (with optional caption/question)
    if (message.photo && message.photo.length > 0) {
      const photo = message.photo[message.photo.length - 1];
      const userCaption = message.caption || '';
      await sendTelegramMessage(chatId, '🔍 Analyzing image... this may take a moment.');
      const base64Image = await downloadTelegramFile(photo.file_id);
      await handleImageMessage(chatId, base64Image, userCaption);
      return res.status(200).json({ success: true, data: 'Image processed' });
    }

    // Handle text messages
    const text = message.text;
    if (!text) {
      return res.status(200).json({ success: true, data: 'No text in message' });
    }

    const parsed = await classifyIntent(text);

    // These intents send messages themselves (for photo support)
    if (parsed.intent === 'search_release') {
      await handleSearchRelease(chatId, parsed.params);
      return res.status(200).json({ success: true, data: 'Message processed' });
    }
    if (parsed.intent === 'add_to_watchlist') {
      await handleAddToWatchlist(chatId, parsed.params);
      return res.status(200).json({ success: true, data: 'Message processed' });
    }

    let reply: string;
    switch (parsed.intent) {
      case 'remove_from_watchlist':
        reply = await handleRemoveFromWatchlist(parsed.params);
        break;
      case 'list_watchlist':
        reply = await handleListWatchlist();
        break;
      case 'set_delay':
        reply = await handleSetDelay(parsed.params);
        break;
      case 'check_status':
        reply = await handleCheckStatus(parsed.params);
        break;
      case 'get_calendar':
        reply = await handleGetCalendar();
        break;
      case 'pause_monitoring':
        reply = await handlePauseMonitoring();
        break;
      case 'resume_monitoring':
        reply = await handleResumeMonitoring();
        break;
      case 'general_chat':
      default:
        reply = await handleGeneralChat(text);
        break;
    }

    await sendTelegramMessage(chatId, reply);
    return res.status(200).json({ success: true, data: 'Message processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    const chatId = req.body?.message?.chat?.id ?? process.env.TELEGRAM_CHAT_ID!;
    const errMsg = error instanceof Error ? error.message : String(error);
    try {
      await sendTelegramMessage(String(chatId), `⚠️ Bot error: ${errMsg}`);
    } catch {
      // ignore send failure
    }
    return res.status(200).json({ success: false, error: 'Internal error' });
  }
}

// ─── Webhook Registration ────────────────────────────────────────────
// To register this webhook with Telegram, make a GET request to:
// https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/api/telegram/webhook
