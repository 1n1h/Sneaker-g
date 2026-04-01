import type { VercelRequest, VercelResponse } from '@vercel/node';
import Together from 'together-ai';
import type { ReleaseInfo } from '../types.js';

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });
const RESEARCH_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

const SNEAKER_SOURCES = [
  { name: 'DuckDuckGo', url: (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q + ' sneaker release date retail price resale')}` },
  { name: 'SneakerNews', url: (q: string) => `https://sneakernews.com/?s=${encodeURIComponent(q)}` },
  { name: 'KicksOnFire', url: (q: string) => `https://www.kicksonfire.com/?s=${encodeURIComponent(q)}` },
  { name: 'NiceKicks', url: (q: string) => `https://nicekicks.com/?s=${encodeURIComponent(q)}` },
  { name: 'GOAT', url: (q: string) => `https://www.goat.com/search?query=${encodeURIComponent(q)}` },
];

async function scrapeWebData(query: string): Promise<{ text: string; sourceUrls: string[] }> {
  const results: string[] = [];
  const sourceUrls: string[] = [];

  const fetches = SNEAKER_SOURCES.map(async (source) => {
    const sourceUrl = source.url(query);
    try {
      const res = await fetch(sourceUrl, {
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);
      return { text: `[Source: ${source.name}]\n${text}`, url: sourceUrl };
    } catch {
      return null;
    }
  });

  const scraped = await Promise.all(fetches);
  for (const item of scraped) {
    if (item) {
      results.push(item.text);
      sourceUrls.push(item.url);
    }
  }

  return { text: results.join('\n\n---\n\n'), sourceUrls };
}

export async function searchReleaseInfo(name: string): Promise<ReleaseInfo> {
  const { text: webData, sourceUrls } = await scrapeWebData(name);
  const hasData = webData.length > 100;

  const completion = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: hasData
          ? `You are a sneaker data extractor. Extract factual information from the scraped web data provided. Prioritize data explicitly found in the text.
Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}`
          : `You are a sneaker expert. Provide your best known information about this shoe based on your training knowledge. Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}
Try to provide real data. Only use "Unknown" if you truly don't know.`,
      },
      {
        role: 'user',
        content: hasData
          ? `Extract release info for "${name}" from this data:\n\n${webData}`
          : `What are the release details for: ${name}`,
      },
    ],
    max_tokens: 512,
    temperature: 0,
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() ?? '{}';

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const info = JSON.parse(jsonMatch[0]) as ReleaseInfo;
      info.sourceUrls = sourceUrls;
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
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { name } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: name' });
    }

    const releaseInfo = await searchReleaseInfo(name);
    return res.status(200).json({ success: true, data: releaseInfo });
  } catch (error) {
    console.error('Release search error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
