import type { VercelRequest, VercelResponse } from '@vercel/node';
import Together from 'together-ai';
import type { IdentifyResult, ReleaseInfo } from '../types.js';

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });
const VISION_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';
const RESEARCH_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function cleanBase64(input: string): string {
  // Strip data URL prefix if present, return raw base64
  return input.replace(/^data:image\/[^;]+;base64,/, '');
}

async function identifyShoe(rawImage: string): Promise<IdentifyResult> {
  const base64 = cleanBase64(rawImage);
  const res = await together.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Identify this sneaker shoe. Return ONLY valid JSON with these fields: {"brand": "Nike/Adidas/etc", "model": "exact model name", "colorway": "color description", "year": "release year", "confidence": 0.0 to 1.0}. Be specific with the model name.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` },
          },
        ],
      },
    ],
    max_tokens: 512,
    temperature: 0,
  });

  const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
  console.log('Vision model raw response:', raw);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as IdentifyResult;
  } catch {
    // fall through
  }
  return { brand: 'Unknown', model: 'Unknown', colorway: 'Unknown', year: 'Unknown', confidence: 0 };
}

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

async function searchRelease(name: string): Promise<ReleaseInfo> {
  const sources = [
    `https://www.google.com/search?q=${encodeURIComponent(name + ' sneaker release date retail price resale value')}`,
    `https://sneakernews.com/?s=${encodeURIComponent(name)}`,
    `https://stockx.com/search?s=${encodeURIComponent(name)}`,
  ];

  const results = await Promise.all(sources.map((url) => fetchPage(url)));
  const webData = results.filter(Boolean).map((t, i) => `[Source ${i + 1}]\n${t}`).join('\n\n---\n\n');

  try {
    const llmRes = await together.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a sneaker data extractor. Extract ONLY factual information from the scraped web data. Do NOT make up or guess anything. If info is not found, use "Unknown".
Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}`,
        },
        {
          role: 'user',
          content: `Extract release info for "${name}" from this data:\n\n${webData || 'No data. Return all as Unknown.'}`,
        },
      ],
      max_tokens: 512,
      temperature: 0,
    });

    const raw = llmRes.choices?.[0]?.message?.content?.trim() ?? '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ReleaseInfo;
      parsed.sourceUrls = sources;
      return parsed;
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
    sourceUrls: sources,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { image } = req.body ?? {};

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: image (base64 string)' });
    }

    const identification = await identifyShoe(image);
    const fullName = `${identification.brand} ${identification.model}`;
    const release = await searchRelease(fullName);

    return res.status(200).json({
      success: true,
      data: { identification, release },
    });
  } catch (error) {
    console.error('Image identify error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ success: false, error: errMsg });
  }
}
