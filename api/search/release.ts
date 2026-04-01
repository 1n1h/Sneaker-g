import type { VercelRequest, VercelResponse } from '@vercel/node';
import Together from 'together-ai';
import type { ReleaseInfo } from '../types.js';

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });
const RESEARCH_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

const SNEAKER_SOURCES = [
  { name: 'SneakerNews', url: (q: string) => `https://sneakernews.com/?s=${encodeURIComponent(q)}` },
  { name: 'StockX', url: (q: string) => `https://stockx.com/search?s=${encodeURIComponent(q)}` },
  { name: 'GOAT', url: (q: string) => `https://www.goat.com/search?query=${encodeURIComponent(q)}` },
  { name: 'Google', url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q + ' sneaker release date retail price site:sneakernews.com OR site:solecollector.com OR site:hypebeast.com')}` },
];

interface ScrapeResult {
  text: string;
  sourceUrls: string[];
}

async function scrapeWebData(query: string): Promise<ScrapeResult> {
  const results: string[] = [];
  const sourceUrls: string[] = [];
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];

  const fetches = SNEAKER_SOURCES.map(async (source) => {
    const sourceUrl = source.url(query);
    try {
      const res = await fetch(sourceUrl, {
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { text: '', url: sourceUrl, name: source.name, ok: false };
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);
      return { text: `[Source: ${source.name}]\n${text}`, url: sourceUrl, name: source.name, ok: true };
    } catch {
      return { text: '', url: sourceUrl, name: source.name, ok: false };
    }
  });

  const scraped = await Promise.all(fetches);
  for (const item of scraped) {
    if (item.ok && item.text) {
      results.push(item.text);
      sourceUrls.push(item.url);
    }
  }

  return { text: results.join('\n\n---\n\n'), sourceUrls };
}

export async function searchReleaseInfo(name: string): Promise<ReleaseInfo> {
  const { text: webData, sourceUrls } = await scrapeWebData(name);

  const completion = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sneaker data extractor. You will be given REAL scraped web data about a sneaker. Extract ONLY factual information found in the provided data. Do NOT make up or guess any information.

Rules:
- ONLY use facts explicitly stated in the scraped data below
- If a specific piece of info is not found in the data, use "Unknown"
- For release dates, use exact dates found in the data (YYYY-MM-DD format)
- For prices, use exact prices found in the data (include $ sign)
- For resale, only include if you find actual market data
- Do NOT hallucinate or infer information not present in the data

Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}`,
      },
      {
        role: 'user',
        content: `Extract release info for "${name}" from this scraped web data:\n\n${webData || 'No web data could be retrieved. Return all fields as "Unknown".'}`,
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
