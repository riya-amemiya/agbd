import { type BranchInfo, formatDate } from "ag-toolkit";
import type { Key } from "ink";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
	branches: BranchInfo[];
	onSubmit: (selected: BranchInfo[]) => void;
	onCancel: () => void;
	initialSelectedRefs?: string[];
	label?: string;
};

const SEARCHABLE_FIELDS = ["name", "ref", "lastCommitSubject"] as const;

export const BranchSelector = ({
	branches,
	onSubmit,
	onCancel,
	initialSelectedRefs,
	label,
}: Props) => {
	const [cursor, setCursor] = useState(0);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedRefs, setSelectedRefs] = useState<Set<string>>(
		() =>
			new Set(
				initialSelectedRefs && initialSelectedRefs.length > 0
					? initialSelectedRefs
					: branches.map((branch) => branch.ref),
			),
	);

	useEffect(() => {
		setSelectedRefs(
			new Set(
				initialSelectedRefs && initialSelectedRefs.length > 0
					? initialSelectedRefs
					: branches.map((branch) => branch.ref),
			),
		);
		setCursor(0);
	}, [branches, initialSelectedRefs]);

	const filteredBranches = useMemo(() => {
		if (!searchTerm.trim()) {
			return branches;
		}
		const terms = searchTerm
			.toLowerCase()
			.split(/\s+/)
			.filter((term) => term.length > 0);
		if (terms.length === 0) {
			return branches;
		}
		return branches.filter((branch) =>
			terms.every(
				(term) =>
					SEARCHABLE_FIELDS.some((field) => {
						const value = branch[field];
						if (!value) {
							return false;
						}
						return value.toLowerCase().includes(term);
					}) || branch.remote?.toLowerCase().includes(term),
			),
		);
	}, [branches, searchTerm]);

	const visibleBranches = filteredBranches.slice(0, 200);

	const handleInput = useCallback(
		(input: string, key: Key) => {
			if (key.escape) {
				onCancel();
				return;
			}

			if (filteredBranches.length === 0) {
				if (key.backspace || key.delete) {
					setSearchTerm((prev) => prev.slice(0, -1));
				}
				if (!(key.ctrl || key.meta) && input) {
					setSearchTerm((prev) => prev + input);
				}
				return;
			}

			if (key.upArrow) {
				setCursor(
					(prev) =>
						(prev - 1 + filteredBranches.length) % filteredBranches.length,
				);
				return;
			}
			if (key.downArrow) {
				setCursor((prev) => (prev + 1) % filteredBranches.length);
				return;
			}
			if (key.pageDown) {
				setCursor((prev) => Math.min(prev + 10, filteredBranches.length - 1));
				return;
			}
			if (key.pageUp) {
				setCursor((prev) => Math.max(prev - 10, 0));
				return;
			}

			if (input === " ") {
				const currentBranch = filteredBranches[cursor];
				if (currentBranch) {
					setSelectedRefs((prev) => {
						const next = new Set(prev);
						if (next.has(currentBranch.ref)) {
							next.delete(currentBranch.ref);
						} else {
							next.add(currentBranch.ref);
						}
						return next;
					});
				}
				return;
			}

			if (key.return) {
				const selected = branches.filter((branch) =>
					selectedRefs.has(branch.ref),
				);
				onSubmit(selected);
				return;
			}

			if (key.backspace || key.delete) {
				setSearchTerm((prev) => prev.slice(0, -1));
				return;
			}

			if (input && !key.ctrl && !key.meta) {
				setSearchTerm((prev) => prev + input);
			}
		},
		[branches, cursor, filteredBranches, onCancel, onSubmit, selectedRefs],
	);

	useInput(handleInput, { isActive: true });

	return (
		<Box flexDirection="column">
			{label && (
				<Text>
					{label}
					{searchTerm && <Text color="gray"> (Filter: {searchTerm})</Text>}
				</Text>
			)}
			{filteredBranches.length === 0 ? (
				<Text color="yellow">No matching branches found.</Text>
			) : (
				<Box flexDirection="column">
					{visibleBranches.map((branch) => {
						const isActive = filteredBranches.indexOf(branch) === cursor;
						const isSelected = selectedRefs.has(branch.ref);
						const mark = isActive ? "›" : " ";
						const checkbox = isSelected ? "[x]" : "[ ]";
						const typeLabel =
							branch.type === "local"
								? "local"
								: `remote(${branch.remote ?? "?"})`;
						const mergedLabel = branch.isMerged ? "✓" : " ";
						return (
							<Text key={branch.ref} color={isActive ? "cyan" : undefined}>
								{mark} {checkbox} {branch.name}
								{(branch.ahead > 0 || branch.behind > 0) && (
									<Text color="yellow">
										{" "}
										({branch.ahead > 0 && `+${branch.ahead}`}
										{branch.ahead > 0 && branch.behind > 0 && ", "}
										{branch.behind > 0 && `-${branch.behind}`})
									</Text>
								)}
								<Text color="gray"> [{typeLabel}]</Text>{" "}
								<Text color="gray">{formatDate(branch.lastCommitDate)}</Text>{" "}
								{branch.lastCommitSubject
									? `- ${branch.lastCommitSubject}`
									: ""}{" "}
								<Text color="green">{mergedLabel}</Text>
							</Text>
						);
					})}
					{filteredBranches.length > visibleBranches.length && (
						<Text color="gray">
							...and {filteredBranches.length - visibleBranches.length} more
						</Text>
					)}
				</Box>
			)}
			<Box marginTop={1}>
				<Text color="gray">
					Space: select / Enter: submit / Esc: cancel / ↑↓: navigate / Type:
					filter
				</Text>
			</Box>
		</Box>
	);
};
