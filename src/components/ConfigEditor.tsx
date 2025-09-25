import { Box, Text, useApp, useInput } from "ink";
import SelectInput, { type ItemProps } from "ink-select-input";
import Spinner from "ink-spinner";
import { useEffect, useMemo, useState } from "react";
import {
	type AgbdConfig,
	configKeys,
	defaultConfig,
	getConfig,
	writeGlobalConfig,
} from "../lib/config.js";
import { isDeepEqual } from "../lib/isDeepEqual.js";

type ConfigItemKey = keyof AgbdConfig;

type Status =
	| "loading"
	| "selecting"
	| "editing_boolean"
	| "editing_string"
	| "editing_number"
	| "editing_array"
	| "confirm_quit"
	| "saving"
	| "done";

const Item = ({ label, isSelected }: ItemProps) => (
	<Text color={isSelected ? "cyan" : undefined}>{label}</Text>
);

const BooleanItem = ({ label, isSelected }: ItemProps) => (
	<Text color={isSelected ? "cyan" : undefined}>
		{label === "true" ? (
			<Text color="green">true</Text>
		) : (
			<Text color="red">false</Text>
		)}
	</Text>
);

const formatValue = (value: AgbdConfig[keyof AgbdConfig]) => {
	if (Array.isArray(value)) {
		return value.length > 0 ? value.join(", ") : "(未設定)";
	}
	if (value === undefined || value === null || value === "") {
		return "(未設定)";
	}
	return String(value);
};

