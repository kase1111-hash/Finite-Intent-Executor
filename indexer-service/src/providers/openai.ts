/**
 * OpenAI Embedding Provider
 *
 * Uses OpenAI's text-embedding API to produce dense semantic vectors.
 * Requires an API key (set OPENAI_API_KEY environment variable).
 *
 * Model: text-embedding-3-small (1536 dimensions, ~$0.02/1M tokens)
 *   - Best quality/cost ratio for semantic similarity tasks
 *   - Supports batching up to 2048 inputs per request
 *
 * This provider produces truly semantic embeddings — "license the music" and
 * "permit the songs" will score as highly similar even though they share no
 * words.
 */

import { EmbeddingProvider } from "../types";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  /**
   * @param apiKey  - OpenAI API key (required).
   * @param model   - Embedding model ID (default: text-embedding-3-small).
   * @param baseUrl - API base URL (default: https://api.openai.com/v1).
   */
  constructor(
    apiKey: string,
    model: string = "text-embedding-3-small",
    baseUrl: string = "https://api.openai.com/v1"
  ) {
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is required. Set OPENAI_API_KEY environment variable."
      );
    }
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async embed(text: string): Promise<number[]> {
    const vectors = await this.callEmbeddingAPI([text]);
    return vectors[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI supports up to 2048 inputs per request.
    const BATCH_SIZE = 2048;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const vectors = await this.callEmbeddingAPI(batch);
      results.push(...vectors);
    }

    return results;
  }

  /**
   * Cosine similarity (dot product for normalized OpenAI embeddings).
   * OpenAI embeddings are L2-normalized, so dot product = cosine similarity.
   */
  similarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  private async callEmbeddingAPI(input: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI embedding API error (${response.status}): ${errorBody}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to ensure output order matches input order.
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
