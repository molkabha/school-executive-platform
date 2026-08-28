import axios from 'axios';
import { AICompletionOptions, AIProvider, AIProviderConfig } from './shared';

export class GeminiProvider implements AIProvider {
  readonly provider = 'gemini' as const;

  constructor(private readonly config: AIProviderConfig) {}

  async generateText(prompt: string, options: AICompletionOptions = {}): Promise<string> {
    const model = this.config.model || 'gemini-1.5-flash';
    // The model name is stored in the database and can be edited via Settings,
    // so it must be safely encoded before being placed into the request URL
    // path/query to avoid path traversal or query-string injection.
    const encodedModel = encodeURIComponent(model);
    const encodedApiKey = encodeURIComponent(this.config.apiKey);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodedApiKey}`;

    const response = await axios.post(
      url,
      {
        ...(options.systemPrompt
          ? {
              systemInstruction: {
                parts: [{ text: options.systemPrompt }],
              },
            }
          : {}),
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 1500,
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      { timeout: 30000 }
    );

    const candidate = response.data.candidates?.[0];
    return candidate?.content?.parts?.[0]?.text || '';
  }
}

