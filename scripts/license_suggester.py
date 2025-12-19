#!/usr/bin/env python3

"""
License Suggester Script for Finite Intent Executor

This script reads text or code from a file or standard input and uses a local Ollama model
to suggest appropriate licenses before selling work on the blockchain.

This is an OPTIONAL helper tool - it provides suggestions only and does not enforce any licensing.

Requirements:
- Ollama running locally (download from https://ollama.com)
- Pull a suitable model, e.g.:
  ollama pull llama3.2    # Good general-purpose model
  # or
  ollama pull mistral:7b-instruct  # Efficient and capable
- Install the ollama Python library:
  pip install ollama

Usage:
  python scripts/license_suggester.py input.txt
  # or
  npm run suggest-license -- input.txt

  # or pipe content:
  cat some_code.py | python scripts/license_suggester.py

  # analyze your intent document:
  python scripts/license_suggester.py path/to/intent.md
"""

import sys
import argparse
import ollama

# List of common licenses to guide the model
COMMON_LICENSES = """
Common open-source licenses for code:
- MIT License (permissive, very popular)
- Apache License 2.0 (permissive, with patent grant)
- BSD 3-Clause (permissive)
- GNU GPLv3 (strong copyleft)
- GNU LGPLv3 (weak copyleft)
- Mozilla Public License 2.0

For text/content/documentation:
- Creative Commons Attribution 4.0 (CC BY-4.0)
- Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA-4.0)
- Creative Commons CC0 1.0 (public domain dedication)

For blockchain/NFT IP assets:
- NFT License 2.0 (designed for tokenized IP)
- Royalty-based licenses (custom terms)
- Sunset licenses (auto-public-domain after period)

Proprietary / All rights reserved (no open-source license).
"""

BLOCKCHAIN_CONTEXT = """
Note: This tool is designed for the Finite Intent Executor system, which:
- Manages posthumous intent execution
- Supports IP tokenization via ERC721 (IPToken contract)
- Automatically transitions IP to public domain (CC0) after 20 years
- Allows licensing and royalty collection during execution phase

Consider licenses that are compatible with:
1. Blockchain-based IP management
2. Potential future public domain transition
3. Royalty collection mechanisms
4. Smart contract enforcement
"""

PROMPT_TEMPLATE = """
You are an expert in open-source licensing and blockchain IP management.

{context}

Analyze the following content and suggest 3-5 most appropriate licenses, ranked from best fit to alternatives.
Explain briefly why each one fits, considering:
- If it's source code, what language/style, and desired openness (permissive vs copyleft).
- If it's text/documentation/article, suggest Creative Commons or similar.
- If it's IP for blockchain/NFT distribution, consider royalty-compatible licenses.
- Compatibility with eventual public domain transition (in 20 years).
- If it seems proprietary or closed, suggest "Proprietary (All rights reserved)".

Only suggest from these common licenses: {licenses}

If none fit well, say so and explain what type of license would be needed.

Content preview (first 8000 chars):
{content}
"""

def read_content(file_path: str | None) -> str:
    """Read content from file or stdin."""
    if file_path and file_path != '-':
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            print(f"Error: File '{file_path}' not found.")
            sys.exit(1)
        except Exception as e:
            print(f"Error reading file: {e}")
            sys.exit(1)
    else:
        return sys.stdin.read()

def suggest_licenses(content: str, model: str = 'llama3.2', include_context: bool = True) -> str:
    """Query Ollama model for license suggestions."""
    context = BLOCKCHAIN_CONTEXT if include_context else ""

    prompt = PROMPT_TEMPLATE.format(
        context=context.strip(),
        licenses=COMMON_LICENSES.strip(),
        content=content[:8000]  # Truncate to avoid token limits; adjust as needed
    )

    try:
        response = ollama.generate(model=model, prompt=prompt)
        return response['response']
    except Exception as e:
        print(f"\nError: Failed to connect to Ollama. Please ensure:")
        print(f"1. Ollama is installed (https://ollama.com)")
        print(f"2. Ollama is running")
        print(f"3. The model '{model}' is available (run: ollama pull {model})")
        print(f"\nDetailed error: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Suggest licenses for text or code using Ollama (OPTIONAL helper tool).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/license_suggester.py my_code.py
  python scripts/license_suggester.py intent_document.md --model mistral
  cat article.txt | python scripts/license_suggester.py
  npm run suggest-license -- path/to/file.txt

Note: This is an optional suggestion tool. It does not enforce licensing.
        """
    )
    parser.add_argument('file', nargs='?', default='-', help='Input file (or - for stdin)')
    parser.add_argument('--model', default='llama3.2', help='Ollama model to use (default: llama3.2)')
    parser.add_argument('--no-context', action='store_true', help='Disable blockchain-specific context')
    parser.add_argument('--list-models', action='store_true', help='List available Ollama models')
    args = parser.parse_args()

    # List models if requested
    if args.list_models:
        try:
            models = ollama.list()
            print("Available Ollama models:")
            for model in models.get('models', []):
                print(f"  - {model['name']}")
            sys.exit(0)
        except Exception as e:
            print(f"Error listing models: {e}")
            print("Make sure Ollama is running.")
            sys.exit(1)

    # Read and analyze content
    content = read_content(args.file)

    if not content.strip():
        print("No content provided.")
        sys.exit(1)

    print("=" * 70)
    print("LICENSE SUGGESTION TOOL (OPTIONAL - FOR GUIDANCE ONLY)")
    print("=" * 70)
    print(f"\nAnalyzing content using model: {args.model}")
    print("This may take a few moments...\n")

    suggestion = suggest_licenses(content, model=args.model, include_context=not args.no_context)

    print("-" * 70)
    print(suggestion)
    print("-" * 70)
    print("\nReminder: This is a suggestion tool only. Always consult legal counsel")
    print("for licensing decisions, especially for valuable intellectual property.")
    print("=" * 70)

if __name__ == '__main__':
    main()
