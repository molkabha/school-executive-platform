import axios from 'axios';
import { AICompletionOptions, AIProvider, AIProviderConfig } from './shared';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProvider implements AIProvider {
  readonly provider: AIProviderConfig['provider'];

  constructor(private readonly config: AIProviderConfig) {
    this.provider = config.provider;
  }

  async generateText(prompt: string, options: AICompletionOptions = {}): Promise<string> {
    const baseUrl = this.config.baseUrl || DEFAULT_OPENAI_BASE_URL;
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1500,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        // This is the only provider with a user-configurable base URL, so it's
        // the only one that needs redirect protection: without this, the SSRF
        // sanitizer's checks on the initial host/IP can be bypassed by having
        // that (allowed) host respond with a 3xx to an internal/metadata
        // address, which axios would otherwise follow automatically.
        maxRedirects: 0,
      }
    );

    return response.data.choices?.[0]?.message?.content || '';
  }
}

