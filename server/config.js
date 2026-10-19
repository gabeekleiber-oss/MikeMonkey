// Loads configuration from process.env only. Secrets are never read from
// source files, never logged, and never sent to the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency). Real environment variables win.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadDotEnv(path.join(root, '.env'));

export const config = {
  port: Number(process.env.PORT || 8787),
  nvidia: {
    apiKey: process.env.NVIDIA_API_KEY || '',
    baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    modelCreative: process.env.NVIDIA_MODEL_CREATIVE || '',
    modelCode: process.env.NVIDIA_MODEL_CODE || '',
  },
};

export function hasNvidiaKey() {
  return config.nvidia.apiKey.length > 0;
}

// Safe-to-log view of the config: reports presence, never values.
export function describeConfig() {
  return {
    port: config.port,
    nvidiaKeyPresent: hasNvidiaKey(),
    nvidiaBaseUrl: config.nvidia.baseUrl,
    modelCreative: config.nvidia.modelCreative || '(unset)',
    modelCode: config.nvidia.modelCode || '(unset)',
  };
}
