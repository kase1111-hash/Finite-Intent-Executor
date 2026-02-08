/**
 * Semantic resolution engine.
 *
 * The SemanticResolver builds an in-memory embedding index over a corpus and
 * answers queries by finding the nearest corpus chunks via cosine similarity.
 *
 * This is a read-only indexing operation: the resolver never executes, modifies,
 * or vetoes any on-chain action. It only produces citation references and
 * confidence scores that are submitted back to LexiconHolder as semantic
 * index entries.
 *
 * Pipeline:
 *   1. indexCorpus(chunks) -- embed every chunk and store the vectors.
 *   2. resolve(query, topK) -- embed the query, rank chunks by similarity,
 *      return the top-K citations with confidence scores.
 */

import { EmbeddingProvider, EmbeddingResult, ResolutionResult } from "./types";

export class SemanticResolver {
  private provider: EmbeddingProvider;

  /** Indexed corpus entries: text + precomputed embedding vector. */
  private index: EmbeddingResult[] = [];

  /**
   * @param provider - The embedding provider to use for vectorization.
   */
  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
  }

  /**
   * Whether the resolver currently holds an indexed corpus.
   */
  get isIndexed(): boolean {
    return this.index.length > 0;
  }

  /**
   * Number of chunks in the current index.
   */
  get size(): number {
    return this.index.length;
  }

  /**
   * Clears the current index. Call this before re-indexing a new corpus.
   */
  clear(): void {
    this.index = [];
  }

  /**
   * Builds the embedding index for a set of corpus text chunks.
   *
   * This replaces any previously indexed corpus. For large corpora the batch
   * embed call is used so providers can optimize throughput.
   *
   * @param chunks - Array of text chunks to index.
   * @throws If chunks is empty.
   */
  async indexCorpus(chunks: string[]): Promise<void> {
    if (chunks.length === 0) {
      throw new Error("[resolver] Cannot index an empty corpus.");
    }

    console.log(`[resolver] Indexing ${chunks.length} corpus chunks...`);

    const vectors = await this.provider.embedBatch(chunks);

    this.index = chunks.map((text, i) => ({
      text,
      vector: vectors[i],
    }));

    console.log(`[resolver] Index built with ${this.index.length} entries.`);
  }

  /**
   * Resolves a query against the indexed corpus.
   *
   * Computes the embedding for the query text and ranks all corpus chunks by
   * cosine similarity. Returns the top-K chunks as citations along with their
   * similarity scores as confidence values.
   *
   * @param query - The natural-language query to resolve.
   * @param topK  - Maximum number of citations to return (default 5).
   * @returns ResolutionResult with ordered citations and confidence scores.
   * @throws If the corpus has not been indexed yet.
   */
  async resolve(query: string, topK: number = 5): Promise<ResolutionResult> {
    if (this.index.length === 0) {
      throw new Error(
        "[resolver] No corpus indexed. Call indexCorpus() first."
      );
    }

    const queryVector = await this.provider.embed(query);

    // Score every indexed chunk against the query.
    const scored = this.index.map((entry) => ({
      text: entry.text,
      score: this.provider.similarity(queryVector, entry.vector),
    }));

    // Sort by descending similarity.
    scored.sort((a, b) => b.score - a.score);

    // Take the top-K results.
    const top = scored.slice(0, Math.min(topK, scored.length));

    // Clamp confidence scores to [0, 1]. Cosine similarity can technically be
    // negative, but negative scores indicate no semantic relevance.
    const citations = top.map((s) => s.text);
    const confidences = top.map((s) => Math.max(0, Math.min(1, s.score)));

    return { citations, confidences };
  }
}
