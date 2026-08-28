export type AIProviderName = 'openai' | 'gemini' | 'claude' | 'groq';

export interface AIProviderConfig {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AICompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface AIProvider {
  readonly provider: AIProviderName;
  generateText(prompt: string, options?: AICompletionOptions): Promise<string>;
}

export interface AIConnectionResult {
  connected: boolean;
  message?: string;
  error?: string;
}

export const DEFAULT_AI_MODELS: Record<AIProviderName, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  claude: 'claude-3-5-haiku-20241022',
  groq: 'llama-3.3-70b-versatile',
};

export const PROVIDER_ENV_KEYS: Record<AIProviderName, { apiKey: string; model: string }> = {
  openai: { apiKey: 'OPENAI_API_KEY', model: 'OPENAI_MODEL' },
  gemini: { apiKey: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
  claude: { apiKey: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL' },
  groq: { apiKey: 'GROQ_API_KEY', model: 'GROQ_MODEL' },
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function normalizeProviderName(value?: string | null): AIProviderName | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'openai' || normalized === 'gemini' || normalized === 'claude' || normalized === 'groq') {
    return normalized;
  }
  return null;
}

export function getDefaultModel(provider: AIProviderName): string {
  return DEFAULT_AI_MODELS[provider];
}

export function getProviderLabel(provider: AIProviderName): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'gemini':
      return 'Gemini';
    case 'claude':
      return 'Claude';
    case 'groq':
      return 'Groq';
  }
}

// Blocks a hostname/IP that is (or resolves to) a private, loopback, link-local,
// unique-local, or cloud-metadata address. Operates on parsed IP bytes rather than
// string prefixes, so it isn't fooled by octal/hex/decimal IP encodings once the
// address has actually been resolved.
function isBlockedIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 0) return true; // "this network"
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local (fc00::/7)
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — re-check the embedded IPv4 address
    const mapped = lower.replace('::ffff:', '');
    return isBlockedIp(mapped);
  }
  return false;
}

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// `knownDefault` lets callers (e.g. the Groq provider, which is also
// OpenAI-compatible and routed through this same sanitizer) pass their own
// trusted default base URL through without requiring ALLOW_CUSTOM_AI_BASE_URL.
// Any OTHER value — including a Groq-labeled request pointing somewhere else
// — still goes through the full SSRF check below. Previously Groq's base URL
// bypassed this function entirely, which meant the SSRF protections (private
// IP / metadata-address / DNS-rebinding checks) did not apply to it at all.
export async function sanitizeOpenAIBaseUrl(baseUrl?: string, knownDefault: string = DEFAULT_OPENAI_BASE_URL): Promise<string | undefined> {
  if (!baseUrl) return undefined;

  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  if (trimmed === DEFAULT_OPENAI_BASE_URL || trimmed === DEFAULT_GROQ_BASE_URL) return trimmed;
  if (trimmed === knownDefault) return trimmed;

  if (process.env.ALLOW_CUSTOM_AI_BASE_URL !== 'true') {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost') return undefined;

    // Reject if the literal hostname is itself a blocked IP (fast path, also
    // catches the case where DNS lookup below is bypassable in test envs).
    if (isBlockedIp(host)) return undefined;

    // Resolve the hostname and check every returned address. This is what
    // actually stops decimal/octal/hex IP encodings and DNS-rebinding style
    // bypasses: an attacker-controlled domain that currently resolves to a
    // public IP but flips to 169.254.169.254 (or similar) at request time.
    const dns = await import('node:dns/promises');
    let addresses: string[];
    try {
      const results = await dns.lookup(host, { all: true, verbatim: true });
      addresses = results.map((r) => r.address);
    } catch {
      // Could not resolve — fail closed rather than letting an unresolvable
      // or malformed host through.
      return undefined;
    }
    if (addresses.length === 0 || addresses.some(isBlockedIp)) {
      return undefined;
    }

    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

export function getEnvApiKey(provider: AIProviderName): string {
  return process.env[PROVIDER_ENV_KEYS[provider].apiKey] || '';
}

export function getEnvModel(provider: AIProviderName): string | undefined {
  return process.env.AI_MODEL || process.env[PROVIDER_ENV_KEYS[provider].model] || undefined;
}

export function isAuthFailure(error: any): boolean {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

export function isRateLimitFailure(error: any): boolean {
  return error?.response?.status === 429;
}

