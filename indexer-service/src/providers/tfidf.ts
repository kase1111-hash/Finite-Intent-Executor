/**
 * TF-IDF Embedding Provider
 *
 * Produces term-frequency inverse-document-frequency weighted vectors.
 * Significantly better than raw bag-of-words because common words ("the",
 * "is", "a") are downweighted while distinctive terms ("license", "music",
 * "streaming") are amplified.
 *
 * No external dependencies. Runs locally and deterministically.
 *
 * Limitations:
 *   - Still lexical, not truly semantic (synonyms like "permit" and "license"
 *     won't match unless both appear in the corpus).
 *   - IDF statistics come from registered documents; call registerDocuments()
 *     with the corpus before embedding queries.
 *   - Suitable for proof-of-concept and CI tests. Use OpenAI or
 *     sentence-transformers for production deployments.
 */

import { EmbeddingProvider } from "../types";

/** Common English stop words excluded from vectorization. */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "that", "this", "these",
  "those", "it", "its", "i", "me", "my", "we", "our", "you", "your",
  "he", "him", "his", "she", "her", "they", "them", "their", "what",
  "which", "who", "whom", "about", "up", "also", "like", "many",
]);

export class TfIdfEmbeddingProvider implements EmbeddingProvider {
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private documentCount = 0;

  /**
   * Tokenizes text into lowercase alphanumeric stems, excluding stop words
   * and single-character tokens.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  }

  /** Adds tokens to the global vocabulary if not already present. */
  private ensureVocabulary(tokens: string[]): void {
    for (const token of tokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    }
  }

  /** Builds a TF vector normalized by document length. */
  private toTfVector(tokens: string[]): number[] {
    const vec = new Array<number>(this.vocabulary.size).fill(0);
    for (const token of tokens) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        vec[idx] += 1;
      }
    }
    // Normalize by document length to avoid bias toward long documents.
    const len = tokens.length || 1;
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= len;
    }
    return vec;
  }

  /** Applies IDF weighting to a TF vector. */
  private applyIdf(tfVec: number[]): number[] {
    const result = new Array<number>(tfVec.length).fill(0);
    for (const [token, idx] of this.vocabulary.entries()) {
      if (idx < tfVec.length && tfVec[idx] > 0) {
        const df = this.documentFrequency.get(token) || 1;
        // Smoothed IDF: log((N+1)/(df+1)) + 1
        const idf = Math.log((this.documentCount + 1) / (df + 1)) + 1;
        result[idx] = tfVec[idx] * idf;
      }
    }
    return result;
  }

  /**
   * Registers a batch of documents to build IDF statistics.
   *
   * Call this with the corpus chunks BEFORE embedding queries so that IDF
   * weights are meaningful. If called multiple times, IDF statistics
   * accumulate across all calls.
   */
  registerDocuments(texts: string[]): void {
    for (const text of texts) {
      const tokens = this.tokenize(text);
      this.ensureVocabulary(tokens);
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        this.documentFrequency.set(
          token,
          (this.documentFrequency.get(token) || 0) + 1
        );
      }
      this.documentCount++;
    }
  }

  async embed(text: string): Promise<number[]> {
    const tokens = this.tokenize(text);
    this.ensureVocabulary(tokens);
    const tf = this.toTfVector(tokens);
    return this.applyIdf(tf);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // First pass: register all tokens so every vector shares the same
    // vocabulary snapshot.
    const tokenSets = texts.map((t) => this.tokenize(t));
    for (const tokens of tokenSets) {
      this.ensureVocabulary(tokens);
    }
    // Second pass: vectorize with TF-IDF.
    return tokenSets.map((tokens) => {
      const tf = this.toTfVector(tokens);
      return this.applyIdf(tf);
    });
  }

  /**
   * Cosine similarity between two TF-IDF vectors.
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
