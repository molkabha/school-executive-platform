const DEV_API_URL = 'http://localhost:4000';

export function getApiUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (url && url.trim()) return url.trim();
  if (import.meta.env.DEV) return DEV_API_URL;

  // In production, if VITE_API_URL is missing, use the same origin as the frontend
  // (works when API is served from the same host). Logs a warning instead of crashing.
  console.warn(
    '[Config Warning] VITE_API_URL is not set. Falling back to window.location.origin. ' +
    'Set VITE_API_URL in your .env file for production.',
  );
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function allowCustomAiBaseUrl(): boolean {
  return import.meta.env.VITE_ALLOW_CUSTOM_AI_BASE_URL === 'true';
}

