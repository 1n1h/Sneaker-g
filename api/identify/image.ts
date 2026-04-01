import type { VercelRequest, VercelResponse } from '@vercel/node';
import Together from 'together-ai';
import type { IdentifyResult, ReleaseInfo } from '../../src/types/index';

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });
const VISION_MODEL = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-Turbo';
const RESEARCH_MODEL = 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo';

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
  const res = await together.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sneaker expert. Given a sneaker name, provide release information. Return ONLY valid JSON:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}
If unknown, use "Unknown" for strings and empty array for retailers. Use YYYY-MM-DD for dates and include $ for prices.`,
      },
      {
        role: 'user',
        content: `Provide release info for: ${name}`,
      },
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
