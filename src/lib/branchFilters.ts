import { type BranchInfo, matchPattern } from "ag-toolkit";

export const isProtected = (
	branch: BranchInfo,
	protectedList: string[],
): boolean => {
	return protectedList.some(
		(pattern) =>
			matchPattern(branch.name, pattern) ||
			(!pattern.startsWith("/") && branch.name.startsWith(`${pattern}/`)),
	);
};

export const filterByPattern = (branches: BranchInfo[], pattern?: string) => {
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

export const filterByAge = (branches: BranchInfo[], days?: number) => {
	if (!days || days <= 0) {
		return branches;
	}
	const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
	return branches.filter((branch) => {
		if (!branch.lastCommitDate) {
			return false;
		}
		return branch.lastCommitDate.getTime() <= threshold;
	});
};
