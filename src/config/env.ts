import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = __dirname.includes('src');
const envPath = isDev 
  ? path.join(__dirname, '.env')
  : path.join(__dirname, '..', '..', 'src', 'config', '.env');

dotenv.config({ path: envPath });

export interface EnvConfig {
  BOT_TOKEN: string;
  PORT: number;
  VPS_API_URL: string;
  ADMINS: number[];
}

function getEnvConfig(): EnvConfig {
  const requiredEnvVars = ['BOT_TOKEN'];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const port = parseInt(process.env.PORT || '3000');
  const vpsApiUrl = normalizeApiUrl(process.env.VPS_API_URL, port);

  return {
    BOT_TOKEN: process.env.BOT_TOKEN!,
    PORT: port,
    VPS_API_URL: vpsApiUrl,
    ADMINS: process.env.ADMINS ? 
      process.env.ADMINS.split(',').map(id => parseInt(id.trim())) : []
  };
}

export const config = getEnvConfig();

function normalizeApiUrl(value: string | undefined, port: number): string {
  const fallbackUrl = `http://localhost:${port}`;
  const rawUrl = (value || fallbackUrl).trim();

  try {
    const url = new URL(rawUrl);

    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && !url.port) {
      url.port = String(port);
    }

    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid VPS_API_URL: ${rawUrl}`);
  }
}
