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
}

const BRANCH_LIST_FORMAT =
	"%(refname:short)%00%(committerdate:iso8601)%00%(objectname)%00%(contents:subject)";

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

		const [localMerged, remoteMerged] = await Promise.all([
			this.getMergedSet("local"),
			includeRemote
				? this.getMergedSet("remote")
				: Promise.resolve(new Set<string>()),
		]);

		const localBranches = await this.listBranches("refs/heads/", "local");
		const remoteBranches = includeRemote
			? await this.listBranches("refs/remotes/", "remote")
			: [];

		const withMergedFlags: BranchInfo[] = [
			...localBranches.map((branch) => ({
				...branch,
				isMerged: localMerged.has(branch.ref),
			})),
			...remoteBranches.map((branch) => ({
				...branch,
				isMerged: remoteMerged.has(branch.ref),
			})),
		];

		return withMergedFlags.sort((a, b) => {
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
	): Promise<Array<Omit<BranchInfo, "isMerged">>> {
		const output = await this.git.raw([
			"for-each-ref",
			`--format=${BRANCH_LIST_FORMAT}`,
			refPrefix,
		]);

		return output
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => this.parseBranchLine(line, type))
			.filter(
				(branch): branch is Omit<BranchInfo, "isMerged"> => branch !== null,
			);
	}

	private parseBranchLine(
		line: string,
		type: BranchType,
	): Omit<BranchInfo, "isMerged"> | null {
		const [ref, dateStr, sha, subject] = line.split("\u0000");
		if (!ref || ref.endsWith("/HEAD")) {
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
			const [remote, ...nameParts] = ref.split("/");
			const name = nameParts.join("/");
			if (!(remote && name) || name === "HEAD") {
				return null;
			}
			return {
				ref,
				name,
				type,
				remote,
				lastCommitDate,
				lastCommitSha,
				lastCommitSubject,
			};
		}

		return {
			ref,
			name: ref,
			type,
			lastCommitDate,
			lastCommitSha,
			lastCommitSubject,
		};
	}
}
