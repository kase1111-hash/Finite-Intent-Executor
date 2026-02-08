/**
 * Corpus fetching and parsing.
 *
 * Frozen corpora are stored off-chain in decentralized storage (IPFS or
 * Arweave). This module:
 *   1. Resolves storage URIs ("ipfs://..." or "ar://...") to HTTP gateway URLs.
 *   2. Fetches the raw content.
 *   3. Verifies the content hash matches the on-chain commitment.
 *   4. Parses the content into text chunks for embedding.
 *
 * The corpus format is newline-delimited text: each non-empty line is treated
 * as one chunk. Future versions may support structured JSON corpora.
 */

import { createHash } from "crypto";
import { loadConfig } from "./config";

// ---------------------------------------------------------------------------
// URI resolution
// ---------------------------------------------------------------------------

/**
 * Converts a decentralized storage URI to an HTTP gateway URL.
 *
 * Supported schemes:
 *   - ipfs://<CID>       --> {IPFS_GATEWAY}<CID>
 *   - ar://<TX_ID>       --> https://arweave.net/<TX_ID>
 *
 * @param storageURI - The storage URI from the CorpusFrozen event.
 * @returns An HTTP(S) URL that can be fetched with a standard HTTP client.
 * @throws If the URI scheme is not recognized.
 */
export function resolveStorageURI(storageURI: string): string {
  if (storageURI.startsWith("ipfs://")) {
    const cid = storageURI.slice("ipfs://".length);
    const config = loadConfig();
    // Ensure the gateway URL ends with a slash before appending the CID.
    const gateway = config.ipfsGateway.endsWith("/")
      ? config.ipfsGateway
      : config.ipfsGateway + "/";
    return `${gateway}${cid}`;
  }

  if (storageURI.startsWith("ar://")) {
    const txId = storageURI.slice("ar://".length);
    return `https://arweave.net/${txId}`;
  }

  throw new Error(
    `Unsupported storage URI scheme: "${storageURI}". ` +
      `Expected "ipfs://..." or "ar://...".`
  );
}

// ---------------------------------------------------------------------------
// Hash verification
// ---------------------------------------------------------------------------

/**
 * Computes the keccak-256 hash of a buffer and returns it as a 0x-prefixed
 * hex string.
 *
 * Note: We use Node's built-in "sha3-256" which is standard Keccak-256
 * (the same algorithm used by Solidity's keccak256). If the Node.js build
 * does not support "sha3-256", we fall back to SHA-256 with a logged warning.
 */
function computeHash(data: Buffer): string {
  try {
    const hash = createHash("sha3-256").update(data).digest("hex");
    return "0x" + hash;
  } catch {
    // Fallback for environments without sha3 support.
    console.warn(
      "[corpus] sha3-256 not available, falling back to sha256. " +
        "Hash verification may not match on-chain keccak256."
    );
    const hash = createHash("sha256").update(data).digest("hex");
    return "0x" + hash;
  }
}

// ---------------------------------------------------------------------------
// Corpus fetching
// ---------------------------------------------------------------------------

/**
 * Fetches a corpus from decentralized storage, verifies its integrity against
 * the on-chain hash, and parses it into text chunks.
 *
 * @param storageURI   - Decentralized storage URI (ipfs://... or ar://...).
 * @param expectedHash - The keccak-256 hash committed on-chain (0x-prefixed).
 * @returns An array of text chunks (non-empty lines from the corpus).
 * @throws If the fetch fails, the hash does not match, or the corpus is empty.
 */
export async function fetchCorpus(
  storageURI: string,
  expectedHash: string
): Promise<string[]> {
  const url = resolveStorageURI(storageURI);

  console.log(`[corpus] Fetching corpus from ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[corpus] Failed to fetch corpus: HTTP ${response.status} ${response.statusText} (${url})`
    );
  }

  const raw = Buffer.from(await response.arrayBuffer());

  // Verify content integrity.
  const actualHash = computeHash(raw);
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error(
      `[corpus] Hash mismatch for ${storageURI}. ` +
        `Expected: ${expectedHash}, got: ${actualHash}. ` +
        `The corpus content may have been tampered with.`
    );
  }

  console.log(`[corpus] Hash verified: ${actualHash}`);

  // Parse into chunks: one chunk per non-empty line.
  const text = raw.toString("utf-8");
  const chunks = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (chunks.length === 0) {
    throw new Error(
      `[corpus] Corpus at ${storageURI} is empty after parsing.`
    );
  }

  console.log(`[corpus] Parsed ${chunks.length} chunks from corpus.`);
  return chunks;
}
