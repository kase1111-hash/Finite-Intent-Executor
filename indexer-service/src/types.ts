/**
 * Core type definitions for the FIE Indexer Service.
 *
 * These types define the data shapes that flow through the indexing pipeline:
 *   CorpusFrozen event --> CorpusEntry --> fetch --> embed --> resolve --> submit
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * Represents a frozen corpus registered in LexiconHolder.
 * Emitted via the CorpusFrozen event when a creator finalizes their intent
 * corpus on-chain.
 */
export interface CorpusEntry {
  /** Address of the corpus creator (the intent principal). */
  creator: string;

  /** Keccak-256 hash of the corpus content, used for integrity verification. */
  corpusHash: string;

  /**
   * Decentralized storage URI where the corpus content lives.
   * Supported schemes: "ipfs://..." and "ar://..." (Arweave).
   */
  storageURI: string;

  /** First calendar year covered by this corpus (inclusive). */
  startYear: number;

  /** Last calendar year covered by this corpus (inclusive). */
  endYear: number;
}

/**
 * The result of embedding a single text chunk.
 */
export interface EmbeddingResult {
  /** The original text that was embedded. */
  text: string;

  /** Dense vector representation of the text. */
  vector: number[];
}

/**
 * Output of the semantic resolver: the top-K corpus citations that match a
 * query, along with per-citation confidence scores.
 */
export interface ResolutionResult {
  /**
   * Corpus text chunks selected as the most relevant citations.
   * Ordered from highest to lowest confidence.
   */
  citations: string[];

  /**
   * Confidence scores in [0, 1] corresponding to each citation.
   * confidences[i] is the score for citations[i].
   */
  confidences: number[];
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Pluggable embedding provider interface.
 *
 * Implementations can wrap any embedding model (OpenAI, Cohere, local ONNX,
 * etc.). The indexer service only depends on this interface, making the
 * embedding backend fully swappable.
 */
export interface EmbeddingProvider {
  /**
   * Embeds a single text string into a dense vector.
   * @param text - The text to embed.
   * @returns A dense float vector.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embeds multiple texts in a single call (for throughput).
   * Implementations may batch internally or simply loop over `embed`.
   * @param texts - Array of texts to embed.
   * @returns Array of dense float vectors, one per input text.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Computes the similarity between two embedding vectors.
   * Returns a value in [-1, 1] (cosine similarity).
   * @param a - First embedding vector.
   * @param b - Second embedding vector.
   */
  similarity(a: number[], b: number[]): number;
}
