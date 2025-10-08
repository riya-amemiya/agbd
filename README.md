# agbd (auto git branch delete)

- [日本語](./README.ja.md)

<a href="https://github.com/sponsors/riya-amemiya"><img alt="Sponsor" src="https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#white" /></a>

Interactive CLI for pruning unnecessary Git branches safely. agbd lets you inspect, filter, and delete local and remote branches with confirmation workflows and configurable safeguards.

## Install

```bash
npm install --global agbd
```

## Usage

```bash
agbd [options]
```

### Options

- `--pattern <regex>`: Filter branches by regular expression (fallback to substring match on invalid regex)
- `--remote`: Include remote branches (default: local only)
- `--local-only`: Show only local branches without remote counterparts
- `--dry-run`: Show deletion plan without modifying branches
- `-y, --yes`: Skip confirmation prompts and execute immediately
- `--force`: Force delete even when branches are not merged (local only)
- `--protected <list>`: Comma-separated list of branch names/regex patterns to keep (default: `main,master,develop,release`)
- `--default-remote <name>`: Default remote name used when remote info is missing (default: `origin`)
- `--cleanup-merged <days>`: Select branches whose last commit is older than the specified number of days
- `--detect-default`: Detect the remote default branch and add it to the protected list for this run
- `--save-detected-default`: Detect the default branch and persist it into the local config (`.agbdrc`)
- `--config <command>`: Manage configuration (`show`, `set`, `edit`, `reset`)
- `--no-config`: Ignore configuration files and rely on CLI flags + defaults
- `-v, --version`: Print version
- `-h, --help`: Show help message

### Configuration

agbd supports layered configuration with the following priority (highest first):

1. CLI flags
2. Local config (`.agbdrc` searched upward from CWD)
3. Global config (`~/.config/agbd/config.json`)
4. Built-in defaults

Use `--no-config` to disable config loading. Values include:

- `remote`: boolean
- `localOnly`: boolean
- `dryRun`: boolean
- `yes`: boolean
- `force`: boolean
- `pattern`: string
- `protectedBranches`: string array
- `defaultRemote`: string
- `cleanupMergedDays`: number
- `detectedDefaultBranch`: string (auto-populated when running `--save-detected-default`)

#### Managing Configuration

- `agbd --config show`: Display the current effective configuration and source (default/global/local)
- `agbd --config set`: Launch the interactive configuration editor
- `agbd --config edit`: Open the global config file in `$EDITOR`
- `agbd --config reset`: Reset the global config to defaults

### Examples

```bash
# Interactively choose branches and delete them locally
agbd

# Dry-run deletion of remote feature branches older than 30 days
agbd --pattern '^feature/' --remote --cleanup-merged 30 --dry-run

# Force-delete stale bugfix branches without prompts
agbd --pattern 'bugfix/' --force --yes

# Remove fully merged branches except main/master/develop
agbd --cleanup-merged 0 --protected main,master,develop

# Show only local branches without remote counterparts
agbd --local-only
```

## How it works

agbd enumerates local (and optionally remote) branches via Git plumbing commands. Each branch displays last commit time, subject, and merged status. Protection rules let you exclude critical branches by exact match or regex (`/regex/flags`).

Interactive mode uses Ink to present a multi-select list. You can filter by typing, toggle selection with Space, and confirm with Enter. Auto mode (triggered by specifying `--pattern`, `--cleanup-merged`, or `--yes`) can run non-interactively.

Dry runs show the plan without running deletion commands. Actual deletions rely on `git branch -d/-D` for local branches and `git push <remote> --delete <branch>` for remote branches.

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Dev (watch)
bun run dev

# Lint (check/fix)
bun run test
bun run lint
```

## License

MIT

## Contributing

Issues and PRs are welcome. See CONTRIBUTING for details.
