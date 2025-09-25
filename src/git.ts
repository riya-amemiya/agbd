import { type SimpleGit, type SimpleGitOptions, simpleGit } from "simple-git";
import { isValidBranchName } from "./lib/isValidBranchName.js";

export type BranchType = "local" | "remote";

export interface BranchInfo {
	ref: string;
	name: string;
	type: BranchType;
	remote?: string;
	lastCommitDate: Date | null;
	lastCommitSha: string | null;
	lastCommitSubject: string | null;
	isMerged: boolean;
	ahead: number;
	behind: number;
}

const BRANCH_LIST_FORMAT =
	"%(refname)%00%(committerdate:iso8601)%00%(objectname)%00%(contents:subject)";

export class GitOperations {
	private git: SimpleGit;

	constructor(workingDir?: string) {
		const options: SimpleGitOptions = {
			baseDir: workingDir || process.cwd(),
			binary: "git",
			maxConcurrentProcesses: 1,
			config: [],
			trimmed: false,
		};
		this.git = simpleGit(options);
	}

	async getCurrentBranch(): Promise<string> {
		const status = await this.git.status();
		return status.current || "HEAD";
	}

	async isWorkdirClean(): Promise<boolean> {
		const status = await this.git.status();
		return status.isClean();
	}

	async fetchAll(): Promise<void> {
		await this.git.fetch(["--all"]);
	}

	async getBranchInfos(
		options: { includeRemote?: boolean } = {},
	): Promise<BranchInfo[]> {
		const includeRemote = options.includeRemote === true;

		const [localMerged, remoteMerged, baseBranch] = await Promise.all([
			this.getMergedSet("local"),
			includeRemote
				? this.getMergedSet("remote")
				: Promise.resolve(new Set<string>()),
			this.getBaseBranch(),
		]);

		const localBranches = await this.listBranches("refs/heads/", "local");
		const remoteBranches = includeRemote
			? await this.listBranches("refs/remotes/", "remote")
			: [];

		const allBranches: Array<
			Omit<BranchInfo, "isMerged" | "ahead" | "behind">
		> = [...localBranches, ...remoteBranches];

		const withCommitCounts = await Promise.all(
			allBranches.map(async (branch) => {
				const { ahead, behind } = baseBranch
					? await this.getAheadBehind(branch.ref, baseBranch)
					: { ahead: 0, behind: 0 };
				const isMerged =
					branch.type === "local"
						? localMerged.has(branch.ref)
						: remoteMerged.has(branch.ref);
				return { ...branch, isMerged, ahead, behind };
			}),
		);

		return withCommitCounts.sort((a, b) => {
			if (a.type !== b.type) {
				return a.type === "local" ? -1 : 1;
			}
			const dateA = a.lastCommitDate?.getTime() ?? 0;
			const dateB = b.lastCommitDate?.getTime() ?? 0;
			return dateB - dateA;
		});
	}

	async deleteLocalBranch(
		branch: string,
		options: { force?: boolean } = {},
	): Promise<void> {
		if (!isValidBranchName(branch)) {
			throw new Error(`Invalid branch name: ${branch}`);
		}
		const args = ["branch", options.force ? "-D" : "-d", branch];
		await this.git.raw(args);
	}

	async deleteRemoteBranch(branch: {
		remote: string;
		name: string;
	}): Promise<void> {
		const { remote, name } = branch;
		if (!isValidBranchName(name)) {
			throw new Error(`Invalid branch name: ${name}`);
		}
		await this.git.push([remote, "--delete", name]);
	}

	private async getBaseBranch(): Promise<string | null> {
		const { all: remoteBranches } = await this.git.branch(["-r"]);
		const defaultRemoteBranches = [
			"origin/main",
			"origin/master",
			"origin/develop",
		];
		for (const branch of defaultRemoteBranches) {
			if (remoteBranches.includes(branch.trim())) {
				return branch.trim();
			}
		}

		const { all: localBranches } = await this.git.branchLocal();
		const defaultLocalBranches = ["main", "master", "develop"];
		for (const branch of defaultLocalBranches) {
			if (localBranches.includes(branch)) {
				return branch;
			}
		}

		return null;
	}

	private async getAheadBehind(
		branch: string,
		base: string,
	): Promise<{ ahead: number; behind: number }> {
		if (branch === base) {
			return { ahead: 0, behind: 0 };
		}
		try {
			// `git rev-list --left-right --count base...branch` returns "behind ahead"
			const result = await this.git.raw([
				"rev-list",
				"--left-right",
				"--count",
				`${base}...${branch}`,
			]);
			const [behind, ahead] = result.trim().split("\t").map(Number);
			return { ahead: ahead ?? 0, behind: behind ?? 0 };
		} catch {
			return { ahead: 0, behind: 0 };
		}
	}

	private async getMergedSet(type: BranchType): Promise<Set<string>> {
		const args =
			type === "local" ? ["branch", "--merged"] : ["branch", "-r", "--merged"];
		const output = await this.git.raw(args);
		const lines = output
			.split("\n")
			.map((line) => line.replace("*", "").trim());
		const filtered = lines
			.filter(Boolean)
			.filter((name) => !name.includes(" -> "))
			.map((name) => (type === "remote" ? name : name));
		return new Set(filtered);
	}

	private async listBranches(
		refPrefix: string,
		type: BranchType,
	): Promise<Array<Omit<BranchInfo, "isMerged" | "ahead" | "behind">>> {
		const output = await this.git.raw([
			"for-each-ref",
			`--format=${BRANCH_LIST_FORMAT.replace("%(refname:short)", "%(refname)")}`,
			refPrefix,
		]);

		return output
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => this.parseBranchLine(line, type))
			.filter(
				(branch): branch is Omit<BranchInfo, "isMerged" | "ahead" | "behind"> =>
					branch !== null,
			);
	}

	private parseBranchLine(
		line: string,
		type: BranchType,
	): Omit<BranchInfo, "isMerged" | "ahead" | "behind"> | null {
		const [ref, dateStr, sha, subject] = line.split("\u0000");

		const shortRef =
			ref?.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, "") ?? "";

		if (!shortRef || shortRef.endsWith("/HEAD")) {
			return null;
		}

		let lastCommitDate: Date | null = null;
		if (dateStr) {
			const parsed = new Date(dateStr);
			if (!Number.isNaN(parsed.getTime())) {
				lastCommitDate = parsed;
			}
		}

		const trimmedSubject = subject?.trim() ?? null;
		const lastCommitSubject = trimmedSubject?.length ? trimmedSubject : null;
		const lastCommitSha = sha?.trim()?.length ? sha.trim() : null;

		if (type === "remote") {
			const [remote, ...nameParts] = shortRef.split("/");
			const name = nameParts.join("/");
			if (!(remote && name) || name === "HEAD") {
				return null;
			}
			return {
				ref: shortRef,
				name,
				type,
				remote,
				lastCommitDate,
				lastCommitSha,
				lastCommitSubject,
			};
		}

		return {
			ref: shortRef,
			name: shortRef,
			type,
			lastCommitDate,
			lastCommitSha,
			lastCommitSubject,
		};
	}
}
