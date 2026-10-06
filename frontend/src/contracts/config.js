// ABIs are generated from the compiled contracts by `npm run export-abis`
// (repository root). Never hand-edit them: a hand-written ABI that drifts from
// the contract fails silently at runtime.
export { CONTRACT_ABIS } from './abis'

export const CONTRACT_NAMES = [
  'IntentCaptureModule',
  'TriggerMechanism',
  'ExecutionAgent',
  'LexiconHolder',
  'SunsetProtocol',
  'IPToken',
]

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Contract addresses from environment variables (see frontend/.env.example).
// These take precedence over a local deployment.
const ENV_ADDRESSES = {
  IntentCaptureModule: import.meta.env.VITE_INTENT_MODULE_ADDRESS,
  TriggerMechanism: import.meta.env.VITE_TRIGGER_MECHANISM_ADDRESS,
  ExecutionAgent: import.meta.env.VITE_EXECUTION_AGENT_ADDRESS,
  LexiconHolder: import.meta.env.VITE_LEXICON_HOLDER_ADDRESS,
  SunsetProtocol: import.meta.env.VITE_SUNSET_PROTOCOL_ADDRESS,
  IPToken: import.meta.env.VITE_IP_TOKEN_ADDRESS,
}

// Addresses written by `npm run deploy` (scripts/deploy.js), not committed.
// A bare dynamic import fails the production build when the file is absent:
// Rollup resolves dynamic imports at build time, so the runtime .catch() never
// runs, and top-level await is not available in the configured browser target.
// import.meta.glob with `eager` resolves statically to an empty map when the
// file is missing, so a fresh clone builds and falls back to the env vars.
const deployedModules = import.meta.glob('./deployedAddresses.js', { eager: true })
const deployedModule = deployedModules['./deployedAddresses.js']
const DEPLOYED_ADDRESSES = deployedModule?.DEPLOYED_ADDRESSES ?? {}
const DEPLOYED_NETWORK = deployedModule?.DEPLOYED_NETWORK ?? null

/**
 * Returns the configured address for a contract, or null if none is set.
 * Environment variables win over the generated deployedAddresses.js.
 */
export const getContractAddress = (contractName) => {
  const envAddress = ENV_ADDRESSES[contractName]
  if (envAddress && envAddress !== ZERO_ADDRESS) {
    return envAddress
  }
  return DEPLOYED_ADDRESSES[contractName] || null
}

// Network configuration
// [Audit fix: I-6] RPC URL must come from environment — no hardcoded fallback
// for real networks. The local development account (see Web3Context) uses
// the local node URL only in `npm run dev` builds.
const USES_ENV_ADDRESSES = Object.values(ENV_ADDRESSES).some(
  (address) => address && address !== ZERO_ADDRESS
)

export const NETWORK_CONFIG = {
  // Chain the contracts live on; used to warn when the wallet is elsewhere.
  // The deployment file's chain only applies when its addresses are in use.
  chainId: import.meta.env.VITE_CHAIN_ID
    ? parseInt(import.meta.env.VITE_CHAIN_ID)
    : USES_ENV_ADDRESSES ? null : DEPLOYED_NETWORK?.chainId ?? null,
  rpcUrl: import.meta.env.VITE_RPC_URL || '',
  networkName: import.meta.env.VITE_NETWORK_NAME || DEPLOYED_NETWORK?.name || '',
}

export const LOCAL_CHAIN_ID = 31337
export const LOCAL_RPC_URL = 'http://127.0.0.1:8545'

// Network configurations
// [Audit fix: I-6] RPC URLs removed — connections use VITE_RPC_URL env var or wallet-injected provider
export const NETWORKS = {
  1: { name: 'Ethereum Mainnet', symbol: 'ETH', explorer: 'https://etherscan.io' },
  5: { name: 'Goerli Testnet', symbol: 'ETH', explorer: 'https://goerli.etherscan.io', deprecated: true },
  11155111: { name: 'Sepolia Testnet', symbol: 'ETH', explorer: 'https://sepolia.etherscan.io' },
  8453: { name: 'Base', symbol: 'ETH', explorer: 'https://basescan.org' },
  84532: { name: 'Base Sepolia', symbol: 'ETH', explorer: 'https://sepolia.basescan.org' },
  137: { name: 'Polygon', symbol: 'MATIC', explorer: 'https://polygonscan.com' },
  80001: { name: 'Mumbai Testnet', symbol: 'MATIC', explorer: 'https://mumbai.polygonscan.com', deprecated: true },
  31337: { name: 'Hardhat Local', symbol: 'ETH', explorer: '' },
};

// TriggerMechanism.TriggerType (only meaningful when config.isConfigured)
export const TRIGGER_TYPES = {
  0: 'Deadman Switch',
  1: 'Trusted Quorum',
  2: 'Oracle Verified',
}

export const TRIGGER_TYPE = {
  DEADMAN_SWITCH: 0,
  TRUSTED_QUORUM: 1,
  ORACLE_VERIFIED: 2,
}

// SunsetProtocol.LicenseType — the license IP moves to at sunset
export const SUNSET_LICENSE_TYPES = {
  0: 'CC0 (Public Domain Dedication)',
  1: 'Public Domain Equivalent',
  2: 'Neutral Stewardship',
}

// Operator roles. Contract functions gated on these revert for other accounts.
export const ROLE_NAMES = [
  'DEFAULT_ADMIN_ROLE',
  'EXECUTOR_ROLE',
  'ORACLE_ROLE',
  'SUNSET_ROLE',
  'INDEXER_ROLE',
  'SUNSET_OPERATOR_ROLE',
  'MINTER_ROLE',
]
