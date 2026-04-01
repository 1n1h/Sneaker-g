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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

const SCOUT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const RESEARCH_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const VISION_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';

// ─── Telegram helpers ────────────────────────────────────────────────

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  // Try with Markdown first, fall back to plain text if it fails
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    // Retry without parse_mode if Markdown fails
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}

async function downloadTelegramFile(fileId: string): Promise<string> {
  const fileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileData = (await fileRes.json()) as { result: { file_path: string } };
  const filePath = fileData.result.file_path;

  const downloadRes = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`
  );
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
    model: SCOUT_MODEL,
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

// ─── Release search (shared logic) ──────────────────────────────────

async function searchRelease(name: string): Promise<ReleaseInfo> {
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sneaker expert. Given a sneaker name, provide release information. Return ONLY valid JSON with these fields:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}
If unknown, use "Unknown" for strings and empty array for retailers.`,
      },
      { role: 'user', content: `Provide release info for: ${name}` },
    ],
    max_tokens: 512,
    temperature: 0.2,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ReleaseInfo;
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
  };
}

// ─── Image identification (shared logic) ─────────────────────────────

async function identifyShoe(base64Image: string): Promise<IdentifyResult> {
  const res = await together.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sneaker identification expert. Identify the sneaker in the image. Return ONLY valid JSON:
{"brand": "...", "model": "...", "colorway": "...", "year": "...", "confidence": 0.0}
confidence is 0-1. If unsure, set lower confidence.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify this sneaker.' },
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

async function handleAddToWatchlist(params: Record<string, string>): Promise<string> {
  const name = params.name ?? 'Unknown Shoe';
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
    imageUrl: null,
    notes: null,
  };

  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  watchlist.push(entry);
  await redis.set('watchlist', watchlist);

  return `\u2705 *Added to Watchlist!*\n\n\ud83d\udc5f *${name}*\n\ud83c\udfea Retailer: ${entry.retailer}\n\u23f0 Check every: ${entry.scrapeInterval} min\n\ud83d\udccc ID: \`${entry.id}\`\n\nI'll keep an eye on this for you!`;
}

async function handleRemoveFromWatchlist(params: Record<string, string>): Promise<string> {
  const name = (params.name ?? '').toLowerCase();
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  const idx = watchlist.findIndex((e) => e.name.toLowerCase().includes(name));

  if (idx === -1) {
    return `\u274c Could not find *${params.name}* in your watchlist.`;
  }

  const removed = watchlist.splice(idx, 1)[0];
  await redis.set('watchlist', watchlist);

  return `\ud83d\uddd1\ufe0f *Removed from Watchlist*\n\n\ud83d\udc5f ${removed.name}\n\nNo longer monitoring this shoe.`;
}

async function handleSearchRelease(params: Record<string, string>): Promise<string> {
  const name = params.name ?? 'Unknown';
  const info = await searchRelease(name);

  return `\ud83d\udd0d *Release Info: ${info.name}*\n\n\ud83d\udcc5 Release: ${info.releaseDate}\n\ud83c\udfa8 Colorway: ${info.colorway}\n\ud83d\udcb0 Retail: ${info.retailPrice}\n\ud83d\udcc8 Est. Resale: ${info.estimatedResale}\n\ud83c\udfea Retailers: ${info.retailers.length > 0 ? info.retailers.join(', ') : 'TBD'}`;
}

async function handleListWatchlist(): Promise<string> {
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];

  if (watchlist.length === 0) {
    return `\ud83d\udcad *Your watchlist is empty.*\n\nSend me a shoe name to start monitoring!`;
  }

  const lines = watchlist.map(
    (e, i) =>
      `${i + 1}. \ud83d\udc5f *${e.name}*\n   Status: ${e.status === 'monitoring' ? '\ud83d\udfe2' : e.status === 'found' ? '\ud83c\udf89' : '\u23f8\ufe0f'} ${e.status}\n   Last: ${e.lastResult ?? 'Not checked yet'}`
  );

  return `\ud83d\udccb *Your Watchlist (${watchlist.length})*\n\n${lines.join('\n\n')}`;
}

async function handleSetDelay(params: Record<string, string>): Promise<string> {
  const name = (params.name ?? '').toLowerCase();
  const interval = parseInt(params.interval ?? '30', 10);
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  const entry = watchlist.find((e) => e.name.toLowerCase().includes(name));

  if (!entry) {
    return `\u274c Could not find *${params.name}* in your watchlist.`;
  }

  entry.scrapeInterval = interval;
  await redis.set('watchlist', watchlist);

  return `\u23f0 *Interval Updated*\n\n\ud83d\udc5f ${entry.name}\n\u23f1\ufe0f New interval: every ${interval} min`;
}

