/**
 * Main entry point for the FIE Indexer Service.
 *
 * This service is an off-chain INDEXER for the Finite Intent Executor. It:
 *   1. Watches for CorpusFrozen events from the LexiconHolder contract.
 *   2. Fetches frozen corpus content from decentralized storage (IPFS/Arweave).
 *   3. Computes semantic embeddings for each corpus chunk.
 *   4. Submits resolution results on-chain via the INDEXER_ROLE.
 *
 * The service is strictly read-index-submit: it cannot execute, modify, or
 * veto any on-chain action.
 *
 * Usage:
 *   LEXICON_HOLDER_ADDRESS=0x... INDEXER_PRIVATE_KEY=0x... npm run dev
 */

import { ethers } from "ethers";
import { loadConfig } from "./config";
import { createEmbeddingProvider } from "./embeddings";
import { SemanticResolver } from "./resolver";
import { ChainSubmitter, LEXICON_HOLDER_ABI } from "./submitter";
import { EventListener } from "./listener";

async function main(): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. Load configuration
  // -----------------------------------------------------------------------
  const config = loadConfig();

  console.log("=".repeat(60));
  console.log("  FIE Indexer Service");
  console.log("=".repeat(60));
  console.log(`  RPC URL:          ${config.rpcUrl}`);
  console.log(`  LexiconHolder:    ${config.lexiconHolderAddress}`);
  console.log(`  IPFS Gateway:     ${config.ipfsGateway}`);
  console.log(`  Embedding Model:  ${config.embeddingModel}`);
  console.log(`  Poll Interval:    ${config.pollIntervalMs}ms`);
  console.log("=".repeat(60));

  // -----------------------------------------------------------------------
  // 2. Set up blockchain provider and signer
  // -----------------------------------------------------------------------
  const rpcProvider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.indexerPrivateKey, rpcProvider);

  const signerAddress = await signer.getAddress();
  console.log(`[main] Indexer wallet: ${signerAddress}`);

  // -----------------------------------------------------------------------
  // 3. Set up LexiconHolder contract
  // -----------------------------------------------------------------------
  const contract = new ethers.Contract(
    config.lexiconHolderAddress,
    LEXICON_HOLDER_ABI,
    signer
  );

  console.log(
    `[main] Connected to LexiconHolder at ${config.lexiconHolderAddress}`
  );

  // -----------------------------------------------------------------------
  // 4. Create embedding provider
  // -----------------------------------------------------------------------
  const embeddingProvider = createEmbeddingProvider(config.embeddingModel);
  console.log(
    `[main] Embedding provider initialized (model: ${config.embeddingModel})`
  );

  // -----------------------------------------------------------------------
  // 5. Create submitter
  // -----------------------------------------------------------------------
  const submitter = new ChainSubmitter(contract, signer);

  // -----------------------------------------------------------------------
  // 6. Create event listener and wire up the indexing pipeline
  // -----------------------------------------------------------------------
  const listener = new EventListener(contract, embeddingProvider);

  // When a corpus is frozen, the listener automatically fetches and indexes
  // it. This callback logs the result. In a production deployment this is
  // where you would trigger resolution queries or notify downstream systems.
  listener.onCorpusFrozen(async (entry, resolver) => {
    console.log(
      `[main] Corpus indexed for creator ${entry.creator} ` +
        `(${resolver.size} chunks, years ${entry.startYear}-${entry.endYear})`
    );

    // Example: the indexer could auto-resolve predefined queries here.
    // For now we just log that the corpus is ready for resolution.
    console.log(
      `[main] Resolver ready. Use submitter.submitResolution() to push ` +
        `results on-chain for creator ${entry.creator}.`
    );
  });

  // -----------------------------------------------------------------------
  // 7. Start the event listener
  // -----------------------------------------------------------------------
  await listener.start();

  console.log("[main] Indexer service is running. Waiting for events...");

  // -----------------------------------------------------------------------
  // 8. Graceful shutdown
  // -----------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[main] Received ${signal}. Shutting down gracefully...`);
    await listener.stop();
    console.log("[main] Indexer service stopped.");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Keep the process alive. The event listener runs asynchronously.
  // In Node.js, active event listeners on the provider's WebSocket or
  // polling connection keep the event loop alive. As a fallback, we use
  // a keep-alive interval.
  const keepAlive = setInterval(() => {
    // No-op; keeps the event loop active.
  }, config.pollIntervalMs);

  // Clean up the interval on shutdown.
  process.on("beforeExit", () => clearInterval(keepAlive));
}

// -------------------------------------------------------------------------
// Run
// -------------------------------------------------------------------------
main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
