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

export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_DIR_NAME = "agbd";
export const LOCAL_CONFIG_FILE_NAME = ".agbdrc";

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
	localOnly: optional(boolean()),
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
	"localOnly",
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
	localOnly: false,
};

export const validateConfig = (config: unknown): AgbdConfig => {
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

export const GLOBAL_CONFIG_PATH = getGlobalConfigPath(
	CONFIG_DIR_NAME,
	CONFIG_FILE_NAME,
);
