import type { VercelRequest, VercelResponse } from '@vercel/node';
import Together from 'together-ai';
import type { ReleaseInfo } from '../types.js';

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY! });
const RESEARCH_MODEL = 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { name } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: name' });
    }

    const completion = await together.chat.completions.create({
      model: RESEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a sneaker expert with deep knowledge of release dates, retail prices, and resale markets. Given a sneaker name, provide accurate release information. Return ONLY valid JSON with these exact fields:
{"name": "...", "releaseDate": "...", "retailers": ["..."], "retailPrice": "...", "estimatedResale": "...", "colorway": "..."}
If a field is unknown, use "Unknown" for strings and an empty array for retailers. Be as specific as possible with dates (YYYY-MM-DD format preferred) and prices (include $ sign).`,
        },
        {
          role: 'user',
          content: `Provide detailed release information for: ${name}`,
        },
      ],
      max_tokens: 512,
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? '{}';

    let releaseInfo: ReleaseInfo;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        releaseInfo = JSON.parse(jsonMatch[0]) as ReleaseInfo;
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      releaseInfo = {
        name,
        releaseDate: 'Unknown',
        retailers: [],
        retailPrice: 'Unknown',
        estimatedResale: 'Unknown',
        colorway: 'Unknown',
      };
    }

    return res.status(200).json({ success: true, data: releaseInfo });
  } catch (error) {
    console.error('Release search error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
