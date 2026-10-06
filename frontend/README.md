# Finite Intent Executor - Dashboard

A React-based web dashboard for interacting with the Finite Intent Executor smart contracts.

*Last Updated: 2026-10-06*

## Features

- **Dashboard**: Overview of intent status, trigger configuration, and sunset countdown
- **Intent Capture**: Create and manage posthumous intent with goals and constraints
- **Trigger Configuration**: Set up deadman switch, trusted quorum, or oracle-verified triggers
- **IP Token Management**: Mint ERC721 tokens for intellectual property, grant licenses
- **Lexicon Holder**: Freeze corpus and create semantic indices for intent interpretation
- **Execution Monitor**: Monitor and manage posthumous intent execution
- **Sunset Status**: Track the 20-year sunset countdown and public domain transition

## Tech Stack

- **React 19.0.0** - UI framework
- **Vite 6** - Build tool with code splitting
- **ethers.js 6** - Ethereum interaction
- **Tailwind CSS 4** - Styling
- **React Router 7.1.0** - Navigation
- **React Hot Toast 2.6.0** - Notifications
- **Lucide React 0.462.0** - Icons
- **date-fns 4.1.0** - Date formatting

## Quick Start (local)

From the repository root, start a local chain and deploy to it:

```bash
npm run node      # terminal 1, keep running
npm run deploy    # terminal 2
```

Then start the dashboard:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and click **Use Local Dev Account**. No `.env` and
no wallet are needed: `npm run deploy` writes
`src/contracts/deployedAddresses.js`, which the dashboard loads automatically,
and the local dev account is account #0 of the local chain (it holds every
operator role).

The dev account and the sidebar's **Local chain tools** (advance time, mine
blocks) only exist in `npm run dev` on chain 31337; production builds leave
them out.

## Configuration

For a deployment on a public network, copy `.env.example` to `.env` and set
the contract addresses (they take precedence over `deployedAddresses.js`):

```env
VITE_INTENT_MODULE_ADDRESS=0x...
VITE_TRIGGER_MECHANISM_ADDRESS=0x...
VITE_EXECUTION_AGENT_ADDRESS=0x...
VITE_LEXICON_HOLDER_ADDRESS=0x...
VITE_SUNSET_PROTOCOL_ADDRESS=0x...
VITE_IP_TOKEN_ADDRESS=0x...
VITE_CHAIN_ID=11155111   # the dashboard warns when the wallet is on another chain
```

The dashboard checks that each contract exists on the connected chain and
shows a banner explaining what to fix if one is missing.

## Contract ABIs

`src/contracts/abis.js` is generated from the compiled contracts. Do not edit
it by hand; after changing a contract's external interface, run
`npm run export-abis` in the repository root.

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Project Structure

```
frontend/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── Layout.jsx  # Main layout with sidebar navigation
│   │   ├── CreatorSelector.jsx  # Pick the creator an operator acts for
│   │   ├── LocalChainTools.jsx  # Dev-only time travel / block mining
│   │   └── DocumentUploadArea.jsx  # Document drag-and-drop uploader
│   ├── context/        # React contexts
│   │   └── Web3Context.jsx  # Web3/wallet connection
│   ├── contracts/      # Contract configuration
│   │   ├── abis.js     # Generated ABIs (npm run export-abis)
│   │   └── config.js   # Addresses, networks, constants
│   ├── pages/          # Page components
│   │   ├── Dashboard.jsx
│   │   ├── IntentCapture.jsx
│   │   ├── TriggerConfig.jsx
│   │   ├── IPTokens.jsx
│   │   ├── ExecutionMonitor.jsx
│   │   ├── SunsetStatus.jsx
│   │   ├── Lexicon.jsx
│   │   └── MonitoringDashboard.jsx  # SIEM monitoring (not yet routed)
│   ├── utils/          # Error messages, transaction helpers
│   ├── styles/         # CSS files
│   │   └── index.css   # Tailwind + custom styles
│   ├── App.jsx         # Main app with routing
│   └── main.jsx        # Entry point
├── index.html
├── package.json
└── vite.config.js
```

## Usage

1. **Connect Wallet**: Click "Connect Wallet" in the sidebar to connect MetaMask
   (or "Use Local Dev Account" against a local chain)
2. **Capture Intent**: Navigate to Intent Capture to define your posthumous intent
3. **Configure Trigger**: Set up how your intent will be triggered (deadman, quorum, oracle)
4. **Mint IP Tokens**: Tokenize your intellectual property as ERC721 tokens
5. **Set Up Lexicon**: Freeze your contextual corpus and create semantic indices
6. **Monitor Execution**: After trigger activation, monitor execution and actions
7. **Sunset Tracking**: Track the mandatory 20-year countdown to public domain

Operator actions (activating execution, freezing a corpus, minting, sunset
steps) require the matching role (EXECUTOR_ROLE, INDEXER_ROLE, MINTER_ROLE,
SUNSET_OPERATOR_ROLE). Operator pages have a **Creator** selector for acting on
behalf of another address. If an action is not allowed, the error names the
missing role.

## Networks Supported

- Ethereum Mainnet
- Sepolia Testnet
- Goerli Testnet (deprecated)
- Base L2 Mainnet
- Base Sepolia Testnet
- Hardhat Local (localhost:8545)

## Security Notes

- Never share your private keys
- The corpus content you enter is hashed locally before being sent to the blockchain
- Store original documents securely off-chain (IPFS, Arweave)
- Review all transactions in MetaMask before confirming

## Related Documentation

- [Main README](../README.md)
- [Specification](../SPECIFICATION.md)
- [Architecture](../ARCHITECTURE.md)
- [Security](../SECURITY.md)

## License

CC0 1.0 Universal (Public Domain Dedication)
