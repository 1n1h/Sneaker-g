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

async function identifyShoe(base64Image: string): Promise<IdentifyResult> {
  const res = await together.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sneaker identification expert. Analyze the image and identify the sneaker. Return ONLY valid JSON with these exact fields:
{"brand": "...", "model": "...", "colorway": "...", "year": "...", "confidence": 0.0}
confidence is a float from 0 to 1 indicating how sure you are. If you cannot identify the sneaker, set confidence below 0.3 and use "Unknown" for fields you cannot determine.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify this sneaker from the image.' },
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

async function searchRelease(name: string): Promise<ReleaseInfo> {
  const sourceUrls = [
    `https://www.google.com/search?q=${encodeURIComponent(name + ' release date retail price resale value')}`,
    `https://sneakernews.com/?s=${encodeURIComponent(name)}`,
  ];

  const fetchPage = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return '';
      const html = await res.text();
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
    } catch {
      return '';
    }
  };

  const [googleText, sneakerNewsText] = await Promise.all(sourceUrls.map(fetchPage));
  const combinedText = `Google results:\n${googleText}\n\nSneakerNews results:\n${sneakerNewsText}`;

  try {
    const llmRes = await together.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a sneaker data extractor. ONLY extract information from the provided search data. Do NOT make up or hallucinate any data. Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}
If a field is not found in the data, use "Unknown" for strings and empty array for retailers. Use YYYY-MM-DD for dates and include $ for prices.`,
        },
        {
          role: 'user',
          content: `Extract release info for "${name}" ONLY from this search data. If information is not present, use "Unknown":\n\n${combinedText}`,
        },
      ],
      max_tokens: 512,
      temperature: 0,
    });

    const raw = llmRes.choices?.[0]?.message?.content?.trim() ?? '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ReleaseInfo;
      parsed.sourceUrls = sourceUrls;
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
    sourceUrls,
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

    // Step 1: Identify the shoe from the image
    const identification = await identifyShoe(image);

    // Step 2: Auto-search release info using identified name
    const fullName = `${identification.brand} ${identification.model}`;
    const release = await searchRelease(fullName);

    return res.status(200).json({
      success: true,
      data: {
        identification,
        release,
      },
    });
  } catch (error) {
    console.error('Image identify error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
