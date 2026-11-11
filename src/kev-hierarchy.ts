import { ForegroundApp, ScreenElement, ScreenSize } from "./robot";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_KEV_MODEL = "kev:4b-q4_K_M";
export const DEFAULT_KEEP_ALIVE = "30m";

export const PREFERRED_KEV_MODELS = [
	"kev:4b-q4_K_M",
	"kev:4b-q8_0",
	"kev:4b-mlx-bf16",
	"kev:4b-bf16",
	"kev:0.8b-mxfp8",
	"kev:0.8b-mlx-bf16",
	"kev:0.8b-q8_0",
	"kev:0.8b-bf16",
	"kev:9b-nvfp4",
];

const KEV_WARM_TIMEOUT_MS = 4000;
const KEV_COLD_TIMEOUT_MS = 10000;
const KEV_FAIL_LIMIT = 2;
const KEV_COOLDOWN_MS = 60000;
const MAX_CANDIDATE_ELEMENTS = 18;
const MAX_OPTION_LABEL_CHARS = 36;

export interface CompactElement {
	ref?: string;
	type: string;
	label: string;
	value?: string;
	identifier?: string;
	tapX: number;
	tapY: number;
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	focused?: boolean;
	selected?: boolean;
	checked?: boolean;
	enabled?: boolean;
	interactive: boolean;
}

export interface CompactHierarchy {
	actionable: CompactElement[];
	informational: CompactElement[];
	stateText: string;
}

export interface KevCandidateMatch {
	ref: string;
	probability: number;
	element: CompactElement;
}

export type ScreenComplexityLevel = "simple" | "moderate" | "complex";

export interface KevScreenAnalysis {
	model: string;
	elapsedMs: number;
	inputTokens: number;
	outputTokens: number;
	screenType: string;
	screenTypeConfidence: number;
	screenTypeProbabilities: Record<string, number>;
	screenComplexity: ScreenComplexityLevel;
	screenComplexityScore: number;
	hierarchySufficient: boolean;
	hierarchySufficientProb: number;
	targetMatch?: {
		goal: string;
		choice: string;
		confidence: number;
		element?: CompactElement;
		topCandidates: KevCandidateMatch[];
	};
}

interface SystemOneQuestion {
	type: "choice" | "noul" | "score";
	instructions: string;
	criteria: Record<string, string> | string[];
}

interface SystemOneResponse {
	model?: string;
	answers?: Record<string, {
		type: string;
		choice?: string;
		probabilities?: Record<string, number>;
		confidence?: number;
		noul?: number;
		score?: number;
	}>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
	};
}

const INTERACTIVE_TYPES = new Set([
	// iOS types
	"Button",
	"Icon",
	"TextField",
	"SecureTextField",
	"SearchField",
	"Switch",
	"Toggle",
	"Slider",
	"PageIndicator",
	"Link",
	"Tab",
	"TabBar",
	"SegmentedControl",
	"Picker",
	"PickerWheel",
	"Stepper",
	"DatePicker",
	"MenuItem",
	"Cell",

	// Android types
	"ImageButton",
	"EditText",
	"CheckBox",
	"RadioButton",
	"ToggleButton",
	"CompoundButton",
	"CheckedTextView",
	"Spinner",
	"SeekBar",
	"RatingBar",
	"FloatingActionButton",
	"Chip",
]);

const DECORATIVE_NAMES = new Set([
	"chevron",
	"chevron.forward",
	"chevron.right",
	"chevron.left",
	"chevron.down",
	"chevron.up",
	"label-view",
	"magnifyingglass",
	"spotlight-pill",
	"statusBarBackground",
	"navigationBarBackground",
	"android:id/statusBarBackground",
	"android:id/navigationBarBackground",
]);

const INTERACTIVE_RESOURCE_ID_REGEX = /(?:button|tab|search|checkbox|switch|edit|input|fab|action|settings:id\/|android:id\/title)/i;

