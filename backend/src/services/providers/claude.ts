import axios from 'axios';
import { AICompletionOptions, AIProvider, AIProviderConfig } from './shared';

export class ClaudeProvider implements AIProvider {
  readonly provider = 'claude' as const;

  constructor(private readonly config: AIProviderConfig) {}

  async generateText(prompt: string, options: AICompletionOptions = {}): Promise<string> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.config.model || 'claude-3-5-haiku-20241022',
        max_tokens: options.maxTokens ?? 1500,
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
        ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
      },
      {
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return response.data.content?.[0]?.text || '';
  }
}

