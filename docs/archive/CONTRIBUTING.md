# Contributing to Finite Intent Executor

Thank you for your interest in contributing to the Finite Intent Executor (FIE) project! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Security Considerations](#security-considerations)
- [Documentation](#documentation)
- [Community](#community)

## Getting Started

Before contributing, please:

1. Read the [README.md](README.md) for project overview
2. Review the [ARCHITECTURE.md](ARCHITECTURE.md) for technical design
3. Check the [SPECIFICATION.md](SPECIFICATION.md) for core requirements
4. Review open issues and pull requests to avoid duplication

## Development Setup

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org)
- **Git** - For version control
- **Python 3** (optional) - For license suggester tool
- **Foundry** (optional) - For fuzzing tests

### Installation

```bash
# Clone the repository
git clone https://github.com/kase1111-hash/Finite-Intent-Executor.git
cd Finite-Intent-Executor

# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Set up frontend (optional)
cd frontend && npm install
```

### Environment Setup

Copy the environment template and configure as needed:

```bash
cp .env.example .env
```

See `.env.example` for all available configuration options.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/kase1111-hash/Finite-Intent-Executor/issues)
2. If not, create a new issue using the bug report template
3. Include:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Relevant logs or screenshots

### Suggesting Features

1. Check existing issues for similar suggestions
2. Create a new issue using the feature request template
3. Describe:
   - The problem you're trying to solve
   - Your proposed solution
   - Alternative approaches considered
   - Impact on existing functionality

### Contributing Code

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following our [coding standards](#coding-standards)
4. Write or update tests as needed
5. Ensure all tests pass
6. Submit a pull request

## Pull Request Process

### Before Submitting

1. **Run all tests**:
   ```bash
   npm test
   npm run test:gas  # Check gas consumption
   ```

2. **Check contract sizes** (must be under 24KB):
   ```bash
   npm run size
   ```

3. **Lint your code** (if applicable):
   ```bash
   npm run lint
   ```

4. **Update documentation** for any changed functionality

### PR Requirements

- Clear title describing the change
- Description of what changed and why
- Link to related issues (use "Fixes #123" or "Closes #123")
- All tests passing
- No increase in critical/high security issues
- Documentation updated if needed

### Review Process

1. At least one maintainer review required
2. All CI checks must pass
3. Address all review comments
4. Squash commits if requested

## Coding Standards

### Solidity

- **Version**: Use Solidity 0.8.28
- **Style**: Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- **Security**: Use OpenZeppelin contracts where applicable
- **Gas**: Optimize for gas efficiency
- **Comments**: NatSpec comments for all public functions

```solidity
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ExampleContract
 * @notice Brief description of what this contract does
 * @dev Technical implementation details
 */
contract ExampleContract is Ownable {
    /**
     * @notice Brief description of the function
     * @param param1 Description of parameter
     * @return Description of return value
     */
    function exampleFunction(uint256 param1) external returns (uint256) {
        // Implementation
    }
}
```

### JavaScript/TypeScript

- Use ES6+ features
- Async/await over callbacks
- Meaningful variable names
- JSDoc comments for functions

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add new trigger type for oracle verification
fix: resolve reentrancy vulnerability in ExecutionAgent
docs: update USAGE.md with new examples
test: add fuzzing tests for IntentCaptureModule
refactor: extract common logic to shared library
```

## Testing Requirements

### Required Tests

All code changes must include appropriate tests:

1. **Unit Tests** (Hardhat):
   - Test individual functions
   - Cover edge cases
   - Test error conditions

2. **Integration Tests**:
   - Test contract interactions
   - Test complete workflows

3. **Gas Benchmarks** (for optimization PRs):
   ```bash
   npm run test:gas
   ```

### Running Tests

```bash
# All tests
npm test

# Specific test file
npx hardhat test test/YourContract.test.js

# With gas reporting
npm run test:gas

# Fuzzing tests (requires Foundry)
forge test --fuzz-runs 1000

# Coverage report
npm run test:coverage
```

### Test Coverage

- Aim for high coverage on critical paths
- All public functions should have tests
- Security-critical code requires 100% coverage

## Security Considerations

FIE handles sensitive posthumous intent execution. Security is paramount.

### Security Guidelines

1. **Never introduce vulnerabilities**:
   - Reentrancy attacks
   - Integer overflow/underflow
   - Access control issues
   - Front-running vulnerabilities

2. **Use established patterns**:
   - OpenZeppelin contracts for common functionality
   - Checks-Effects-Interactions pattern
   - Pull over push for payments

3. **Maintain invariants**:
   - 95% confidence threshold must remain immutable
   - 20-year sunset period must remain hardcoded
   - No Political Agency clause must be preserved

4. **Report vulnerabilities responsibly**:
   - Do NOT open public issues for security vulnerabilities
   - Email security concerns to the maintainers
   - See [SECURITY.md](SECURITY.md) for details

### Security Review Checklist

- [ ] No new critical/high severity issues
- [ ] ReentrancyGuard on value transfers
- [ ] Access control properly configured
- [ ] Input validation on all external functions
- [ ] Events emitted for state changes
- [ ] Gas limits considered for loops

## Documentation

### When to Update Documentation

- New features require documentation
- API changes require updated examples
- Bug fixes may require clarification
- Performance improvements should be noted

### Documentation Files

| File | Purpose |
|------|---------|
| README.md | Project overview and quick start |
| ARCHITECTURE.md | Technical design |
| USAGE.md | Detailed usage guide |
| SPECIFICATION.md | Core requirements |
| CHANGELOG.md | Version history |

### Documentation Style

- Use clear, concise language
- Include code examples where helpful
- Keep formatting consistent
- Update table of contents if structure changes

## Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **Pull Requests**: Code contributions and discussions

### Response Times

- Issues: Typically reviewed within 1 week
- Pull requests: Initial review within 1-2 weeks
- Security issues: Prioritized for immediate review

### Recognition

Contributors are recognized in:
- Release notes for significant contributions
- CHANGELOG.md for feature additions

## License

By contributing to FIE, you agree that your contributions will be licensed under the CC0 1.0 Universal license, dedicating your work to the public domain. This aligns with FIE's core principle of transitioning all assets to public domain.

---

Thank you for contributing to the Finite Intent Executor project!
