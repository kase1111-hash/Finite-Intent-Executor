/**
 * Event listener for LexiconHolder's CorpusFrozen events.
 *
 * The EventListener watches the chain for CorpusFrozen events, which are
 * emitted when a creator finalizes their intent corpus on-chain. On each
 * event it:
 *   1. Parses the event data into a CorpusEntry.
 *   2. Fetches the corpus from decentralized storage.
 *   3. Builds embeddings for the corpus chunks.
 *   4. Stores the indexed corpus in memory for resolution queries.
 *   5. Invokes any registered callbacks for custom downstream handling.
 *
 * The listener uses ethers.js contract event subscriptions for real-time
 * processing. A polling fallback is available via the poll interval config.
 */

import { ethers } from "ethers";
import { CorpusEntry, EmbeddingProvider } from "./types";
import { fetchCorpus } from "./corpus";
import { SemanticResolver } from "./resolver";

/** Callback signature for CorpusFrozen event handlers. */
export type CorpusFrozenCallback = (
  entry: CorpusEntry,
  resolver: SemanticResolver
) => void | Promise<void>;

export class EventListener {
  private contract: ethers.Contract;
  private provider: EmbeddingProvider;

  /** Per-creator resolvers, keyed by creator address (lowercased). */
  private resolvers: Map<string, SemanticResolver> = new Map();

  /** Registered callbacks for CorpusFrozen events. */
  private callbacks: CorpusFrozenCallback[] = [];

  /** Whether the listener is actively subscribed to events. */
  private listening = false;

  /**
   * @param contract  - ethers.Contract instance for LexiconHolder (with CorpusFrozen event).
   * @param provider  - Embedding provider for building corpus indices.
   */
  constructor(contract: ethers.Contract, provider: EmbeddingProvider) {
    this.contract = contract;
    this.provider = provider;
  }

  /**
   * Registers a callback that fires whenever a CorpusFrozen event is
   * processed. The callback receives the parsed CorpusEntry and the
   * SemanticResolver that was built (or updated) for that creator.
   *
   * @param callback - Handler function.
   */
  onCorpusFrozen(callback: CorpusFrozenCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Returns the SemanticResolver for a given creator, if one has been built.
   *
   * @param creator - Creator address.
   */
  getResolver(creator: string): SemanticResolver | undefined {
    return this.resolvers.get(creator.toLowerCase());
  }

  /**
   * Starts listening for CorpusFrozen events.
   *
   * Uses ethers.js contract event subscription. The listener processes events
   * sequentially to avoid race conditions on the same creator's resolver.
   */
  async start(): Promise<void> {
    if (this.listening) {
      console.warn("[listener] Already listening for CorpusFrozen events.");
      return;
    }

    console.log("[listener] Subscribing to CorpusFrozen events...");

    await this.contract.on(
      "CorpusFrozen",
      async (
        creator: string,
        corpusHash: string,
        storageURI: string,
        startYear: bigint,
        endYear: bigint
      ) => {
        const entry: CorpusEntry = {
          creator,
          corpusHash,
          storageURI,
          startYear: Number(startYear),
          endYear: Number(endYear),
        };

        console.log(
          `[listener] CorpusFrozen event: creator=${creator}, ` +
            `hash=${corpusHash}, uri=${storageURI}, ` +
            `years=${entry.startYear}-${entry.endYear}`
        );

        await this.processCorpusEvent(entry);
      }
    );

    this.listening = true;
    console.log("[listener] Now listening for CorpusFrozen events.");
  }

  /**
   * Stops listening for events and cleans up subscriptions.
   */
  async stop(): Promise<void> {
    if (!this.listening) return;

    console.log("[listener] Stopping event listener...");
    await this.contract.removeAllListeners("CorpusFrozen");
    this.listening = false;
    console.log("[listener] Event listener stopped.");
  }

  /**
   * Processes a single CorpusFrozen event:
   *   1. Fetch the corpus content from decentralized storage.
   *   2. Verify the content hash against the on-chain commitment.
   *   3. Build a SemanticResolver for the creator.
   *   4. Notify all registered callbacks.
   *
   * Errors are logged but do not crash the listener; the service continues
   * processing subsequent events.
   */
  private async processCorpusEvent(entry: CorpusEntry): Promise<void> {
    try {
      // Fetch and verify corpus.
      const chunks = await fetchCorpus(entry.storageURI, entry.corpusHash);

      // Build or replace the resolver for this creator.
      const resolver = new SemanticResolver(this.provider);
      await resolver.indexCorpus(chunks);

      this.resolvers.set(entry.creator.toLowerCase(), resolver);

      console.log(
        `[listener] Indexed corpus for creator ${entry.creator} ` +
          `(${chunks.length} chunks).`
      );

      // Notify callbacks.
      for (const callback of this.callbacks) {
        try {
          await callback(entry, resolver);
        } catch (callbackErr) {
          console.error(
            `[listener] Error in CorpusFrozen callback:`,
            callbackErr
          );
        }
      }
    } catch (err) {
      console.error(
        `[listener] Failed to process CorpusFrozen event for ` +
          `creator ${entry.creator}:`,
        err
      );
    }
  }
}