const TEXT_OR_VIEW_TYPES = new Set([
	"TextView",
	"View",
	"ViewGroup",
	"LinearLayout",
	"StaticText",
]);

const SCREEN_TYPE_CRITERIA: Record<string, string> = {
	home_screen: "Device home screen or app launcher grid with app icons and dock",
	settings_menu: "System or application settings list with configuration rows and toggles",
	list_or_feed: "Scrollable list of items, reminders, contacts, messages, or feed entries",
	form_or_input: "Data entry form, login screen, search input, or text editing view",
	browser_or_web: "Web browser displaying a webpage and address bar",
	dialog_or_alert: "Modal alert, permission prompt, confirmation dialog, or action sheet",
	detail_or_content: "Detail screen, article, about info page, or media content view",
};

const SCREEN_COMPLEXITY_CRITERIA: string[] = [
	"simple: Splash screen, single alert dialog, or screen with 1 to 5 basic controls",
	"moderate: Standard app screen, settings menu, or form with 6 to 15 interactive controls",
	"complex: Dense multi-section screen, data table, or complex view with many controls",
];

const shortType = (type: string): string => {
	let t = type.substring(type.lastIndexOf(".") + 1);
	if (t.startsWith("XCUIElementType")) {
		t = t.substring("XCUIElementType".length);
	}
	return t;
};

const isDecorative = (el: ScreenElement, label: string): boolean => {
	if (DECORATIVE_NAMES.has(label) || label === "Home screen icons") {
		return true;
	}
	if (el.identifier && (DECORATIVE_NAMES.has(el.identifier) || el.identifier.endsWith(":id/statusBarBackground") || el.identifier.endsWith(":id/navigationBarBackground"))) {
		return true;
	}
	if (el.name && DECORATIVE_NAMES.has(el.name)) {
		return true;
	}
	return false;
};

const isExplicitlyInteractive = (el: ScreenElement, type: string): boolean => {
	if (INTERACTIVE_TYPES.has(type)) {
		return true;
	}
	if (el.checked !== undefined || el.selected === true || el.focused === true) {
		return true;
	}
	if (el.identifier && INTERACTIVE_RESOURCE_ID_REGEX.test(el.identifier)) {
		return true;
	}
	return false;
};

export const isHostedDecisionModel = (model?: string): boolean => {
	return Boolean(model && model.startsWith("saas-"));
};

export const selectAvailableKevModel = (
	installedModels: string[],
	preferredModel?: string
): string | null => {
	const installedSet = new Set(installedModels);
	if (preferredModel && installedSet.has(preferredModel)) {
		return preferredModel;
	}

	for (const candidate of PREFERRED_KEV_MODELS) {
		if (installedSet.has(candidate)) {
			return candidate;
		}
	}

	const anyKev = installedModels.find(m => m.startsWith("kev:") && !m.startsWith("kev-cpu:"));
	return anyKev || null;
};

export const mapComplexityScore = (
	score: number,
	probabilities: Record<string, number> = {}
): ScreenComplexityLevel => {
	const levels: ScreenComplexityLevel[] = ["simple", "moderate", "complex"];
	let bestIdx = 0;
	let bestProb = -1;
	for (let i = 0; i < 3; i++) {
		const p = probabilities[String(i)] ?? 0;
		if (p > bestProb) {
			bestProb = p;
			bestIdx = i;
		}
	}

	if (levels[bestIdx] === "complex" && score >= 1.0) {
		return "complex";
	}
	if (score < 0.5) {
		return "simple";
	}
	if (score < 1.06) {
		return "moderate";
	}
	return "complex";
};

class KevHealthTracker {
	private fails = new Map<string, number>();
	private cooldownUntil = new Map<string, number>();
	private warmModels = new Set<string>();

	public isWarm(model: string): boolean {
		return this.warmModels.has(model);
	}

