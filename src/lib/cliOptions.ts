export const parseProtected = (value: string | undefined) =>
	value
		?.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

export const parseCleanup = (value: string | undefined): number | undefined => {
	if (!value) {
		return undefined;
	}
	const num = Number.parseInt(value, 10);
	if (Number.isNaN(num) || num < 0) {
		throw new Error("--cleanup-merged must be an integer >= 0");
	}
	return num;
};
