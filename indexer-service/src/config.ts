/**
 * Configuration module for the FIE Indexer Service.
 *
 * All configuration is loaded from environment variables with sensible defaults
 * for local development. In production, LEXICON_HOLDER_ADDRESS and
 * INDEXER_PRIVATE_KEY must be set explicitly.
 */

export interface Config {
  /** JSON-RPC endpoint for the target chain. */
  rpcUrl: string;

  /** Deployed address of the LexiconHolder contract. */
  lexiconHolderAddress: string;

  /** Private key for the wallet that holds INDEXER_ROLE on LexiconHolder. */
  indexerPrivateKey: string;

  /** Base URL for the IPFS HTTP gateway (must include trailing slash). */
  ipfsGateway: string;

  /**
   * Identifier for the embedding model to use.
   * "mock" selects the built-in bag-of-words provider (useful for testing).
   */
  embeddingModel: string;

  /** Polling interval in milliseconds for fallback block scanning. */
  pollIntervalMs: number;
}

/**
 * Reads a required environment variable. Throws with a clear message if the
 * variable is missing and no default is provided.
 */
function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it before starting the indexer service.`
    );
  }
  return value;
}

/**
 * Loads configuration from environment variables.
 *
 * Required:
 *   LEXICON_HOLDER_ADDRESS  - deployed contract address
 *   INDEXER_PRIVATE_KEY     - hex-encoded private key (with or without 0x prefix)
 *
 * Optional (with defaults):
 *   RPC_URL            - default http://127.0.0.1:8545
 *   IPFS_GATEWAY       - default https://ipfs.io/ipfs/
 *   EMBEDDING_MODEL    - default "mock"
 *   POLL_INTERVAL_MS   - default 30000
 */
export function loadConfig(): Config {
  const pollRaw = process.env.POLL_INTERVAL_MS ?? "30000";
  const pollIntervalMs = Number(pollRaw);
  if (Number.isNaN(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(
      `POLL_INTERVAL_MS must be a positive integer, got "${pollRaw}"`
    );
  }

  return {
    rpcUrl: requireEnv("RPC_URL", "http://127.0.0.1:8545"),
    lexiconHolderAddress: requireEnv("LEXICON_HOLDER_ADDRESS"),
    indexerPrivateKey: requireEnv("INDEXER_PRIVATE_KEY"),
    ipfsGateway: requireEnv("IPFS_GATEWAY", "https://ipfs.io/ipfs/"),
    embeddingModel: requireEnv("EMBEDDING_MODEL", "mock"),
    pollIntervalMs,
  };
}