async function handleCheckStatus(params: Record<string, string>): Promise<string> {
  const watchlist: WatchlistEntry[] = (await redis.get<WatchlistEntry[]>('watchlist')) ?? [];
  const monitoringStatus = (await redis.get<string>('monitoring_status')) ?? 'active';

  if (params.name) {
    const entry = watchlist.find((e) => e.name.toLowerCase().includes(params.name.toLowerCase()));
    if (!entry) return `\u274c Could not find *${params.name}*.`;

    return `\ud83d\udcca *Status: ${entry.name}*\n\n\ud83d\udfe2 Status: ${entry.status}\n\ud83d\udccb Last Result: ${entry.lastResult ?? 'N/A'}\n\ud83d\udd52 Last Checked: ${entry.lastChecked ?? 'Never'}\n\u23f0 Interval: ${entry.scrapeInterval} min`;
  }

  return `\ud83d\udcca *System Status*\n\n\ud83e\udd16 Monitoring: ${monitoringStatus === 'active' ? '\ud83d\udfe2 Active' : '\u23f8\ufe0f Paused'}\n\ud83d\udc5f Shoes tracked: ${watchlist.length}\n\ud83d\udfe2 Active: ${watchlist.filter((e) => e.status === 'monitoring').length}\n\u23f8\ufe0f Paused: ${watchlist.filter((e) => e.status === 'paused').length}`;
}

async function handleGetCalendar(): Promise<string> {
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a sneaker release calendar expert. List the most notable upcoming sneaker releases in the next 2 weeks. Return a concise list with name, date, and retail price. Format as plain text bullet points.',
      },
      { role: 'user', content: 'What are the upcoming sneaker releases?' },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const calendarText = res.choices?.[0]?.message?.content?.trim() ?? 'No upcoming releases found.';
  return `\ud83d\udcc6 *Upcoming Releases*\n\n${calendarText}`;
}

async function handlePauseMonitoring(): Promise<string> {
  await redis.set('monitoring_status', 'paused');
  return `\u23f8\ufe0f *Monitoring Paused*\n\nAll scraping has been paused. Send "resume" to restart.`;
}

async function handleResumeMonitoring(): Promise<string> {
  await redis.set('monitoring_status', 'active');
  return `\u25b6\ufe0f *Monitoring Resumed*\n\nScraping is back online! I'll keep checking your watchlist.`;
}

async function handleGeneralChat(text: string): Promise<string> {
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are Sneaker G, a friendly sneaker bot assistant. Keep responses concise and sneaker-themed. Use sneaker slang where appropriate.',
      },
      { role: 'user', content: text },
    ],
    max_tokens: 512,
    temperature: 0.7,
  });

  return res.choices?.[0]?.message?.content?.trim() ?? "Couldn't process that, fam. Try again!";
}

// ─── Image handler ───────────────────────────────────────────────────

async function handleImage(base64Image: string): Promise<string> {
  const identification = await identifyShoe(base64Image);
  const fullName = `${identification.brand} ${identification.model}`;
  const release = await searchRelease(fullName);

  return `\ud83d\udcf8 *Sneaker Identified!*\n\n\ud83d\udc5f Brand: ${identification.brand}\n\ud83d\udcdb Model: ${identification.model}\n\ud83c\udfa8 Colorway: ${identification.colorway}\n\ud83d\udcc5 Year: ${identification.year}\n\ud83c\udfaf Confidence: ${Math.round(identification.confidence * 100)}%\n\n\ud83d\udd0d *Release Info*\n\ud83d\udcc5 Release: ${release.releaseDate}\n\ud83d\udcb0 Retail: ${release.retailPrice}\n\ud83d\udcc8 Est. Resale: ${release.estimatedResale}\n\ud83c\udfa8 Colorway: ${release.colorway}\n\ud83c\udfea Retailers: ${release.retailers.length > 0 ? release.retailers.join(', ') : 'TBD'}`;
}

// ─── Main handler ────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    // Extract message from update
    const message = update?.message;
    if (!message) {
      return res.status(200).json({ success: true, data: 'No message in update' });
    }

    const chatId = String(message.chat?.id ?? TELEGRAM_CHAT_ID);

    // Handle photo messages
    if (message.photo && message.photo.length > 0) {
      // Get the highest resolution photo
      const photo = message.photo[message.photo.length - 1];
      const base64Image = await downloadTelegramFile(photo.file_id);
      const reply = await handleImage(base64Image);
      await sendTelegramMessage(chatId, reply);
      return res.status(200).json({ success: true, data: 'Image processed' });
    }

    // Handle text messages
    const text = message.text;
    if (!text) {
      return res.status(200).json({ success: true, data: 'No text in message' });
    }

    const parsed = await classifyIntent(text);
    let reply: string;

    switch (parsed.intent) {
      case 'add_to_watchlist':
        reply = await handleAddToWatchlist(parsed.params);
        break;
      case 'remove_from_watchlist':
        reply = await handleRemoveFromWatchlist(parsed.params);
        break;
      case 'search_release':
        reply = await handleSearchRelease(parsed.params);
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
    // Send error details to Telegram for debugging
    const chatId = req.body?.message?.chat?.id ?? TELEGRAM_CHAT_ID;
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
