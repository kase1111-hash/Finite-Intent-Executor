# Finite Intent Executor - Dashboard

A React-based web dashboard for interacting with the Finite Intent Executor smart contracts.

*Last Updated: 2026-01-01*

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
- **Vite 6.2.0** - Build tool with code splitting
- **ethers.js 6.16.0** - Ethereum interaction
- **Tailwind CSS 3.3.6** - Styling
- **React Router 7.1.0** - Navigation
- **React Hot Toast 2.6.0** - Notifications
- **Lucide React 0.462.0** - Icons
- **date-fns 4.1.0** - Date formatting

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and configure contract addresses
cp .env.example .env

# Start development server
npm run dev
```

## Configuration

Update `.env` with your deployed contract addresses:

```env
VITE_INTENT_MODULE_ADDRESS=0x...
VITE_TRIGGER_MECHANISM_ADDRESS=0x...
VITE_EXECUTION_AGENT_ADDRESS=0x...
VITE_LEXICON_HOLDER_ADDRESS=0x...
VITE_SUNSET_PROTOCOL_ADDRESS=0x...
VITE_IP_TOKEN_ADDRESS=0x...
```

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
│   │   └── Layout.jsx  # Main layout with sidebar navigation
│   ├── context/        # React contexts
│   │   └── Web3Context.jsx  # Web3/wallet connection
│   ├── contracts/      # Contract configuration
│   │   └── config.js   # ABIs, addresses, constants
│   ├── pages/          # Page components
│   │   ├── Dashboard.jsx
│   │   ├── IntentCapture.jsx
│   │   ├── TriggerConfig.jsx
│   │   ├── IPTokens.jsx
│   │   ├── ExecutionMonitor.jsx
│   │   ├── SunsetStatus.jsx
│   │   └── Lexicon.jsx
│   ├── styles/         # CSS files
│   │   └── index.css   # Tailwind + custom styles
│   ├── App.jsx         # Main app with routing
│   └── main.jsx        # Entry point
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Usage

1. **Connect Wallet**: Click "Connect Wallet" in the sidebar to connect MetaMask
2. **Capture Intent**: Navigate to Intent Capture to define your posthumous intent
3. **Configure Trigger**: Set up how your intent will be triggered (deadman, quorum, oracle)
4. **Mint IP Tokens**: Tokenize your intellectual property as ERC721 tokens
5. **Set Up Lexicon**: Freeze your contextual corpus and create semantic indices
6. **Monitor Execution**: After trigger activation, monitor execution and actions
7. **Sunset Tracking**: Track the mandatory 20-year countdown to public domain

## Networks Supported

- Ethereum Mainnet
- Goerli Testnet
- Sepolia Testnet
- Polygon
- Mumbai Testnet
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

MIT
