# AGENTS.md

## Project Overview

This project is a command-line interface (CLI) tool named `agbd` (auto git branch delete) that provides an interactive and safe way to clean up Git branches. The tool is built with TypeScript, React (using Ink for the CLI UI), and Node.js.

The core functionality of `agbd` is to help you review and delete branches confidently:

1. **Interactive pruning**: Select local or remote branches from an Ink-powered UI, see last-commit metadata, and confirm deletions.
2. **Automated cleanup**: Use filters (pattern, age, protection rules) and non-interactive mode to prune branches in bulk.

The tool is designed to be transparent and configurable, letting you dry-run plans or persist default behaviours via a config file.

## Building and Running

The project uses `bun` for package management and running scripts.

**Install Dependencies:**

```bash
bun install
```

**Build the project:**

```bash
bun run build
```

**Run in development mode (with file watching):**

```bash
bun run dev
```

**Lint the code:**

```bash
bun run lint
```

**Run tests:**

```bash
bun run test
```

## Development Conventions

**Code Style**: The project uses Biome for code formatting and linting. The configuration can be found in the `biome.json` file.
**Testing**: The project uses Biome for static checks. Add automated tests where possible.
**Contribution**: Contribution guidelines are available in `CONTRIBUTING.md`.
