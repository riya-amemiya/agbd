#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "ink";
import App from "./app.js";
import { ConfigEditor } from "./components/ConfigEditor.js";
import { ArgParser } from "./lib/arg-parser.js";
import {
	defaultConfig,
	GLOBAL_CONFIG_PATH,
	getConfig,
	resetGlobalConfig,
} from "./lib/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const helpMessage = `
Usage
  $ agbd [options]

Options
    --pattern <regex>          Filter branches by name (regex or string)
    --remote                   Include remote branches
    --dry-run                  Show what would be deleted, without deleting
    -y, --yes                  Skip confirmation prompts
    --force                    Force delete non-merged branches
    --protected <list>         Comma-separated list of protected branches
    --default-remote <name>    Default remote name (used if remote=true)
    --cleanup-merged <days>    Filter branches older than N days
    --config <command>         Manage configuration (show | set | edit | reset)
    --no-config                Disable loading configuration files
    -v, --version              Show version
    -h, --help                 Show this help message

Examples
  $ agbd --pattern feature/ --remote
  $ agbd --cleanup-merged 30
  $ agbd --yes --force --pattern 'bugfix/.*'
  $ agbd --config set
`;

const schema = {
	pattern: {
		type: "string",
	},
	remote: {
		type: "boolean",
	},
	dryRun: {
		type: "boolean",
	},
	yes: {
		type: "boolean",
		shortFlag: "y",
	},
	force: {
		type: "boolean",
	},
	protected: {
		type: "string",
	},
	defaultRemote: {
		type: "string",
	},
	cleanupMerged: {
		type: "string",
	},
	config: {
		type: "string",
	},
	noConfig: {
		type: "boolean",
	},
} as const;

const parseProtected = (value: string | undefined) =>
	value
		?.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

const parseCleanup = (value: string | undefined): number | undefined => {
	if (!value) {
		return undefined;
	}
	const num = Number.parseInt(value, 10);
	if (Number.isNaN(num) || num < 0) {
		throw new Error("--cleanup-merged must be an integer >= 0");
	}
	return num;
};

try {
	const parser = new ArgParser({
		schema,
		helpMessage,
		version: packageJson.version,
	});

	const cli = parser.parse(process.argv.slice(2));

	if (cli.help) {
		console.log(cli.help);
		process.exit(0);
	}

	if (cli.version) {
		console.log(cli.version);
		process.exit(0);
	}

	(async () => {
		if (cli.flags.config) {
			const command = cli.flags.config;
			switch (command) {
				case "show": {
					const { config, sources } = await getConfig();
					console.log("Current configuration:");
					for (const key in config) {
						const k = key as keyof typeof config;
						const source = sources[k] || "default";
						console.log(`  ${k}: ${String(config[k])} (${source})`);
					}
					break;
				}
				case "edit": {
					// biome-ignore lint/complexity/useLiteralKeys: ProcessEnv requires bracket access when no specific typing exists
					const editor = process.env["EDITOR"] || "vim";
					const { spawn } = await import("node:child_process");
					const child = spawn(editor, [GLOBAL_CONFIG_PATH], {
						stdio: "inherit",
						env: process.env,
					});
					child.on("exit", (code) => {
						process.exit(code ?? 0);
					});
					return;
				}
				case "reset": {
					await resetGlobalConfig();
					console.log(`Configuration reset to default: ${GLOBAL_CONFIG_PATH}`);
					break;
				}
				case "set": {
					render(<ConfigEditor />);
					return;
				}
				default:
					console.error(`Unknown config command: ${command}`);
					console.log("Available commands: show, edit, reset, set");
					process.exit(1);
			}
			return;
		}

		const { config } = cli.flags.noConfig
			? { config: defaultConfig }
			: await getConfig();

		const props = {
			pattern: cli.flags.pattern ?? config.pattern,
			remote: cli.flags.remote ?? config.remote,
			dryRun: cli.flags.dryRun ?? config.dryRun,
			yes: cli.flags.yes ?? config.yes,
			force: cli.flags.force ?? config.force,
			protectedBranches:
				parseProtected(cli.flags.protected) ?? config.protectedBranches,
			defaultRemote: cli.flags.defaultRemote ?? config.defaultRemote,
			cleanupMergedDays:
				parseCleanup(cli.flags.cleanupMerged) ?? config.cleanupMergedDays,
		};

		render(<App {...props} />);
	})();
} catch (error) {
	if (error instanceof Error) {
		console.error(`❌ ${error.message}`);
	} else {
		console.error(error);
	}
	process.exit(1);
}
