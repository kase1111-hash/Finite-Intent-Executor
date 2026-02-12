/**
 * Embedding provider implementations.
 *
 * The indexer service treats embedding as a pluggable capability. This module
 * provides:
 *   - MockEmbeddingProvider: a simple bag-of-words vectorizer suitable for
 *     testing and local development (no external API calls).
 *   - createEmbeddingProvider: factory function that selects the provider
 *     based on a model identifier string.
 *
 * To add a real provider (e.g., OpenAI), implement the EmbeddingProvider
 * interface and register it in the factory function.
 */

import { EmbeddingProvider } from "./types";
import { TfIdfEmbeddingProvider } from "./providers/tfidf";
import { OpenAIEmbeddingProvider } from "./providers/openai";

// ---------------------------------------------------------------------------
// Mock provider (bag-of-words + cosine similarity)
// ---------------------------------------------------------------------------

/**
 * A trivial embedding provider that converts text into a sparse bag-of-words
 * vector. Useful for integration testing without a real model endpoint.
 *
 * How it works:
 *   1. Tokenize by splitting on non-alphanumeric characters and lowercasing.
 *   2. Build a global vocabulary of all tokens seen so far.
 *   3. Each text becomes a vector of token frequencies (TF), zero-padded to
 *      the current vocabulary size.
 *
 * Limitations:
 *   - Vocabulary grows monotonically; older embeddings have shorter vectors
 *     than newer ones. The similarity function handles mismatched lengths by
 *     treating missing dimensions as zero.
 *   - No semantic understanding -- purely lexical overlap.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  /** Shared vocabulary: token -> dimension index. */
  private vocabulary: Map<string, number> = new Map();

  /**
   * Tokenizes a string into lowercase alphanumeric tokens.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0);
  }

  /**
   * Ensures every token in the list is registered in the vocabulary.
   */
  private ensureVocabulary(tokens: string[]): void {
    for (const token of tokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    }
  }

  /**
   * Converts tokens into a term-frequency vector over the current vocabulary.
   */
  private toVector(tokens: string[]): number[] {
    const vec = new Array<number>(this.vocabulary.size).fill(0);
    for (const token of tokens) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        vec[idx] += 1;
      }
    }
    return vec;
  }

  async embed(text: string): Promise<number[]> {
    const tokens = this.tokenize(text);
    this.ensureVocabulary(tokens);
    return this.toVector(tokens);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // First pass: register all tokens so every vector shares the same
    // vocabulary snapshot.
    const tokenSets = texts.map((t) => this.tokenize(t));
    for (const tokens of tokenSets) {
      this.ensureVocabulary(tokens);
    }
    // Second pass: vectorize.
    return tokenSets.map((tokens) => this.toVector(tokens));
  }

  /**
   * Cosine similarity between two vectors.
   * Handles mismatched lengths by treating missing dimensions as zero.
   */
  similarity(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    if (len === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      const ai = i < a.length ? a[i] : 0;
      const bi = i < b.length ? b[i] : 0;
      dot += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dot / denom;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an embedding provider for the given model identifier.
 *
 * Supported models:
 *   - "mock": MockEmbeddingProvider (bag-of-words, no external dependencies)
 *
 * To add a real model (e.g., "openai:text-embedding-3-small"), add a case
 * here and implement the EmbeddingProvider interface.
 *
 * @param model - Model identifier string from configuration.
 * @returns An initialized EmbeddingProvider.
 * @throws If the model identifier is not recognized.
 */
export function createEmbeddingProvider(model: string): EmbeddingProvider {
  switch (model) {
    case "mock":
      return new MockEmbeddingProvider();

    case "tfidf":
      return new TfIdfEmbeddingProvider();

    case "openai":
      return new OpenAIEmbeddingProvider(
        process.env.OPENAI_API_KEY || "",
        process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
      );

    default:
      throw new Error(
        `Unknown embedding model: "${model}". ` +
          `Supported models: "mock", "tfidf", "openai". ` +
          `Implement the EmbeddingProvider interface to add custom models.`
      );
  }
}