export const ConfigEditor = () => {
	const { exit } = useApp();
	const [config, setConfig] = useState<AgbdConfig | null>(null);
	const [initialConfig, setInitialConfig] = useState<AgbdConfig | null>(null);
	const [status, setStatus] = useState<Status>("loading");
	const [editingItem, setEditingItem] = useState<ConfigItemKey | null>(null);
	const [inputBuffer, setInputBuffer] = useState("");
	const [inputError, setInputError] = useState<string | null>(null);

	const isDirty = useMemo(
		() =>
			config && initialConfig ? !isDeepEqual(config, initialConfig) : false,
		[config, initialConfig],
	);

	useEffect(() => {
		(async () => {
			const { config: loadedConfig } = await getConfig();
			const fullConfig = { ...defaultConfig, ...loadedConfig };
			setConfig(fullConfig);
			setInitialConfig(JSON.parse(JSON.stringify(fullConfig)) as AgbdConfig);
			setStatus("selecting");
		})();
	}, []);

	useInput(
		(input) => {
			if (status !== "selecting") {
				return;
			}
			if (input.toLowerCase() === "q") {
				if (isDirty) {
					setStatus("confirm_quit");
				} else {
					exit();
				}
				return;
			}
			if (input.toLowerCase() === "s") {
				handleSave();
			}
		},
		{ isActive: status === "selecting" },
	);

	useInput(
		(input, key) => {
			if (!editingItem) {
				return;
			}
			if (
				status !== "editing_string" &&
				status !== "editing_number" &&
				status !== "editing_array"
			) {
				return;
			}

			if (key.escape) {
				cancelEditing();
				return;
			}

			if (key.return) {
				commitEditing();
				return;
			}

			if (key.backspace || key.delete) {
				setInputBuffer((prev) => prev.slice(0, -1));
				return;
			}

			if (input && !key.ctrl && !key.meta) {
				setInputBuffer((prev) => prev + input);
			}
		},
		{
			isActive:
				status === "editing_string" ||
				status === "editing_number" ||
				status === "editing_array",
		},
	);

	const cancelEditing = () => {
		setEditingItem(null);
		setInputBuffer("");
		setInputError(null);
		setStatus("selecting");
	};

	const commitEditing = () => {
		if (!(config && editingItem)) {
			return;
		}

		if (status === "editing_string") {
			const nextValue = inputBuffer.trim();
			setConfig({
				...config,
				[editingItem]: nextValue.length > 0 ? nextValue : undefined,
			});
			cancelEditing();
			return;
		}

		if (status === "editing_number") {
			const valueText = inputBuffer.trim();
			if (valueText.length === 0) {
				setConfig({ ...config, [editingItem]: undefined });
				cancelEditing();
				return;
			}
			const parsed = Number.parseInt(valueText, 10);
			if (Number.isNaN(parsed) || parsed < 0) {
				setInputError("0 以上の整数を入力してください");
				return;
			}
			setConfig({ ...config, [editingItem]: parsed });
			cancelEditing();
			return;
		}

		if (status === "editing_array") {
			const parts = inputBuffer
				.split(",")
				.map((part) => part.trim())
				.filter((part) => part.length > 0);
			setConfig({ ...config, [editingItem]: parts });
			cancelEditing();
		}
	};

	const items = config
		? configKeys
				.filter((key) => key !== "schemaVersion")
				.map((key) => ({
					label: `${key}: ${formatValue(
						config[key as keyof AgbdConfig] ??
							(defaultConfig as AgbdConfig)[key as keyof AgbdConfig],
					)}`,
					value: key,
				}))
		: [];

	const beginStringEditing = (
		item: ConfigItemKey,
		value: string | undefined,
	) => {
		setEditingItem(item);
		setInputBuffer(value ?? "");
		setInputError(null);
		setStatus("editing_string");
	};

	const beginNumberEditing = (
		item: ConfigItemKey,
		value: number | undefined,
	) => {
		setEditingItem(item);
		setInputBuffer(value !== undefined ? String(value) : "");
		setInputError(null);
		setStatus("editing_number");
	};

	const beginArrayEditing = (
		item: ConfigItemKey,
		value: string[] | undefined,
	) => {
		setEditingItem(item);
		setInputBuffer(value && value.length > 0 ? value.join(", ") : "");
		setInputError(null);
		setStatus("editing_array");
	};

	const handleSelect = (item: { value: ConfigItemKey }) => {
		if (!config) {
			return;
		}
		setEditingItem(item.value);
		const value = config[item.value];
		if (typeof value === "boolean") {
			setStatus("editing_boolean");
			return;
		}
		if (item.value === "protectedBranches") {
			beginArrayEditing(item.value, Array.isArray(value) ? value : undefined);
			return;
		}
		if (item.value === "cleanupMergedDays") {
			beginNumberEditing(
				item.value,
				typeof value === "number" ? value : undefined,
			);
			return;
		}
		beginStringEditing(
			item.value,
			typeof value === "string" ? value : undefined,
		);
	};

	const handleSave = async () => {
		if (config) {
			setStatus("saving");
			await writeGlobalConfig(config);
			setStatus("done");
			exit();
		}
	};

	const handleBooleanChange = (item: { value: boolean }) => {
		if (config && editingItem) {
			setConfig({ ...config, [editingItem]: item.value });
			setEditingItem(null);
			setStatus("selecting");
		}
	};

	const handleQuitConfirm = (item: { value: "yes" | "no" }) => {
		if (item.value === "yes") {
			exit();
		} else {
			setStatus("selecting");
		}
	};

	const renderEditor = () => {
		switch (status) {
			case "editing_boolean":
				return (
					<Box flexDirection="column">
						<Text>"{editingItem}" の値を設定:</Text>
						<SelectInput
							items={[
								{ label: "true", value: true },
								{ label: "false", value: false },
							]}
							onSelect={handleBooleanChange}
							itemComponent={BooleanItem}
						/>
					</Box>
				);
			case "editing_string":
				return (
					<Box flexDirection="column">
						<Text>文字列を入力してください (空欄で未設定):</Text>
						<Text color="cyan">{inputBuffer || "<空>"}</Text>
						<Text color="gray">Enter: 保存 / Esc: キャンセル</Text>
						{inputError && <Text color="red">{inputError}</Text>}
					</Box>
				);
			case "editing_number":
				return (
					<Box flexDirection="column">
						<Text>数値を入力してください (0 以上, 空欄で未設定):</Text>
						<Text color="cyan">{inputBuffer || "<空>"}</Text>
						<Text color="gray">Enter: 保存 / Esc: キャンセル</Text>
						{inputError && <Text color="red">{inputError}</Text>}
					</Box>
				);
			case "editing_array":
				return (
					<Box flexDirection="column">
						<Text>カンマ区切りで値を入力してください:</Text>
						<Text color="cyan">{inputBuffer || "<空>"}</Text>
						<Text color="gray">Enter: 保存 / Esc: キャンセル</Text>
					</Box>
				);
			case "confirm_quit":
				return (
					<Box flexDirection="column">
						<Text color="yellow">未保存の変更があります。終了しますか？</Text>
						<SelectInput
							items={[
								{ label: "いいえ", value: "no" },
								{ label: "はい", value: "yes" },
							]}
							onSelect={handleQuitConfirm}
						/>
					</Box>
				);
			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>AGBD Configuration Editor</Text>
			{status === "loading" && (
				<Text>
					<Spinner /> Loading configuration...
				</Text>
			)}
			{status === "selecting" && config && (
				<>
					<Box marginTop={1}>
						<SelectInput
							items={items}
							onSelect={handleSelect}
							itemComponent={Item}
						/>
					</Box>
					<Box marginTop={1}>
						<Text>
							編集する項目を選択してください。'S' で保存, 'Q' で終了。
							{isDirty && <Text color="yellow"> (未保存)</Text>}
						</Text>
					</Box>
				</>
			)}
			{status !== "selecting" &&
				status !== "loading" &&
				status !== "saving" &&
				renderEditor()}
			{status === "saving" && <Text>💾 Saving configuration...</Text>}
		</Box>
	);
};
