import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getGlobalConfigPath } from "ag-toolkit";
import {
	array,
	boolean,
	type InferOutput,
	number,
	object,
	optional,
	safeParse,
	string,
} from "valibot";

const CONFIG_FILE_NAME = "config.json";
const CONFIG_DIR_NAME = "agbd";
const LOCAL_CONFIG_FILE_NAME = ".agbdrc";

const configSchema = object({
	remote: optional(boolean()),
	dryRun: optional(boolean()),
	yes: optional(boolean()),
	force: optional(boolean()),
	pattern: optional(string()),
	protectedBranches: optional(array(string())),
	defaultRemote: optional(string()),
	cleanupMergedDays: optional(number()),
	schemaVersion: optional(number()),
	detectedDefaultBranch: optional(string()),
});

export type AgbdConfig = InferOutput<typeof configSchema>;

export const configKeys: (keyof AgbdConfig)[] = [
	"remote",
	"dryRun",
	"yes",
	"force",
	"pattern",
	"protectedBranches",
	"defaultRemote",
	"cleanupMergedDays",
	"detectedDefaultBranch",
	"schemaVersion",
] as const;

export interface ConfigResult {
	config: AgbdConfig;
	sources: Partial<Record<keyof AgbdConfig, "default" | "global" | "local">>;
}

export const defaultConfig: Omit<AgbdConfig, "schemaVersion"> = {
	remote: false,
	dryRun: false,
	yes: false,
	force: false,
	pattern: undefined,
	protectedBranches: ["main", "master", "develop"],
	defaultRemote: "origin",
	cleanupMergedDays: undefined,
	detectedDefaultBranch: undefined,
};

const validateConfig = (config: unknown): AgbdConfig => {
	const result = safeParse(configSchema, config);
	if (!result.success) {
		const errors = result.issues.map((issue) => {
			const path = issue.path
				?.map((p) => {
					if ("key" in p && p.key !== undefined) {
						return String(p.key);
					}
					if ("index" in p && p.index !== undefined) {
						return String(p.index);
					}
					return p.type;
				})
				.filter(Boolean)
				.join(".");
			return `'${path || "root"}': ${issue.message}`;
		});
		throw new Error(`Configuration errors:\n- ${errors.join("\n- ")}`);
	}
	return result.output;
};

const readConfigFile = async (filePath: string): Promise<AgbdConfig | null> => {
	try {
		const content = await fs.readFile(filePath, "utf-8");
		return validateConfig(JSON.parse(content));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw new Error(
			`Error reading or parsing config file at ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}
`,
		);
	}
};

const findUp = async (
	name: string,
	startDir: string,
): Promise<string | null> => {
	let dir = resolve(startDir);
	const stopDir = resolve(homedir(), "..");

	while (dir !== stopDir) {
		const filePath = join(dir, name);
		try {
			await fs.access(filePath);
			return filePath;
		} catch {
			dir = dirname(dir);
		}
	}
	return null;
};

export const findLocalConfigPath = async (
	cwd: string = process.cwd(),
): Promise<string | null> => {
	return findUp(LOCAL_CONFIG_FILE_NAME, cwd);
};

export const loadLocalConfig = async (
	cwd: string = process.cwd(),
): Promise<{ path: string; config: AgbdConfig | null; exists: boolean }> => {
	const existingPath = await findLocalConfigPath(cwd);
	if (existingPath) {
		return {
			path: existingPath,
			config: await readConfigFile(existingPath),
			exists: true,
		};
	}
	return {
		path: join(cwd, LOCAL_CONFIG_FILE_NAME),
		config: null,
		exists: false,
	};
};

export const getConfig = async (
	cwd: string = process.cwd(),
): Promise<ConfigResult> => {
	const globalConfigPath = join(
		homedir(),
		".config",
		CONFIG_DIR_NAME,
		CONFIG_FILE_NAME,
	);

	const globalConfig = await readConfigFile(globalConfigPath);
	const { config: localConfig } = await loadLocalConfig(cwd);

	const config: AgbdConfig = {
		...defaultConfig,
		...(globalConfig || {}),
		...(localConfig || {}),
	};

	const sources: ConfigResult["sources"] = {};
	for (const key of configKeys) {
		const k = key as keyof AgbdConfig;
		if (localConfig && Object.hasOwn(localConfig, k)) {
			sources[k] = "local";
		} else if (globalConfig && Object.hasOwn(globalConfig, k)) {
			sources[k] = "global";
		} else if (Object.hasOwn(defaultConfig, k)) {
			sources[k] = "default";
		}
	}

	return {
		config,
		sources,
	};
};

export const GLOBAL_CONFIG_PATH = getGlobalConfigPath(
	CONFIG_DIR_NAME,
	CONFIG_FILE_NAME,
);

export const writeGlobalConfig = async (config: AgbdConfig): Promise<void> => {
	try {
		await fs.mkdir(dirname(GLOBAL_CONFIG_PATH), { recursive: true });
		await fs.writeFile(
			GLOBAL_CONFIG_PATH,
			JSON.stringify(config, null, 2),
			"utf-8",
		);
	} catch (error) {
		throw new Error(
			`Failed to write config file: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
};

export const resetGlobalConfig = async (): Promise<void> => {
	await writeGlobalConfig(defaultConfig);
};
