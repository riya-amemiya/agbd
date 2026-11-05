import { describe, expect, test } from "bun:test";
import { parseCleanup, parseProtected } from "../lib/cliOptions.js";

describe("parseProtected", () => {
	test("returns undefined when the flag is not given", () => {
		expect(parseProtected(undefined)).toBeUndefined();
	});

	test("splits on commas and trims entries", () => {
		expect(parseProtected("main, develop ,release/")).toEqual([
			"main",
			"develop",
			"release/",
		]);
	});

	test("drops empty entries", () => {
		expect(parseProtected(",main,, ,")).toEqual(["main"]);
		expect(parseProtected("")).toEqual([]);
	});

	test("keeps regex entries intact", () => {
		expect(parseProtected("/^hotfix-\\d+$/i")).toEqual(["/^hotfix-\\d+$/i"]);
	});
});

describe("parseCleanup", () => {
	test("returns undefined when the flag is not given", () => {
		expect(parseCleanup(undefined)).toBeUndefined();
		expect(parseCleanup("")).toBeUndefined();
	});

	test("parses non-negative integers", () => {
		expect(parseCleanup("0")).toBe(0);
		expect(parseCleanup("30")).toBe(30);
	});

	test("rejects negative and non-numeric values", () => {
		expect(() => parseCleanup("-1")).toThrow(
			"--cleanup-merged must be an integer >= 0",
		);
		expect(() => parseCleanup("abc")).toThrow(
			"--cleanup-merged must be an integer >= 0",
		);
	});
});
