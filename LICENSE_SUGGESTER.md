# License Suggester Tool

## Overview

The **License Suggester** is an **optional helper tool** that uses local AI (Ollama) to suggest appropriate licenses for your intellectual property before tokenizing and selling it on the blockchain via the Finite Intent Executor system.

**IMPORTANT**: This tool provides suggestions only and does not enforce licensing. Always consult legal counsel for licensing decisions, especially for valuable intellectual property.

## Purpose

When using the Finite Intent Executor to manage posthumous intent and IP distribution:

1. **IP Tokenization**: The `IPToken` contract allows minting ERC721 tokens for your IP
2. **Licensing**: The `ExecutionAgent` can issue licenses and collect royalties
3. **Public Domain Transition**: All IP automatically becomes CC0 after 20 years (via `SunsetProtocol`)

This tool helps you choose the right license **before** minting your IP as a token, considering:
- The type of content (code, art, music, writing, etc.)
- Blockchain compatibility
- Royalty collection mechanisms
- Future public domain transition
- Open-source vs proprietary considerations

## Prerequisites

### 1. Install Ollama

Download and install Ollama from [https://ollama.com](https://ollama.com)

### 2. Pull an AI Model

```bash
# Recommended: Llama 3.2 (default)
ollama pull llama3.2

# Alternative: Mistral (faster, smaller)
ollama pull mistral:7b-instruct

# Or any other model you prefer
ollama pull llama3.1
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or manually:
```bash
pip install ollama
```

### 4. Verify Ollama is Running

```bash
# Check if Ollama is running
ollama list
```

## Usage

### Basic Usage

```bash
# Analyze a file
npm run suggest-license -- path/to/your/file.txt

# Or directly with Python
python3 scripts/license_suggester.py path/to/your/file.txt
```

### Examples

#### Analyze Your Intent Document
```bash
npm run suggest-license -- my_intent_document.md
```

#### Analyze Source Code
```bash
npm run suggest-license -- src/MyProject.sol
```

#### Analyze Creative Work
```bash
npm run suggest-license -- artwork_description.txt
```

#### Pipe Content from stdin
```bash
cat my_article.md | python3 scripts/license_suggester.py
```

### Advanced Options

#### Use a Different Model
```bash
python3 scripts/license_suggester.py myfile.txt --model mistral
```

#### List Available Models
```bash
python3 scripts/license_suggester.py --list-models
```

#### Disable Blockchain-Specific Context
```bash
python3 scripts/license_suggester.py myfile.txt --no-context
```

## Supported License Types

The tool suggests from these categories:

### Code Licenses
- **MIT License** - Permissive, very popular
- **Apache License 2.0** - Permissive with patent grant
- **BSD 3-Clause** - Permissive
- **GNU GPLv3** - Strong copyleft
- **GNU LGPLv3** - Weak copyleft
- **Mozilla Public License 2.0** - File-level copyleft

### Content/Documentation Licenses
- **Creative Commons Attribution 4.0 (CC BY-4.0)** - Requires attribution
- **Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA-4.0)** - Requires attribution + share-alike
- **Creative Commons CC0 1.0** - Public domain dedication

### Blockchain-Specific Licenses
- **NFT License 2.0** - Designed for tokenized IP
- **Royalty-based licenses** - Custom terms for blockchain royalties
- **Sunset licenses** - Auto-public-domain after specified period

### Proprietary
- **All Rights Reserved** - No open-source license

## Integration with Finite Intent Executor

### Workflow

1. **Create Your IP**
   - Write code, articles, create art, compose music, etc.

2. **Get License Suggestions** (Optional)
   ```bash
   npm run suggest-license -- my_work.txt
   ```

3. **Choose Appropriate License**
   - Review suggestions
   - Consult legal counsel if needed
   - Select license compatible with your goals

4. **Mint IP Token**
   ```solidity
   // In your deployment/interaction script
   ipToken.mintIP(
       to,
       "Your Work Title",
       "Description with chosen license terms",
       IPType.Code,  // or Article, Music, Art, etc.
       contentHash
   );
   ```

5. **Configure Licensing**
   ```solidity
   // Set royalty info
   ipToken.setRoyaltyInfo(tokenId, recipient, royaltyPercentage);

   // Grant licenses through ExecutionAgent
   executionAgent.issueLicense(tokenId, licensee, duration, royaltyPercentage);
   ```

6. **Automatic Sunset**
   - After 20 years, `SunsetProtocol` transitions all IP to CC0
   - Compatible with most permissive licenses
   - Consider this when choosing initial license

## Example Output

```
======================================================================
LICENSE SUGGESTION TOOL (OPTIONAL - FOR GUIDANCE ONLY)
======================================================================

Analyzing content using model: llama3.2
This may take a few moments...

----------------------------------------------------------------------
Based on the analysis of your Solidity smart contract code, here are
the suggested licenses ranked by best fit:

1. MIT License (BEST FIT)
   - Highly permissive and popular in blockchain/web3 space
   - Allows commercial use, modification, and distribution
   - Minimal restrictions, only requires license/copyright notice
   - Compatible with eventual CC0 transition after 20 years
   - Widely accepted by the Ethereum community

2. Apache License 2.0 (STRONG ALTERNATIVE)
   - Similar permissiveness to MIT
   - Includes explicit patent grant protection
   - Good for projects with potential patent concerns
   - Slightly more formal/corporate-friendly
   - Also compatible with future public domain transition

3. BSD 3-Clause (ALTERNATIVE)
   - Very similar to MIT in terms of permissions
   - Includes non-endorsement clause
   - Popular in academic and research contexts
   - Clean transition to CC0

4. GNU GPLv3 (IF COPYLEFT DESIRED)
   - Strong copyleft license
   - Requires derivative works to be open-source
   - May conflict with proprietary blockchain applications
   - Consider carefully before tokenizing as IP
   - Less common in web3/blockchain space

5. Proprietary (All Rights Reserved)
   - If you want to retain full control initially
   - Can still grant licenses via ExecutionAgent
   - Will transition to CC0 anyway after 20 years
   - May limit adoption and contributions

Recommendation: For blockchain smart contracts intended for the Finite
Intent Executor system, MIT License offers the best balance of openness,
community adoption, and compatibility with the 20-year sunset mechanism.
----------------------------------------------------------------------

Reminder: This is a suggestion tool only. Always consult legal counsel
for licensing decisions, especially for valuable intellectual property.
======================================================================
```

## Troubleshooting

### Error: "Failed to connect to Ollama"

**Solution**:
1. Ensure Ollama is installed: [https://ollama.com](https://ollama.com)
2. Start Ollama (it may auto-start on some systems)
3. Pull a model: `ollama pull llama3.2`
4. Verify: `ollama list`

### Error: "Model not found"

**Solution**:
```bash
# Pull the model you want to use
ollama pull llama3.2

# Or try a different model
python3 scripts/license_suggester.py myfile.txt --model mistral
```

### Error: "No module named 'ollama'"

**Solution**:
```bash
pip install ollama
```

### Slow Response Times

**Solution**:
- Use a smaller/faster model: `--model mistral:7b-instruct`
- Ensure you have adequate RAM (8GB+ recommended)
- Close other resource-intensive applications

## Important Reminders

### This Tool is Optional
- You can use the Finite Intent Executor without this tool
- License selection is your responsibility
- Tool provides guidance only, not legal advice

### Blockchain Considerations
- Smart contracts are immutable once deployed
- License terms should be clear in IP metadata
- Consider how licenses work with ERC721 tokens
- Royalty mechanisms should align with license terms

### 20-Year Sunset
- All IP becomes CC0 (public domain) after 20 years
- Choose initial licenses compatible with this transition
- Highly restrictive licenses may create complications
- Permissive licenses (MIT, Apache, CC BY) work best

### Legal Counsel
- For valuable IP, consult an attorney
- Licensing is a legal decision, not just technical
- AI suggestions are helpful but not authoritative
- Different jurisdictions may have different requirements

## FAQ

### Q: Is this tool required to use the Finite Intent Executor?
**A**: No, it's completely optional. It's a helpful suggestion tool.

### Q: Can I use my own license not listed here?
**A**: Yes! The tool suggests common licenses, but you can use any license you choose.

### Q: Does this tool enforce the license?
**A**: No, it only provides suggestions. Enforcement happens through your smart contract logic and legal agreements.

### Q: What if I disagree with the suggestions?
**A**: The suggestions are guidance only. You have full control over your license choice.

### Q: Can I run this offline?
**A**: Yes! Ollama runs locally on your machine. No internet required once models are downloaded.

### Q: How private is this?
**A**: Completely private. All analysis happens locally on your machine. No data is sent to external servers.

### Q: Can I customize the license categories?
**A**: Yes! Edit `COMMON_LICENSES` in `scripts/license_suggester.py` to add more options.

## Integration with IPToken Contract

Example workflow with the `IPToken` contract:

```javascript
// After using license suggester and choosing MIT License

const { ethers } = require("hardhat");

async function mintIPWithLicense() {
  const ipToken = await ethers.getContractAt("IPToken", ipTokenAddress);

  // Mint IP token with license information in description
  const tx = await ipToken.mintIP(
    creatorAddress,
    "My Smart Contract Library",
    "A collection of reusable Solidity contracts. Licensed under MIT License. See https://opensource.org/licenses/MIT",
    0, // IPType.Code
    contentHash
  );

  console.log("IP Token minted with MIT License");

  // Set royalty info (compatible with permissive licensing)
  await ipToken.setRoyaltyInfo(tokenId, creatorAddress, 500); // 5% royalty

  console.log("Royalty configured");
}
```

## Additional Resources

- [Finite Intent Executor Documentation](./README.md)
- [System Architecture](./ARCHITECTURE.md)
- [Usage Guide](./USAGE.md)
- [Ollama Documentation](https://github.com/ollama/ollama)
- [Choose an Open Source License](https://choosealicense.com/)
- [Creative Commons Licenses](https://creativecommons.org/licenses/)
- [SPDX License List](https://spdx.org/licenses/)

## Contributing

If you'd like to improve the license suggester:

1. Add more license categories to `COMMON_LICENSES`
2. Improve the AI prompt in `PROMPT_TEMPLATE`
3. Add support for more models
4. Enhance error handling
5. Submit a pull request!

## License

This tool is part of the Finite Intent Executor project and is licensed under the same terms (MIT License).

---

*Last Updated: 2026-01-01*
