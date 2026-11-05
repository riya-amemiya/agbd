import { describe, expect, mock, test } from "bun:test";
import type { BranchInfo } from "ag-toolkit";
import { render } from "ink-testing-library";
import { BranchSelector } from "../components/BranchSelector.js";

const branch = (
	name: string,
	overrides: Partial<BranchInfo> = {},
): BranchInfo => ({
	ref: name,
	name,
	type: "local",
	lastCommitDate: new Date("2024-01-02T00:00:00Z"),
	lastCommitSha: "0000000",
	lastCommitSubject: `subject of ${name}`,
	isMerged: false,
	ahead: 0,
	behind: 0,
	...overrides,
});

const branches = [
	branch("feature/a", { isMerged: true, ahead: 2, behind: 1 }),
	branch("feature/b"),
	branch("origin/bugfix", {
		name: "bugfix",
		type: "remote",
		remote: "origin",
	}),
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const setup = (initialSelectedRefs?: string[]) => {
	const onSubmit = mock((_selected: BranchInfo[]) => {});
	const onCancel = mock(() => {});
	const instance = render(
		<BranchSelector
			branches={branches}
			onSubmit={onSubmit}
			onCancel={onCancel}
			initialSelectedRefs={initialSelectedRefs}
			label="Select branches"
		/>,
	);
	return { ...instance, onSubmit, onCancel };
};

const submittedRefs = (onSubmit: ReturnType<typeof setup>["onSubmit"]) =>
	onSubmit.mock.calls.at(-1)?.[0].map((b) => b.ref);

describe("BranchSelector", () => {
	test("renders every branch with metadata and selects all by default", async () => {
		const { lastFrame, unmount } = setup();
		await tick();
		const frame = lastFrame() ?? "";

		expect(frame).toContain("Select branches");
		expect(frame).toContain("› [x] feature/a (+2, -1) [local] 2024-01-02");
		expect(frame).toContain("[x] feature/b");
		expect(frame).toContain("[x] bugfix [remote(origin)]");
		expect(frame).toContain("- subject of feature/a");
		unmount();
	});

	test("submits all branches when Enter is pressed without changes", async () => {
		const { stdin, onSubmit, unmount } = setup();
		await tick();

		stdin.write("\r");
		await tick();

		expect(submittedRefs(onSubmit)).toEqual([
			"feature/a",
			"feature/b",
			"origin/bugfix",
		]);
		unmount();
	});

	test("toggles the branch under the cursor with Space", async () => {
		const { stdin, onSubmit, lastFrame, unmount } = setup();
		await tick();

		stdin.write("\u001B[B");
		await tick();
		stdin.write(" ");
		await tick();
		expect(lastFrame()).toContain("› [ ] feature/b");

		stdin.write("\r");
		await tick();
		expect(submittedRefs(onSubmit)).toEqual(["feature/a", "origin/bugfix"]);
		unmount();
	});

	test("respects initialSelectedRefs", async () => {
		const { stdin, onSubmit, unmount } = setup(["feature/b"]);
		await tick();

		stdin.write("\r");
		await tick();

		expect(submittedRefs(onSubmit)).toEqual(["feature/b"]);
		unmount();
	});

	test("filters the list as the user types", async () => {
		const { stdin, lastFrame, unmount } = setup();
		await tick();

		stdin.write("bug");
		await tick();
		const frame = lastFrame() ?? "";

		expect(frame).toContain("(Filter: bug)");
		expect(frame).toContain("bugfix");
		expect(frame).not.toContain("feature/a");
		unmount();
	});

	test("shows a message when nothing matches and recovers on backspace", async () => {
		const { stdin, lastFrame, unmount } = setup();
		await tick();

		stdin.write("zzz");
		await tick();
		expect(lastFrame()).toContain("No matching branches found.");

		stdin.write("\u007F");
		stdin.write("\u007F");
		stdin.write("\u007F");
		await tick();
		expect(lastFrame()).toContain("feature/a");
		unmount();
	});

	test("calls onCancel when Escape is pressed", async () => {
		const { stdin, onCancel, onSubmit, unmount } = setup();
		await tick();

		stdin.write("\u001B");
		await tick();

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
		unmount();
	});
});
