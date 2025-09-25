import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BranchSelector } from "./components/BranchSelector.js";
import type { BranchInfo } from "./git.js";
import { GitOperations } from "./git.js";
import { sanitizeString } from "./lib/sanitizeString.js";

interface Props {
	pattern?: string;
	remote?: boolean;
	dryRun?: boolean;
	yes?: boolean;
	force?: boolean;
	protectedBranches?: string[];
	defaultRemote?: string;
	cleanupMergedDays?: number;
}

type Status =
	| "loading"
	| "selecting"
	| "confirm"
	| "deleting"
	| "success"
	| "error";

type Mode = "interactive" | "auto";

interface BranchPlanItem {
	branch: BranchInfo;
	deleteRemote: boolean;
}

interface State {
	status: Status;
	message: string;
	mode: Mode;
	currentBranch?: string;
	availableBranches: BranchInfo[];
	selectedBranches: BranchInfo[];
	plan: BranchPlanItem[];
	results: Array<{ branch: BranchInfo; success: boolean; error?: string }>;
}

const PROTECTED_DEFAULT = ["main", "master", "develop", "release"];

const isProtected = (branch: BranchInfo, protectedList: string[]): boolean => {
	return protectedList.some((pattern) => {
		if (pattern.startsWith("/")) {
			try {
				const regex = new RegExp(
					pattern.slice(1, pattern.lastIndexOf("/")),
					pattern.slice(pattern.lastIndexOf("/") + 1),
				);
				return regex.test(branch.name);
			} catch {
				return false;
			}
		}
		return branch.name === pattern;
	});
};

const filterByPattern = (branches: BranchInfo[], pattern?: string) => {
	if (!pattern) {
		return branches;
	}
	try {
		const regex = new RegExp(pattern);
		return branches.filter((branch) => regex.test(branch.name));
	} catch {
		return branches.filter((branch) => branch.name.includes(pattern));
	}
};

const filterByAge = (branches: BranchInfo[], days?: number) => {
	if (!days || days <= 0) {
		return branches;
	}
	const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
	return branches.filter((branch) => {
		if (!branch.lastCommitDate) {
			return true;
		}
		return branch.lastCommitDate.getTime() <= threshold;
	});
};

