import { AIProvider, AIProviderConfig, AIProviderName } from './shared';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'groq':
      // Groq is OpenAI-compatible; reuse OpenAIProvider with Groq base URL
      return new OpenAIProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'claude':
      return new ClaudeProvider(config);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unsupported AI provider: ${_exhaustive as AIProviderName}`);
    }
  }
}

