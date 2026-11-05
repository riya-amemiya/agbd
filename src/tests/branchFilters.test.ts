import { describe, expect, test } from "bun:test";
import type { BranchInfo } from "ag-toolkit";
import {
	filterByAge,
	filterByPattern,
	isProtected,
} from "../lib/branchFilters.js";

const DAY = 24 * 60 * 60 * 1000;

const branch = (
	name: string,
	overrides: Partial<BranchInfo> = {},
): BranchInfo => ({
	ref: name,
	name,
	type: "local",
	lastCommitDate: new Date(),
	lastCommitSha: "0000000",
	lastCommitSubject: "subject",
	isMerged: true,
	ahead: 0,
	behind: 0,
	...overrides,
});

const names = (branches: BranchInfo[]) => branches.map((b) => b.name);

describe("isProtected", () => {
	const protectedList = ["main", "release", "/^hotfix-\\d+$/"];

	test("matches exact names", () => {
		expect(isProtected(branch("main"), protectedList)).toBe(true);
		expect(isProtected(branch("mainline"), protectedList)).toBe(false);
	});

	test("matches name prefixes followed by a slash", () => {
		expect(isProtected(branch("release/1.0"), protectedList)).toBe(true);
		expect(isProtected(branch("release-1.0"), protectedList)).toBe(false);
	});

	test("matches regex entries without treating them as prefixes", () => {
		expect(isProtected(branch("hotfix-12"), protectedList)).toBe(true);
		expect(isProtected(branch("hotfix-12/sub"), protectedList)).toBe(false);
	});

	test("supports regex flags", () => {
		expect(isProtected(branch("WIP-thing"), ["/^wip/i"])).toBe(true);
	});

	test("returns false for an empty protection list", () => {
		expect(isProtected(branch("main"), [])).toBe(false);
	});

	test("checks the branch name rather than the remote ref", () => {
		const remoteMain = branch("main", {
			ref: "origin/main",
			type: "remote",
			remote: "origin",
		});
		expect(isProtected(remoteMain, ["main"])).toBe(true);
	});
});

describe("filterByPattern", () => {
	const branches = [
		branch("feature/a"),
		branch("feature/b"),
		branch("bugfix/c"),
		branch("odd(name"),
	];

	test("returns all branches when no pattern is given", () => {
		expect(filterByPattern(branches)).toBe(branches);
		expect(filterByPattern(branches, "")).toBe(branches);
	});

	test("filters by regular expression", () => {
		expect(names(filterByPattern(branches, "^feature/"))).toEqual([
			"feature/a",
			"feature/b",
		]);
		expect(names(filterByPattern(branches, "[ac]$"))).toEqual([
			"feature/a",
			"bugfix/c",
		]);
	});

	test("falls back to substring matching for invalid regular expressions", () => {
		expect(names(filterByPattern(branches, "odd("))).toEqual(["odd(name"]);
	});
});

describe("filterByAge", () => {
	const now = Date.now();
	const fresh = branch("fresh", { lastCommitDate: new Date(now - DAY) });
	const stale = branch("stale", { lastCommitDate: new Date(now - 40 * DAY) });
	const unknown = branch("unknown", { lastCommitDate: null });
	const branches = [fresh, stale, unknown];

	test("returns all branches when days is unset or not positive", () => {
		expect(filterByAge(branches)).toBe(branches);
		expect(filterByAge(branches, 0)).toBe(branches);
		expect(filterByAge(branches, -5)).toBe(branches);
	});

	test("keeps only branches older than the threshold", () => {
		expect(names(filterByAge(branches, 30))).toEqual(["stale"]);
	});

	test("drops branches without a commit date", () => {
		expect(names(filterByAge([unknown], 1))).toEqual([]);
	});
});
