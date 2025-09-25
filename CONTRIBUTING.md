# Contributing to agbd

Thank you for your interest in contributing to agbd! We welcome contributions from everyone.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check [the issue tracker](https://github.com/riya-amemiya/agbd/issues). When opening a report, include as many details as possible:

- Use a clear and descriptive title
- Describe the exact steps that reproduce the problem
- Provide specific examples or outputs
- Describe the behavior you observed after following the steps
- Explain the behavior you expected to see instead
- Include details about your configuration and environment (CLI flags, config file values, Git version, OS, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- A clear and descriptive title
- A step-by-step description of the enhancement
- Specific examples or user stories
- The current behavior and what you expect to change
- Why this enhancement would be useful

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests (or update existing ones)
3. If you've changed CLI behavior or flags, update documentation
4. Ensure the test suite passes (`bun run test`)
5. Make sure your code lints (`bun run lint`)
6. Submit the pull request!

## Development Setup

### Prerequisites

- Bun
- Git

### Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/your-username/agbd.git
   cd agbd
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Create a new branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

### Development Commands

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Development mode (watch for changes)
bun run dev

# Run linting and formatting checks
bun run test

# Fix linting and formatting issues
bun run lint

# Run the CLI locally
node dist/cli.js
```

### Testing

We use Biome for linting and formatting. Make sure your changes pass the checks:

```bash
bun run test
```

If there are any issues, you can fix them automatically with:

```bash
bun run lint
```

### Code Style

- We use Biome for code formatting and linting
- Use TypeScript for all new code
- Follow the existing patterns and structure
- Write clear, self-documenting code
- Add comments for complex logic

### Commit Messages

We follow the [Conventional Commits](https://conventionalcommits.org/) specification:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance tasks

Examples:

- `feat: add remote branch deletion support`
- `fix: handle regex errors in pattern filter`
- `docs: update README with new config fields`

### Project Structure

```text
src/
├── cli.tsx          # CLI entry point
├── app.tsx          # Main application component
├── components/      # Ink UI components
├── git.ts           # Git operations and utilities
└── lib/             # Shared helpers (config, parsing, utils)
```

## Questions?

Feel free to open an issue if you have any questions about contributing!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
