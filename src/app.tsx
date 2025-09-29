import {
	type BranchInfo,
	GitOperations,
	matchPattern,
	sanitizeString,
} from "ag-toolkit";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BranchSelector } from "./components/BranchSelector.js";

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
	| "error"
	| "confirm_force";

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

const SuccessResults = ({
	message,
	results,
}: {
	message: string;
	results: State["results"];
}) => {
	const hasErrors = results.some((r) => !r.success);
	return (
		<Box flexDirection="column">
			<Text color={hasErrors ? "yellow" : "green"}>
				{hasErrors ? "⚠️" : "✅"} {message}
			</Text>
			{results.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{results.map((result) => (
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
	);
};

const PROTECTED_DEFAULT = ["main", "master", "develop", "release"];

const isProtected = (branch: BranchInfo, protectedList: string[]): boolean => {
	return protectedList.some((pattern) => matchPattern(branch.name, pattern));
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
			message: `Error: ${message}`,
		}));
	}, []);

	const buildPlan = useCallback((branches: BranchInfo[]): BranchPlanItem[] => {
		return branches.map((branch) => ({
			branch,
			deleteRemote: branch.type === "remote",
		}));
	}, []);

	const executePlan = useCallback(
		async (plan: BranchPlanItem[], forceOverride?: boolean) => {
			setState((prev) => ({
				...prev,
				status: dryRun ? "success" : "deleting",
				message: dryRun
					? "DRY-RUN: Branches to be deleted"
					: "Deleting branches...",
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
						await gitOps.deleteLocalBranch(branch.name, {
							force: forceOverride || force,
						});
					}
					results.push({ branch, success: true });
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					results.push({ branch, success: false, error: message });
				}
			}

			const failedResults = results.filter((r) => !r.success);
			const unmergedFailures = failedResults.filter((r) =>
				r.error?.includes("not fully merged"),
			);

			if (!force && unmergedFailures.length > 0 && !forceOverride) {
				const unmergedBranches = plan.filter((p) =>
					unmergedFailures.some((f) => f.branch.ref === p.branch.ref),
				);
				setState((prev) => ({
					...prev,
					status: "confirm_force",
					message: `${unmergedBranches.length} branches are not fully merged. Force delete?`,
					plan: unmergedBranches,
					results,
				}));
				return;
			}

			const hasErrors = results.some((result) => !result.success);
			setState((prev) => ({
				...prev,
				status: "success",
				message: dryRun
					? "DRY-RUN complete"
					: hasErrors
						? "Failed to delete some branches"
						: "Deletion complete",
				results,
			}));
		},
		[dryRun, force, gitOps],
	);

	const startInteractiveMode = useCallback((branches: BranchInfo[]) => {
		setState((prev) => ({
			...prev,
			status: "selecting",
			message: "Select branches to delete",
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
					message: "No branches to delete.",
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
				message: `Delete ${plan.length} branches? Press Enter to confirm, Esc to cancel`,
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
					message: "No deletable branches selected (check protection rules).",
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
				message: `Delete ${plan.length} selected branches? Press Enter to confirm, Esc to cancel`,
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
				message: "Nothing to delete.",
			}));
			return;
		}
		executePlan(state.plan);
	}, [executePlan, state.plan]);

	const handleForceConfirm = useCallback(() => {
		if (state.plan.length > 0) {
			executePlan(state.plan, true);
		}
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
						message: "Operation cancelled.",
					}));
					return;
				}
			}

			if (state.status === "confirm_force") {
				if (key.return) {
					handleForceConfirm();
					return;
				}
				if (key.escape) {
					setState((prev) => ({
						...prev,
						status: "error",
						message: "Operation cancelled.",
					}));
				}
				return;
			}

			if (state.status === "selecting" && key.escape) {
				exit();
			}
		},
		{ isActive: true },
	);

	useEffect(() => {
		if (state.status === "success") {
			if (!dryRun) {
				setTimeout(() => exit(), 100);
			}
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
					<Text color="gray">Current branch: {state.currentBranch}</Text>
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
					<Box flexDirection="column">
						<Text color="yellow">❓ {sanitizedMessage}</Text>
						{state.plan.length > 0 && (
							<Box flexDirection="column" marginTop={1} paddingLeft={2}>
								{state.plan.slice(0, 10).map((item) => (
									<Text key={item.branch.ref}>- {item.branch.name}</Text>
								))}
								{state.plan.length > 10 && (
									<Text color="gray">...and {state.plan.length - 10} more</Text>
								)}
							</Box>
						)}
					</Box>
				)}
				{state.status === "confirm_force" && (
					<Box flexDirection="column">
						<Text color="yellow">❓ {sanitizedMessage}</Text>
						{state.plan.length > 0 && (
							<Box flexDirection="column" marginTop={1} paddingLeft={2}>
								{state.plan.map((item) => (
									<Text key={item.branch.ref}>- {item.branch.name}</Text>
								))}
							</Box>
						)}
					</Box>
				)}
				{state.status === "deleting" && (
					<Text color="cyan">
						<Spinner type="dots" /> {sanitizedMessage}
					</Text>
				)}
				{state.status === "success" && (
					<SuccessResults message={sanitizedMessage} results={state.results} />
				)}
				{state.status === "error" && (
					<Text color="red">❌ {sanitizedMessage}</Text>
				)}
			</Box>
		</Box>
	);
}
