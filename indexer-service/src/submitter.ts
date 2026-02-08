/**
 * On-chain submission module.
 *
 * The ChainSubmitter sends semantic resolution results back to the
 * LexiconHolder contract. It calls `submitResolution` (single) or
 * `submitResolutionBatch` (multiple queries) using a wallet that holds
 * the INDEXER_ROLE.
 *
 * Important: this service is strictly an INDEXER. It submits semantic index
 * data (citations + confidence scores). It cannot execute, modify, or veto
 * any on-chain action.
 */

import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// LexiconHolder ABI (minimal, only the functions/events the indexer needs)
// ---------------------------------------------------------------------------

/**
 * Minimal ABI for LexiconHolder contract interaction.
 *
 * Includes:
 *   - submitResolution:      submit a single query resolution
 *   - submitResolutionBatch: submit resolutions for multiple queries at once
 *   - CorpusFrozen event:    emitted when a corpus is finalized on-chain
 */
export const LEXICON_HOLDER_ABI = [
  // -- Write functions (INDEXER_ROLE required) --
  "function submitResolution(address creator, string query, string[] citations, uint256[] confidences) external",
  "function submitResolutionBatch(address creator, string[] queries, string[][] citationsArray, uint256[][] confidencesArray) external",

  // -- Events --
  "event CorpusFrozen(address indexed creator, bytes32 corpusHash, string storageURI, uint256 startYear, uint256 endYear)",
];

// ---------------------------------------------------------------------------
// ChainSubmitter
// ---------------------------------------------------------------------------

export class ChainSubmitter {
  private contract: ethers.Contract;
  private signer: ethers.Signer;

  /**
   * @param contract - An ethers.Contract instance connected to LexiconHolder.
   * @param signer   - The signer with INDEXER_ROLE permissions.
   */
  constructor(contract: ethers.Contract, signer: ethers.Signer) {
    this.contract = contract;
    this.signer = signer;
  }

  /**
   * Submits a single resolution result on-chain.
   *
   * Confidence scores are converted from floating-point [0, 1] to fixed-point
   * basis points [0, 10000] for on-chain storage (1 = 0.01%).
   *
   * @param creator      - Address of the corpus creator.
   * @param query        - The query that was resolved.
   * @param citations    - Array of cited corpus chunks.
   * @param confidences  - Array of confidence scores in [0, 1].
   */
  async submitResolution(
    creator: string,
    query: string,
    citations: string[],
    confidences: number[]
  ): Promise<void> {
    if (citations.length !== confidences.length) {
      throw new Error(
        `[submitter] citations.length (${citations.length}) !== confidences.length (${confidences.length})`
      );
    }

    // Convert float confidences to basis points (uint256 on-chain).
    const bpConfidences = confidences.map((c) =>
      BigInt(Math.round(Math.max(0, Math.min(1, c)) * 10000))
    );

    console.log(
      `[submitter] Submitting resolution for creator=${creator}, query="${query}" ` +
        `(${citations.length} citations)`
    );

    const tx = await this.contract.submitResolution(
      creator,
      query,
      citations,
      bpConfidences
    );
    const receipt = await tx.wait();

    console.log(
      `[submitter] Resolution submitted in tx ${receipt.hash} (block ${receipt.blockNumber})`
    );
  }

  /**
   * Submits resolution results for multiple queries in a single transaction.
   *
   * More gas-efficient than calling submitResolution repeatedly when there
   * are several queries to resolve against the same corpus.
   *
   * @param creator          - Address of the corpus creator.
   * @param queries          - Array of queries.
   * @param citationsArray   - Array of citation arrays, one per query.
   * @param confidencesArray - Array of confidence arrays, one per query.
   */
  async submitResolutionBatch(
    creator: string,
    queries: string[],
    citationsArray: string[][],
    confidencesArray: number[][]
  ): Promise<void> {
    if (
      queries.length !== citationsArray.length ||
      queries.length !== confidencesArray.length
    ) {
      throw new Error(
        `[submitter] Array length mismatch: queries=${queries.length}, ` +
          `citationsArray=${citationsArray.length}, ` +
          `confidencesArray=${confidencesArray.length}`
      );
    }

    // Convert all confidence arrays to basis points.
    const bpConfidencesArray = confidencesArray.map((confs) =>
      confs.map((c) =>
        BigInt(Math.round(Math.max(0, Math.min(1, c)) * 10000))
      )
    );

    console.log(
      `[submitter] Submitting batch resolution for creator=${creator} ` +
        `(${queries.length} queries)`
    );

    const tx = await this.contract.submitResolutionBatch(
      creator,
      queries,
      citationsArray,
      bpConfidencesArray
    );
    const receipt = await tx.wait();

    console.log(
      `[submitter] Batch resolution submitted in tx ${receipt.hash} (block ${receipt.blockNumber})`
    );
  }
}
