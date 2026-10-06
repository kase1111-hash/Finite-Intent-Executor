# FIE Indexer Service

Off-chain semantic indexer for the Finite Intent Executor. It watches
`LexiconHolder` for `CorpusFrozen` events, fetches each frozen corpus from
IPFS or Arweave, verifies it against the on-chain keccak256 hash, and builds
an in-memory semantic index for the creator.

The service is strictly read-index-submit: it cannot execute, modify, or veto
any on-chain action. Results are pushed on-chain with
`ChainSubmitter.submitResolution()` (see `src/submitter.ts`), which requires
`INDEXER_ROLE` on `LexiconHolder`. The entry point currently indexes corpora
and logs them; it does not submit resolutions on its own.

## Run

```bash
cd indexer-service
npm install
npm run build
LEXICON_HOLDER_ADDRESS=0x... INDEXER_PRIVATE_KEY=0x... npm start
```

`npm run dev` runs the TypeScript sources directly with ts-node.

### Against a local chain

After `npm run node` and `npm run deploy` in the repository root, the
`LexiconHolder` address is in `deployments/localhost.json`, and account #0
(whose private key `npm run node` prints) holds `INDEXER_ROLE`:

```bash
LEXICON_HOLDER_ADDRESS=$(node -p "require('../deployments/localhost.json').contracts.LexiconHolder") \
INDEXER_PRIVATE_KEY=<account #0 key from the npm run node output> \
npm start
```

## Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `LEXICON_HOLDER_ADDRESS` | yes | | Deployed `LexiconHolder` contract |
| `INDEXER_PRIVATE_KEY` | yes | | Key of an account with `INDEXER_ROLE` |
| `RPC_URL` | no | `http://127.0.0.1:8545` | JSON-RPC endpoint |
| `IPFS_GATEWAY` | no | `https://ipfs.io/ipfs/` | Gateway for `ipfs://` URIs |
| `EMBEDDING_MODEL` | no | `mock` | `mock`, `tfidf`, or `openai` (also set `OPENAI_API_KEY`; `OPENAI_EMBEDDING_MODEL` defaults to `text-embedding-3-small`) |
| `POLL_INTERVAL_MS` | no | `30000` | Keep-alive interval |

## Corpus format

Newline-delimited UTF-8 text; each non-empty line is one chunk. The file's
keccak256 must equal the corpus hash frozen on-chain, which is what the
dashboard commits when it hashes the corpus you enter.