	public timeoutMs(model: string): number {
		return isHostedDecisionModel(model) || this.isWarm(model)
			? KEV_WARM_TIMEOUT_MS
			: KEV_COLD_TIMEOUT_MS;
	}

	public isCooling(model: string): boolean {
		const until = this.cooldownUntil.get(model);
		if (until === undefined) {
			return false;
		}
		if (Date.now() >= until) {
			this.cooldownUntil.delete(model);
			this.fails.delete(model);
			this.warmModels.delete(model);
			return false;
		}
		return true;
	}

	public recordFailure(model: string): void {
		const count = (this.fails.get(model) ?? 0) + 1;
		this.fails.set(model, count);
		if (count >= KEV_FAIL_LIMIT) {
			this.cooldownUntil.set(model, Date.now() + KEV_COOLDOWN_MS);
		}
	}

	public recordSuccess(model: string): void {
		this.fails.delete(model);
		this.cooldownUntil.delete(model);
		this.warmModels.add(model);
	}

	public reset(): void {
		this.fails.clear();
		this.cooldownUntil.clear();
		this.warmModels.clear();
	}
}

export const kevHealth = new KevHealthTracker();

export const getOllamaUrl = (): string => {
	return (process.env.MOBILEMCP_OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
};

export const getKevModel = (): string => {
	return process.env.MOBILEMCP_SYSTEMONE_MODEL || DEFAULT_KEV_MODEL;
};

export const compactHierarchy = (
	elements: ScreenElement[],
	screenSize: ScreenSize,
	foregroundApp?: ForegroundApp
): CompactHierarchy => {
	const actionable: CompactElement[] = [];
	const informational: CompactElement[] = [];
	const actionableLabels = new Set<string>();
	const seenKeys = new Set<string>();
	const actionableIndexByKey = new Map<string, number>();

	const existingRefs = new Set(elements.map(e => e.ref).filter((r): r is string => Boolean(r)));
	let syntheticCounter = 1;
	const assignRef = (rawRef?: string): string => {
		if (rawRef) {
			return rawRef;
		}
		while (existingRefs.has(`@e${syntheticCounter}`)) {
			syntheticCounter++;
		}
		const ref = `@e${syntheticCounter++}`;
		existingRefs.add(ref);
		return ref;
	};

	interface CandidateItem {
		el: ScreenElement;
		type: string;
		primaryLabel: string;
		tapX: number;
		tapY: number;
		dedupKey: string;
		isInteractive: boolean;
	}

	const candidates: CandidateItem[] = [];

	for (const el of elements) {
		if (el.rect.width <= 0 || el.rect.height <= 0) {
			continue;
		}

		const primaryLabel = (el.label || el.text || el.name || el.value || "").trim();
		if (!primaryLabel || isDecorative(el, primaryLabel)) {
			continue;
		}

		const type = shortType(el.type);
		const tapX = Math.round(el.rect.x + el.rect.width / 2);
		const tapY = Math.round(el.rect.y + el.rect.height / 2);
		const normalizedLabel = primaryLabel.replace(/\s+/g, "");
		const rowBand = Math.round(tapY / 16);
		const dedupKey = `act:${normalizedLabel}:${rowBand}`;
		const isInteractive = isExplicitlyInteractive(el, type);

		candidates.push({
			el,
			type,
			primaryLabel,
			tapX,
			tapY,
			dedupKey,
			isInteractive,
		});
	}

	// First pass: collect explicitly interactive elements
	for (const item of candidates) {
		if (item.isInteractive) {
			const compactEl: CompactElement = {
				ref: assignRef(item.el.ref),
				type: item.type,
				label: item.primaryLabel,
				value: item.el.value && item.el.value !== item.primaryLabel ? item.el.value : undefined,
				identifier: item.el.identifier && item.el.identifier !== item.primaryLabel ? item.el.identifier : undefined,
				tapX: item.tapX,
				tapY: item.tapY,
				rect: item.el.rect,
				focused: item.el.focused,
				selected: item.el.selected,
				checked: item.el.checked,
				enabled: item.el.enabled,
				interactive: true,
			};

			const existingIdx = actionableIndexByKey.get(item.dedupKey);
			if (existingIdx !== undefined) {
				const prevType = actionable[existingIdx].type;
				const genericContainers = ["Cell", "View", "ViewGroup", "LinearLayout"];
				if (genericContainers.includes(prevType) && !genericContainers.includes(item.type)) {
					actionable[existingIdx] = compactEl;
				}
				continue;
			}

			seenKeys.add(item.dedupKey);
			actionableIndexByKey.set(item.dedupKey, actionable.length);
			actionableLabels.add(item.primaryLabel);
			actionable.push(compactEl);
		}
	}

	// Fallback promotion: if actionable has fewer than 2 items, promote tappable TextView / View elements
	// (such as Android Settings list rows or Jetpack Compose screens) so Kev can rank them
	if (actionable.length < 2) {
		for (const item of candidates) {
			if (!seenKeys.has(item.dedupKey) && TEXT_OR_VIEW_TYPES.has(item.type)) {
				const compactEl: CompactElement = {
					ref: assignRef(item.el.ref),
					type: item.type,
					label: item.primaryLabel,
					value: item.el.value && item.el.value !== item.primaryLabel ? item.el.value : undefined,
					identifier: item.el.identifier && item.el.identifier !== item.primaryLabel ? item.el.identifier : undefined,
					tapX: item.tapX,
					tapY: item.tapY,
					rect: item.el.rect,
					focused: item.el.focused,
					selected: item.el.selected,
					checked: item.el.checked,
					enabled: item.el.enabled,
					interactive: true,
				};

				seenKeys.add(item.dedupKey);
				actionableIndexByKey.set(item.dedupKey, actionable.length);
				actionableLabels.add(item.primaryLabel);
				actionable.push(compactEl);
			}
		}
	}

	// Second pass: collect non-duplicate informational text/headers
	for (const item of candidates) {
		if (INTERACTIVE_TYPES.has(item.type) || item.type === "Image" || seenKeys.has(item.dedupKey)) {
			continue;
		}

		// Skip child StaticText that merely repeats an interactive button's label
		if (actionableLabels.has(item.primaryLabel)) {
			continue;
		}

		// Also skip if a button label contains this exact text (e.g. Apple Account subtitle)
		let coveredByButton = false;
		for (const actLabel of actionableLabels) {
			if (actLabel.includes(item.primaryLabel) && item.primaryLabel.length > 4) {
				coveredByButton = true;
				break;
			}
		}
		if (coveredByButton) {
			continue;
		}

		const dedupKey = `info:${item.primaryLabel}`;
		if (seenKeys.has(dedupKey)) {
			continue;
		}

		seenKeys.add(dedupKey);
		informational.push({
			ref: assignRef(item.el.ref),
			type: item.type,
			label: item.primaryLabel,
			value: item.el.value && item.el.value !== item.primaryLabel ? item.el.value : undefined,
			identifier: item.el.identifier && item.el.identifier !== item.primaryLabel ? item.el.identifier : undefined,
			tapX: item.tapX,
			tapY: item.tapY,
			rect: item.el.rect,
			focused: item.el.focused,
			selected: item.el.selected,
			checked: item.el.checked,
			enabled: item.el.enabled,
			interactive: false,
		});
	}

	const appHeader = foregroundApp
		? `App: ${foregroundApp.appName} (${foregroundApp.packageName})${foregroundApp.activity ? ` [${foregroundApp.activity}]` : ""}`
		: "App: unknown";

	const controlSummaries = actionable.slice(0, MAX_CANDIDATE_ELEMENTS).map(c => {
		const refPrefix = c.ref ? `${c.ref} ` : "";
		const valSuffix = c.value ? `=${JSON.stringify(c.value.slice(0, 30))}` : "";
		return `${refPrefix}${c.type} ${JSON.stringify(c.label.slice(0, 50))}${valSuffix}`;
	});

	const infoSummaries = informational.slice(0, 12).map(i => {
		const valSuffix = i.value ? ` (${i.value.slice(0, 40)})` : "";
		return `${i.type} ${JSON.stringify(i.label.slice(0, 50))}${valSuffix}`;
	});

	const stateLines = [
		`${appHeader} | Screen: ${screenSize.width}x${screenSize.height} (1:1 screen coordinates)`,
		`Actionable Controls (${actionable.length}): ${controlSummaries.join(", ") || "none"}`,
	];
	if (infoSummaries.length > 0) {
		stateLines.push(`Visible Text/Headers (${informational.length}): ${infoSummaries.join(", ")}`);
	}

	return {
		actionable,
		informational,
		stateText: stateLines.join("\n"),
	};
};

export const analyzeScreenWithKev = async (
	hierarchy: CompactHierarchy,
	options?: {
		goal?: string;
		model?: string;
		ollamaUrl?: string;
		fetchImpl?: typeof fetch;
	}
): Promise<KevScreenAnalysis> => {
	const model = options?.model || getKevModel();
	if (kevHealth.isCooling(model)) {
		throw new Error(`Kev decision model ${model} is in cooldown after recent failures`);
	}

	const hosted = isHostedDecisionModel(model);
	const baseUrl = hosted
		? (process.env.MOBILEMCP_SYSTEMONE_URL || "").replace(/\/+$/, "")
		: (options?.ollamaUrl || getOllamaUrl());

	if (hosted && !baseUrl) {
		throw new Error("MOBILEMCP_SYSTEMONE_URL must be set for a hosted decision model");
	}

	const goal = options?.goal?.trim();

	const questions: Record<string, SystemOneQuestion> = {
		screen_type: {
			type: "choice",
			instructions: "What type of mobile screen is currently displayed based on the UI hierarchy?",
			criteria: SCREEN_TYPE_CRITERIA,
		},
		screen_complexity: {
			type: "score",
			instructions: "How dense and complex is the interactive layout of this mobile screen?",
			criteria: SCREEN_COMPLEXITY_CRITERIA,
		},
		hierarchy_sufficient: {
			type: "noul",
			instructions: "Does this UI hierarchy contain clear labeled elements sufficient to understand and interact with the screen without needing a pixel screenshot?",
			criteria: {
				"false": "Unlabeled canvas, game, or empty hierarchy requiring pixel vision",
				"true": "Clear labeled UI elements and coordinates sufficient for screen understanding and navigation",
			},
		},
	};

	// Ensure every actionable element has a ref for target_element matching
	const existingCandidateRefs = new Set(hierarchy.actionable.map(e => e.ref).filter((r): r is string => Boolean(r)));
	let synthCandidateCounter = 1;
	for (const el of hierarchy.actionable) {
		if (!el.ref) {
			while (existingCandidateRefs.has(`@e${synthCandidateCounter}`)) {
				synthCandidateCounter++;
			}
			const ref = `@e${synthCandidateCounter++}`;
			existingCandidateRefs.add(ref);
			el.ref = ref;
		}
	}

	const allCandidates = hierarchy.actionable;
	const goalWords = goal
		? goal.toLowerCase().split(/\W+/).filter(w => w.length >= 2)
		: [];

	const scoredCandidates = allCandidates.map((el, idx) => {
		const hay = `${el.label} ${el.value || ""} ${el.identifier || ""}`.toLowerCase();
		const overlap = goalWords.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
		return { el, idx, overlap };
	});
	scoredCandidates.sort((a, b) => (b.overlap - a.overlap) || (a.idx - b.idx));
	const candidateElements = scoredCandidates.slice(0, MAX_CANDIDATE_ELEMENTS).map(c => c.el);

	const elementByRef = new Map<string, CompactElement>();
	const elementCriteria: Record<string, string> = {};

	for (const el of candidateElements) {
		if (!el.ref) {
			continue;
		}
		elementByRef.set(el.ref, el);
		const cleanLabel = el.label.slice(0, MAX_OPTION_LABEL_CHARS);
		const valPart = el.value ? ` (${el.value.slice(0, 20)})` : "";
		elementCriteria[el.ref] = `${el.type}: ${cleanLabel}${valPart}`;
	}

	const effectiveGoal = goal || (Object.keys(elementCriteria).length >= 2
		? "Which actionable element is the primary navigation or action control on this screen?"
		: undefined);

	if (effectiveGoal && Object.keys(elementCriteria).length >= (goal ? 1 : 2)) {
		questions.target_element = {
			type: "choice",
			instructions: goal
				? "Which UI element on screen best matches the User Goal?"
				: effectiveGoal,
			criteria: elementCriteria,
		};
	}

	const statePayload = goal
		? `User Goal: ${goal}\n${hierarchy.stateText}`
		: hierarchy.stateText;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	const apiKey = process.env.MOBILEMCP_SYSTEMONE_API_KEY;
	if (hosted && apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	const requestBody: Record<string, unknown> = {
		model,
		state: statePayload,
		questions,
	};
	if (!hosted) {
		requestBody.keep_alive = process.env.MOBILEMCP_SYSTEMONE_KEEP_ALIVE || DEFAULT_KEEP_ALIVE;
	}

	const controller = new AbortController();
	const timeoutMs = kevHealth.timeoutMs(model);
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const t0 = performance.now();
	const fetchFn = options?.fetchImpl || fetch;

	try {
		const response = await fetchFn(`${baseUrl}/v1/systemone`, {
			method: "POST",
			headers,
			body: JSON.stringify(requestBody),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Kev /v1/systemone HTTP ${response.status}: ${errText}`);
		}

		const data = (await response.json()) as SystemOneResponse;
		const elapsedMs = Math.round((performance.now() - t0) * 10) / 10;
		kevHealth.recordSuccess(model);

		const screenTypeAns = data.answers?.screen_type;
		const screenType = screenTypeAns?.choice || "unknown";
		const screenTypeConfidence = Number((screenTypeAns?.confidence ?? 0).toFixed(4));
		const screenTypeProbabilities: Record<string, number> = {};
		if (screenTypeAns?.probabilities) {
			for (const [k, v] of Object.entries(screenTypeAns.probabilities)) {
				screenTypeProbabilities[k] = Number(Number(v).toFixed(4));
			}
		}

		const compAns = data.answers?.screen_complexity;
		const compScore = Number((compAns?.score ?? 0).toFixed(4));
		const compProbs = compAns?.probabilities || {};
		const screenComplexity = compAns
			? mapComplexityScore(compScore, compProbs)
			: "simple";

		const suffProb = Number((data.answers?.hierarchy_sufficient?.noul ?? 0).toFixed(4));
		const hierarchySufficient = suffProb >= 0.35 && (hierarchy.actionable.length + hierarchy.informational.length) > 0;

		let targetMatch: KevScreenAnalysis["targetMatch"] | undefined;
		const targetAns = data.answers?.target_element;
		if (targetAns && targetAns.choice) {
			const probs = targetAns.probabilities || {};
			const topCandidates: KevCandidateMatch[] = Object.entries(probs)
				.map(([ref, prob]) => ({
					ref,
					probability: Number(Number(prob).toFixed(4)),
					element: elementByRef.get(ref)!,
				}))
				.filter(item => item.element !== undefined)
				.sort((a, b) => b.probability - a.probability)
				.slice(0, 3);

			targetMatch = {
				goal: goal || "primary_element",
				choice: targetAns.choice,
				confidence: Number((targetAns.confidence ?? 0).toFixed(4)),
				element: elementByRef.get(targetAns.choice),
				topCandidates,
			};
		}

		return {
			model: data.model || model,
			elapsedMs,
			inputTokens: data.usage?.input_tokens ?? 0,
			outputTokens: data.usage?.output_tokens ?? 0,
			screenType,
			screenTypeConfidence,
			screenTypeProbabilities,
			screenComplexity,
			screenComplexityScore: compScore,
			hierarchySufficient,
			hierarchySufficientProb: suffProb,
			targetMatch,
		};
	} catch (err) {
		kevHealth.recordFailure(model);
		throw err;
	} finally {
		clearTimeout(timer);
	}
};

const formatCompactElementLine = (el: CompactElement): string => {
	const parts: string[] = [];
	if (el.ref) {
		parts.push(el.ref);
	}
	parts.push(el.type);
	parts.push(`label=${JSON.stringify(el.label)}`);
	if (el.value) {
		parts.push(`value=${JSON.stringify(el.value)}`);
	}
	if (el.identifier) {
		parts.push(`id=${JSON.stringify(el.identifier)}`);
	}
	parts.push(`tap=${el.tapX},${el.tapY}`);
	parts.push(`bounds=${el.rect.x},${el.rect.y},${el.rect.width}x${el.rect.height}`);
	if (el.focused) {
		parts.push("focused");
	}
	if (el.selected) {
		parts.push("selected");
	}
	if (el.checked) {
		parts.push("checked");
	}
	if (el.enabled === false) {
		parts.push("disabled");
	}
	return parts.join(" ");
};

export const formatKevScreenSnapshot = (
	hierarchy: CompactHierarchy,
	analysis: KevScreenAnalysis,
	screenSize: ScreenSize,
	foregroundApp?: ForegroundApp
): string => {
	const lines: string[] = [];
	const appDesc = foregroundApp
		? `${foregroundApp.appName} (${foregroundApp.packageName})${foregroundApp.activity ? `, activity: ${foregroundApp.activity}` : ""}`
		: "unknown";

	lines.push(`[Kev UI Hierarchy Screen Snapshot | model=${analysis.model} | latency=${analysis.elapsedMs}ms | tokens=${analysis.inputTokens}->${analysis.outputTokens}]`);
	lines.push(`Foreground App: ${appDesc}`);
	lines.push(`Screen Size: ${screenSize.width}x${screenSize.height} (coordinates below match screen tap coordinates 1:1)`);
	lines.push(`Screen Classification: ${analysis.screenType} (confidence=${analysis.screenTypeConfidence}, complexity=${analysis.screenComplexity}[${analysis.screenComplexityScore}], hierarchy_sufficient=${analysis.hierarchySufficientProb})`);

	if (analysis.targetMatch && analysis.targetMatch.element) {
		const tm = analysis.targetMatch;
		const el = tm.element!;
		const labelHeader = tm.goal === "primary_element" ? "Primary Salient Element" : `Kev Best Match for "${tm.goal}"`;
		lines.push(`${labelHeader}: ${tm.choice} (${el.type} ${JSON.stringify(el.label)}) -> tap=(${el.tapX}, ${el.tapY}) or ref="${tm.choice}" [prob=${tm.topCandidates[0]?.probability ?? tm.confidence}, conf=${tm.confidence}]`);
		if (tm.topCandidates.length > 1) {
			const alts = tm.topCandidates.slice(1).map(c => `${c.ref} ${JSON.stringify(c.element.label)} (${c.probability})`).join(", ");
			lines.push(`Alternatives: ${alts}`);
		}
	}

	lines.push("");
	lines.push(`Actionable Elements (${hierarchy.actionable.length}):`);
	for (const el of hierarchy.actionable) {
		lines.push(`  ${formatCompactElementLine(el)}`);
	}

	if (hierarchy.informational.length > 0) {
		lines.push("");
		lines.push(`Informational Elements (${hierarchy.informational.length}):`);
		for (const el of hierarchy.informational) {
			lines.push(`  ${formatCompactElementLine(el)}`);
		}
	}

	return lines.join("\n");
};
