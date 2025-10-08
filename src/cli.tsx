#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ConfigEditor as AgToolkitConfigEditor,
	ArgParser,
	type ConfigItem,
	GitOperations,
	handleConfigCommand,
	loadConfig,
	loadLocalConfig,
	resetGlobalConfig,
	writeGlobalConfig,
	writeLocalConfig,
} from "ag-toolkit";
import { render } from "ink";
import App from "./app.js";
import type { AgbdConfig } from "./lib/config.js";
import {
	CONFIG_DIR_NAME,
	CONFIG_FILE_NAME,
	defaultConfig,
	GLOBAL_CONFIG_PATH,
	LOCAL_CONFIG_FILE_NAME,
	validateConfig,
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
    --local-only               Show only local branches without remote counterparts
    --dry-run                  Show what would be deleted, without deleting
    -y, --yes                  Skip confirmation prompts
    --force                    Force delete non-merged branches
    --protected <list>         Comma-separated list of protected branches
    --default-remote <name>    Default remote name (used if remote=true)
    --cleanup-merged <days>    Filter branches older than N days
    --detect-default           Detect default branch and protect it for this run
    --save-detected-default    Detect and store default branch into local config
    --config <command>         Manage configuration (show | set | edit | reset)
    --no-config                Disable loading configuration files
    -v, --version              Show version
    -h, --help                 Show this help message

Examples
  $ agbd --pattern feature/ --remote
  $ agbd --cleanup-merged 30
  $ agbd --yes --force --pattern 'bugfix/.*'
  $ agbd --config set
  $ agbd --local-only
`;

const schema = {
	pattern: {
		type: "string",
	},
	remote: {
		type: "boolean",
	},
	localOnly: {
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
	detectDefault: {
		type: "boolean",
	},
	saveDetectedDefault: {
		type: "boolean",
	},
	config: {
		type: "string",
	},
	noConfig: {
		type: "boolean",
	},
} as const;

const agbdConfigItems: ConfigItem<AgbdConfig>[] = [
	{ key: "remote", type: "boolean" },
	{ key: "localOnly", type: "boolean" },
	{ key: "dryRun", type: "boolean" },
	{ key: "yes", type: "boolean" },
	{ key: "force", type: "boolean" },
	{ key: "pattern", type: "string" },
	{ key: "protectedBranches", type: "array" },
	{ key: "defaultRemote", type: "string" },
	{ key: "cleanupMergedDays", type: "number" },
];

const AgbdConfigEditor = () => {
	return (
		<AgToolkitConfigEditor
			toolName="agbd"
			configItems={agbdConfigItems}
			defaultConfig={defaultConfig}
			loadConfig={async () => {
				const { config } = await loadConfig({
					toolName: CONFIG_DIR_NAME,
					configFile: CONFIG_FILE_NAME,
					localConfigFile: LOCAL_CONFIG_FILE_NAME,
					defaultConfig,
					validate: validateConfig,
				});
				return config;
			}}
			writeConfig={(config) =>
				writeGlobalConfig(config, CONFIG_DIR_NAME, CONFIG_FILE_NAME)
			}
		/>
	);
};

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
			await handleConfigCommand(cli.flags.config, {
				getConfig: () =>
					loadConfig({
						toolName: CONFIG_DIR_NAME,
						configFile: CONFIG_FILE_NAME,
						localConfigFile: LOCAL_CONFIG_FILE_NAME,
						defaultConfig,
						validate: validateConfig,
					}),
				getGlobalConfigPath: () => GLOBAL_CONFIG_PATH,
				resetGlobalConfig: () =>
					resetGlobalConfig(defaultConfig, CONFIG_DIR_NAME, CONFIG_FILE_NAME),
				ConfigEditorComponent: AgbdConfigEditor,
			});
			return;
		}

		const { config } = cli.flags.noConfig
			? { config: defaultConfig }
			: await loadConfig({
					toolName: CONFIG_DIR_NAME,
					configFile: CONFIG_FILE_NAME,
					localConfigFile: LOCAL_CONFIG_FILE_NAME,
					defaultConfig,
					validate: validateConfig,
				});

		const cliProtected = parseProtected(cli.flags.protected);
		const resolvedDefaultRemote =
			cli.flags.defaultRemote ??
			config.defaultRemote ??
			defaultConfig.defaultRemote;

		const baseProtected =
			cliProtected ??
			config.protectedBranches ??
			defaultConfig.protectedBranches;
		const protectedSet = new Set(baseProtected ?? []);
		if (config.detectedDefaultBranch) {
			protectedSet.add(config.detectedDefaultBranch);
		}

		let detectedDefaultBranch: string | null = null;
		if (cli.flags.detectDefault || cli.flags.saveDetectedDefault) {
			const gitOps = new GitOperations();
			try {
				detectedDefaultBranch = await gitOps.detectDefaultBranch(
					resolvedDefaultRemote,
				);
				if (!detectedDefaultBranch) {
					console.error(
						`Failed to detect default branch for remote '${resolvedDefaultRemote}'.`,
					);
					if (cli.flags.saveDetectedDefault) {
						process.exit(1);
					}
				} else {
					protectedSet.add(detectedDefaultBranch);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Failed to detect default branch: ${message}`);
				if (cli.flags.saveDetectedDefault) {
					process.exit(1);
				}
			}
		}

		if (cli.flags.saveDetectedDefault) {
			if (detectedDefaultBranch) {
				const { path: localConfigPath, config: existingLocalConfig } =
					await loadLocalConfig(LOCAL_CONFIG_FILE_NAME, validateConfig);
				const nextLocalConfig: AgbdConfig = {
					...(existingLocalConfig ?? {}),
					detectedDefaultBranch,
					protectedBranches: Array.from(
						new Set([
							...(existingLocalConfig?.protectedBranches ?? []),
							detectedDefaultBranch,
						]),
					),
				};
				await writeLocalConfig(localConfigPath, nextLocalConfig);
				const action = existingLocalConfig ? "Updated" : "Created";
				console.log(
					`${action} local config at ${localConfigPath} with detected default branch '${detectedDefaultBranch}'.`,
				);
				protectedSet.add(detectedDefaultBranch);
			} else {
				console.error(
					"Cannot save detected default branch because detection failed.",
				);
				process.exit(1);
			}
		}

		const props = {
			pattern: cli.flags.pattern ?? config.pattern,
			remote: cli.flags.remote ?? config.remote,
			localOnly: cli.flags.localOnly ?? config.localOnly,
			dryRun: cli.flags.dryRun ?? config.dryRun,
			yes: cli.flags.yes ?? config.yes,
			force: cli.flags.force ?? config.force,
			protectedBranches:
				protectedSet.size > 0 ? Array.from(protectedSet) : undefined,
			defaultRemote: resolvedDefaultRemote,
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
