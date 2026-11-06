import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_DIR_NAME,
	CONFIG_FILE_NAME,
	configKeys,
	defaultConfig,
	GLOBAL_CONFIG_PATH,
	LOCAL_CONFIG_FILE_NAME,
	validateConfig,
} from "../lib/config.js";

describe("validateConfig", () => {
	test("accepts an empty object", () => {
		expect(validateConfig({})).toEqual({});
	});

	test("accepts a fully populated config", () => {
		const config = {
			remote: true,
			dryRun: true,
			yes: false,
			force: false,
			pattern: "^feature/",
			protectedBranches: ["main", "release/"],
			defaultRemote: "upstream",
			cleanupMergedDays: 30,
			schemaVersion: 1,
			detectedDefaultBranch: "main",
			localOnly: true,
		};
		expect(validateConfig(config)).toEqual(config);
	});

	test("accepts the default config", () => {
		expect(() => validateConfig(defaultConfig)).not.toThrow();
	});

	test("reports the key of an invalid value", () => {
		expect(() => validateConfig({ remote: "yes" })).toThrow(
			/Configuration errors:\n- 'remote':/,
		);
	});

	test("reports the index path of an invalid array element", () => {
		expect(() => validateConfig({ protectedBranches: ["main", 1] })).toThrow(
			/'protectedBranches\.1':/,
		);
	});

	test("reports every invalid key", () => {
		const error = (() => {
			try {
				validateConfig({ remote: 1, cleanupMergedDays: "30" });
				return null;
			} catch (e) {
				return e as Error;
			}
		})();
		expect(error?.message).toContain("'remote':");
		expect(error?.message).toContain("'cleanupMergedDays':");
	});

	test("rejects non-object input at the root", () => {
		expect(() => validateConfig("config")).toThrow(/'root':/);
		expect(() => validateConfig(null)).toThrow(/'root':/);
	});
});

describe("config constants", () => {
	test("protects common long-lived branches by default", () => {
		expect(defaultConfig.protectedBranches).toEqual([
			"main",
			"master",
			"develop",
			"release",
		]);
	});

	test("defaults to non-destructive behaviour", () => {
		expect(defaultConfig).toMatchObject({
			remote: false,
			dryRun: false,
			yes: false,
			force: false,
			localOnly: false,
			defaultRemote: "origin",
		});
	});

	test("lists every default key in configKeys", () => {
		for (const key of Object.keys(defaultConfig)) {
			expect(configKeys).toContain(key as (typeof configKeys)[number]);
		}
		expect(configKeys).toContain("schemaVersion");
	});

	test("stores the global config under the tool directory", () => {
		expect(GLOBAL_CONFIG_PATH).toBe(
			join(homedir(), ".config", CONFIG_DIR_NAME, CONFIG_FILE_NAME),
		);
		expect(LOCAL_CONFIG_FILE_NAME).toBe(".agbdrc");
	});
});
