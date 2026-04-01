import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const vars = {
    TOGETHER_API_KEY: process.env.TOGETHER_API_KEY ? `set (${process.env.TOGETHER_API_KEY.slice(0, 8)}...)` : 'MISSING',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? `set (${process.env.TELEGRAM_BOT_TOKEN.slice(0, 8)}...)` : 'MISSING',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? 'MISSING',
    STORAGE_KV_REST_API_URL: process.env.STORAGE_KV_REST_API_URL ? 'set' : 'MISSING',
    STORAGE_KV_REST_API_TOKEN: process.env.STORAGE_KV_REST_API_TOKEN ? 'set' : 'MISSING',
  };
  return res.status(200).json(vars);
}