export default function App({
	pattern,
	remote,
	dryRun,
	yes,
	force,
	protectedBranches,
	defaultRemote,
	cleanupMergedDays,
}: Props) {
	const { exit } = useApp();
	const gitOps = useMemo(() => new GitOperations(), []);

	const [state, setState] = useState<State>({
		status: "loading",
		message: "Initializing...",
		mode: pattern ? "auto" : "interactive",
		availableBranches: [],
		selectedBranches: [],
		plan: [],
		results: [],
	});

	const stateRef = useRef(state);
	stateRef.current = state;

	const protectedList = useMemo(() => {
		if (protectedBranches && protectedBranches.length > 0) {
			return protectedBranches;
		}
		return PROTECTED_DEFAULT;
	}, [protectedBranches]);

	const handleError = useCallback((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		setState((prev) => ({
			...prev,
			status: "error",
			message: `エラー: ${message}`,
		}));
	}, []);

	const buildPlan = useCallback((branches: BranchInfo[]): BranchPlanItem[] => {
		return branches.map((branch) => ({
			branch,
			deleteRemote: branch.type === "remote",
		}));
	}, []);

	const executePlan = useCallback(
		async (plan: BranchPlanItem[]) => {
			setState((prev) => ({
				...prev,
				status: dryRun ? "success" : "deleting",
				message: dryRun
					? "DRY-RUN: 削除対象ブランチ"
					: "ブランチを削除しています...",
			}));

			const results: State["results"] = [];
			for (const item of plan) {
				const { branch } = item;
				if (dryRun) {
					results.push({ branch, success: true });
					continue;
				}
				try {
					if (branch.type === "remote" && branch.remote) {
						await gitOps.deleteRemoteBranch({
							remote: branch.remote,
							name: branch.name,
						});
					} else {
						await gitOps.deleteLocalBranch(branch.name, { force });
					}
					results.push({ branch, success: true });
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					results.push({ branch, success: false, error: message });
				}
			}

			setState((prev) => ({
				...prev,
				status: "success",
				message: dryRun ? "DRY-RUN 完了" : "削除が完了しました",
				results,
			}));
		},
		[dryRun, force, gitOps],
	);

	const startInteractiveMode = useCallback((branches: BranchInfo[]) => {
		setState((prev) => ({
			...prev,
			status: "selecting",
			message: "削除するブランチを選択してください",
			availableBranches: branches,
		}));
	}, []);

	const startAutoMode = useCallback(
		(branches: BranchInfo[]) => {
			const filteredPattern = filterByPattern(branches, pattern);
			const filteredAge = filterByAge(filteredPattern, cleanupMergedDays);
			const filteredProtection = filteredAge.filter(
				(branch) => !isProtected(branch, protectedList),
			);
			const plan = buildPlan(filteredProtection);

			if (plan.length === 0) {
				setState((prev) => ({
					...prev,
					status: "success",
					message: "削除対象のブランチはありません",
					results: [],
				}));
				return;
			}

			if (yes) {
				executePlan(plan);
				return;
			}

			setState((prev) => ({
				...prev,
				status: "confirm",
				message: `対象ブランチ ${plan.length} 件を削除しますか？ Enter: 実行 / Esc: 中断`,
				plan,
			}));
		},
		[buildPlan, cleanupMergedDays, executePlan, pattern, protectedList, yes],
	);

	useEffect(() => {
		(async () => {
			try {
				const [currentBranch, infos] = await Promise.all([
					gitOps.getCurrentBranch(),
					gitOps.getBranchInfos({ includeRemote: remote }),
				]);
				const filtered = infos.filter(
					(branch) => branch.name !== currentBranch,
				);
				const finalList = defaultRemote
					? filtered.map((branch) =>
							branch.type === "remote" && !branch.remote
								? { ...branch, remote: defaultRemote }
								: branch,
						)
					: filtered;
				if (stateRef.current.mode === "interactive") {
					startInteractiveMode(finalList);
				} else {
					startAutoMode(finalList);
				}
				setState((prev) => ({ ...prev, currentBranch }));
			} catch (error) {
				handleError(error);
			}
		})();
	}, [
		defaultRemote,
		gitOps,
		handleError,
		remote,
		startAutoMode,
		startInteractiveMode,
	]);

	const handleSelectionSubmit = useCallback(
		(selected: BranchInfo[]) => {
			const filtered = selected.filter((branch) => {
				if (isProtected(branch, protectedList)) {
					return false;
				}
				if (
					!force &&
					state.currentBranch &&
					branch.name === state.currentBranch
				) {
					return false;
				}
				return true;
			});
			const plan = buildPlan(filtered);
			if (plan.length === 0) {
				setState((prev) => ({
					...prev,
					status: "error",
					message:
						"削除可能なブランチが選択されていません (保護設定を確認してください)",
				}));
				return;
			}
			if (yes) {
				executePlan(plan);
				return;
			}
			setState((prev) => ({
				...prev,
				status: "confirm",
				message: `選択されたブランチ ${plan.length} 件を削除しますか？ Enter: 実行 / Esc: キャンセル`,
				plan,
				selectedBranches: filtered,
			}));
		},
		[buildPlan, executePlan, force, protectedList, state.currentBranch, yes],
	);

	const handleConfirm = useCallback(() => {
		if (state.plan.length === 0) {
			setState((prev) => ({
				...prev,
				status: "error",
				message: "削除対象がありません",
			}));
			return;
		}
		executePlan(state.plan);
	}, [executePlan, state.plan]);

	useInput(
		(_input, key) => {
			if (state.status === "confirm") {
				if (key.return) {
					handleConfirm();
					return;
				}
				if (key.escape) {
					setState((prev) => ({
						...prev,
						status: "error",
						message: "操作をキャンセルしました",
					}));
					return;
				}
			}

			if (state.status === "selecting" && key.escape) {
				exit();
			}

			if (state.status === "success" && key.return) {
				exit();
			}
		},
		{ isActive: true },
	);

	useEffect(() => {
		if (state.status === "success" && dryRun) {
			return;
		}
		if (state.status === "error") {
			exit(new Error(state.message));
		}
	}, [dryRun, exit, state.status, state.message]);

	const sanitizedMessage = sanitizeString(state.message);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="blue" bold>
					Auto Git Branch Delete
				</Text>
			</Box>

			{state.currentBranch && (
				<Box marginBottom={1}>
					<Text color="gray">現在のブランチ: {state.currentBranch}</Text>
				</Box>
			)}

			<Box>
				{state.status === "loading" && (
					<Text>
						<Spinner type="dots" /> {sanitizedMessage}
					</Text>
				)}
				{state.status === "selecting" && (
					<BranchSelector
						branches={state.availableBranches}
						onSubmit={handleSelectionSubmit}
						onCancel={() => exit()}
						label={state.message}
					/>
				)}
				{state.status === "confirm" && (
					<Text color="yellow">❓ {sanitizedMessage}</Text>
				)}
				{state.status === "deleting" && (
					<Text color="cyan">
						<Spinner type="dots" /> {sanitizedMessage}
					</Text>
				)}
				{state.status === "success" && (
					<Box flexDirection="column">
						<Text color="green">✅ {sanitizedMessage}</Text>
						{state.results.length > 0 && (
							<Box flexDirection="column" marginTop={1}>
								{state.results.map((result) => (
									<Text
										key={result.branch.ref}
										color={result.success ? "green" : "red"}
									>
										{result.success ? "✓" : "✕"} {result.branch.name}
										{result.error ? ` - ${result.error}` : ""}
									</Text>
								))}
							</Box>
						)}
					</Box>
				)}
				{state.status === "error" && (
					<Text color="red">❌ {sanitizedMessage}</Text>
				)}
			</Box>
		</Box>
	);
}
