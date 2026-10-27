import { ForegroundApp, ScreenElement, ScreenElementRect } from "./robot";
import { formatElementAsText } from "./format-elements";

// After an action (tap, type, swipe, press), wait for the ui to settle and describe
// what changed, so the agent doesn't need a screenshot or a full re-list to find out
// whether the action did anything. Works on plain ScreenElement lists, so it is the
// same for every robot. See #450.

export type ScreenChange = "none" | "content_changed" | "new_screen" | "dialog_opened" | "dialog_closed" | "scrolled";

export interface FeedbackSettings {
	// action tools report feedback unless the call says otherwise
	enabled: boolean;
	// give up waiting for two identical snapshots after this long
	timeoutMs: number;
	// pause between two snapshots
	intervalMs: number;
	// diff lines shown before "... and N more"
	maxDiffLines: number;
}

export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = {
	enabled: true,
	timeoutMs: 2000,
	intervalMs: 250,
	maxDiffLines: 8,
};

export const feedbackSettingsFromEnv = (env: NodeJS.ProcessEnv): FeedbackSettings => {
	const settings = { ...DEFAULT_FEEDBACK_SETTINGS };
	if (env.MOBILEMCP_ACTION_FEEDBACK === "0") {
		settings.enabled = false;
	}

	const timeoutMs = Number(env.MOBILEMCP_SETTLE_TIMEOUT_MS);
	if (env.MOBILEMCP_SETTLE_TIMEOUT_MS !== undefined && Number.isFinite(timeoutMs) && timeoutMs >= 0) {
		settings.timeoutMs = timeoutMs;
	}

	return settings;
};

// what the action aimed at, used to tell what actually received the touch
export type ActionTarget =
	| { kind: "point"; x: number; y: number }
	| { kind: "ref"; ref: string }
	| { kind: "typing"; text: string }
	| { kind: "none" };

export interface FeedbackRobot {
	getElementsOnScreen(): Promise<ScreenElement[]>;
	getForegroundApp?(): Promise<ForegroundApp>;
}

export interface SettleClock {
	now(): number;
	sleep(ms: number): Promise<void>;
}

const realClock: SettleClock = {
	now: () => Date.now(),
	sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

export interface SettleResult {
	elements: ScreenElement[];
	settled: boolean;
	elapsedMs: number;
}

// refs are reassigned on every dump, so they are not part of what makes two snapshots equal
const elementSignature = (element: ScreenElement): string => JSON.stringify([
	element.type, element.identifier, element.label, element.name, element.text, element.value,
	element.rect.x, element.rect.y, element.rect.width, element.rect.height,
	!!element.focused, !!element.selected, !!element.checked, element.enabled !== false,
]);

export const snapshotSignature = (elements: ScreenElement[]): string => elements.map(elementSignature).join("\n");

/**
 * Read the screen until two consecutive snapshots are identical, or until the timeout passes.
 */
export const waitForSettle = async (read: () => Promise<ScreenElement[]>, settings: Pick<FeedbackSettings, "timeoutMs" | "intervalMs">, clock: SettleClock = realClock): Promise<SettleResult> => {
	const start = clock.now();
	await clock.sleep(settings.intervalMs);
	let previous = await read();
	let previousSignature = snapshotSignature(previous);

	while (clock.now() - start < settings.timeoutMs) {
		await clock.sleep(settings.intervalMs);
		const current = await read();
		const currentSignature = snapshotSignature(current);
		if (currentSignature === previousSignature) {
			return { elements: current, settled: true, elapsedMs: clock.now() - start };
		}

		previous = current;
		previousSignature = currentSignature;
	}

	return { elements: previous, settled: false, elapsedMs: clock.now() - start };
};

export interface ElementPair {
	before: ScreenElement;
	after: ScreenElement;
	// the element's identity is unique in both snapshots, safe to measure a scroll with
	unique: boolean;
	// matched on its full identity, not only on its type and position
	strict: boolean;
}

export interface ElementChange extends ElementPair {
	fields: string[];
}

export interface ElementDiff {
	added: ScreenElement[];
	removed: ScreenElement[];
	changed: ElementChange[];
	pairs: ElementPair[];
}

const identityKey = (element: ScreenElement): string => JSON.stringify([element.type, element.identifier, element.label, element.name, element.text]);

const centerOf = (rect: ScreenElementRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

const distance = (a: ScreenElementRect, b: ScreenElementRect): number => {
	const ca = centerOf(a);
	const cb = centerOf(b);
	return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};

const sameRect = (a: ScreenElementRect, b: ScreenElementRect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const changedFields = (before: ScreenElement, after: ScreenElement): string[] => {
	const fields: string[] = [];
	if ((before.text ?? "") !== (after.text ?? "")) {
		fields.push("text");
	}

	if ((before.value ?? "") !== (after.value ?? "")) {
		fields.push("value");
	}

	for (const state of ["focused", "selected", "checked"] as const) {
		if (!!before[state] !== !!after[state]) {
			fields.push(state);
		}
	}

	if ((before.enabled !== false) !== (after.enabled !== false)) {
		fields.push("enabled");
	}

	if (!sameRect(before.rect, after.rect)) {
		fields.push("rect");
	}

	return fields;
};

const countKeys = (elements: ScreenElement[]): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const element of elements) {
		const key = identityKey(element);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return counts;
};

/**
 * Pair up elements of two snapshots. Elements match on type, id, label, name and text;
 * an element whose text changed (e.g. a field being typed into) is matched in a second
 * pass on its type plus its id or its exact position.
 */
export const diffElements = (before: ScreenElement[], after: ScreenElement[]): ElementDiff => {
	const remaining = [...after];
	const unmatchedBefore: ScreenElement[] = [];
	const pairs: ElementPair[] = [];
	const beforeCounts = countKeys(before);
	const afterCounts = countKeys(after);

	const takeClosest = (element: ScreenElement, accepts: (candidate: ScreenElement) => boolean): ScreenElement | undefined => {
		let bestIndex = -1;
		for (let i = 0; i < remaining.length; i++) {
			if (accepts(remaining[i]) && (bestIndex === -1 || distance(element.rect, remaining[i].rect) < distance(element.rect, remaining[bestIndex].rect))) {
				bestIndex = i;
			}
		}

		return bestIndex === -1 ? undefined : remaining.splice(bestIndex, 1)[0];
	};

	for (const element of before) {
		const key = identityKey(element);
		const match = takeClosest(element, candidate => identityKey(candidate) === key);
		if (match) {
			pairs.push({ before: element, after: match, unique: beforeCounts.get(key) === 1 && afterCounts.get(key) === 1, strict: true });
		} else {
			unmatchedBefore.push(element);
		}
	}

	const removed: ScreenElement[] = [];
	for (const element of unmatchedBefore) {
		const match = takeClosest(element, candidate =>
			candidate.type === element.type &&
			((!!element.identifier && candidate.identifier === element.identifier) || sameRect(candidate.rect, element.rect)));
		if (match) {
			pairs.push({ before: element, after: match, unique: false, strict: false });
		} else {
			removed.push(element);
		}
	}

	const changed: ElementChange[] = [];
	for (const pair of pairs) {
		const fields = changedFields(pair.before, pair.after);
		if (fields.length > 0) {
			changed.push({ ...pair, fields });
		}
	}

	// keep the order the elements have on the new screen
	const added = after.filter(element => remaining.includes(element));
	return { added, removed, changed, pairs };
};

/**
 * Most elements that are on both screens moved by the same offset: the content scrolled.
 */
export const detectScroll = (pairs: ElementPair[]): { dx: number; dy: number } | null => {
	const buckets = new Map<string, { dx: number; dy: number; count: number }>();
	let moved = 0;
	for (const pair of pairs) {
		const a = pair.before.rect;
		const b = pair.after.rect;
		if (!pair.unique || a.width !== b.width || a.height !== b.height) {
			continue;
		}

		const dx = b.x - a.x;
		const dy = b.y - a.y;
		if (dx === 0 && dy === 0) {
			continue;
		}

		moved++;
		const key = `${dx},${dy}`;
		const bucket = buckets.get(key) ?? { dx, dy, count: 0 };
		bucket.count++;
		buckets.set(key, bucket);
	}

	let best: { dx: number; dy: number; count: number } | undefined;
	for (const bucket of buckets.values()) {
		if (!best || bucket.count > best.count) {
			best = bucket;
		}
	}

	if (!best || best.count < 2 || best.count * 2 < moved) {
		return null;
	}

	return { dx: best.dx, dy: best.dy };
};

const area = (rect: ScreenElementRect): number => Math.max(0, rect.width) * Math.max(0, rect.height);

const boundingBox = (elements: ScreenElement[]): ScreenElementRect | null => {
	const rects = elements.map(element => element.rect).filter(rect => area(rect) > 0);
	if (rects.length === 0) {
		return null;
	}

	const left = Math.min(...rects.map(rect => rect.x));
	const top = Math.min(...rects.map(rect => rect.y));
	const right = Math.max(...rects.map(rect => rect.x + rect.width));
	const bottom = Math.max(...rects.map(rect => rect.y + rect.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
};

const DIALOG_TYPE = /(alert|dialog|sheet|popover|popupwindow)/i;

const shortType = (type: string): string => type.substring(type.lastIndexOf(".") + 1);

const looksLikeDialog = (element: ScreenElement): boolean => DIALOG_TYPE.test(shortType(element.type));

// below this share of elements kept from one screen to the next, it is a different screen
const NEW_SCREEN_OVERLAP = 0.35;

// an element set covering less than this share of the screen is a dialog or a sheet
const OVERLAY_AREA = 0.6;

const sameForegroundApp = (before?: ForegroundApp, after?: ForegroundApp): boolean => {
	if (!before || !after) {
		return true;
	}

	return before.packageName === after.packageName && (before.activity ?? "") === (after.activity ?? "");
};

export interface ScreenChangeResult {
	change: ScreenChange;
	scroll?: { dx: number; dy: number };
}

export const classifyChange = (before: ScreenElement[], after: ScreenElement[], diff: ElementDiff, beforeApp?: ForegroundApp, afterApp?: ForegroundApp): ScreenChangeResult => {
	const appChanged = !sameForegroundApp(beforeApp, afterApp);
	if (!appChanged && diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
		return { change: "none" };
	}

	if (appChanged) {
		return { change: "new_screen" };
	}

	if (diff.added.some(looksLikeDialog)) {
		return { change: "dialog_opened" };
	}

	if (diff.removed.some(looksLikeDialog)) {
		return { change: "dialog_closed" };
	}

	const scroll = detectScroll(diff.pairs);
	if (scroll) {
		return { change: "scrolled", scroll };
	}

	// a new screen often reuses positions (title, primary button), so only elements kept as they were count
	const kept = diff.pairs.filter(pair => pair.strict).length;
	const keptFromBefore = before.length === 0 ? 0 : kept / before.length;
	const keptInAfter = after.length === 0 ? 0 : kept / after.length;
	if (keptFromBefore >= NEW_SCREEN_OVERLAP || keptInAfter >= NEW_SCREEN_OVERLAP) {
		return { change: "content_changed" };
	}

	// little survived: either a whole new screen, or a window that only covers part of it
	const screen = boundingBox([...before, ...after]);
	const afterBox = boundingBox(after);
	const beforeBox = boundingBox(before);
	if (screen && afterBox && area(afterBox) < area(screen) * OVERLAY_AREA) {
		return { change: "dialog_opened" };
	}

	if (screen && beforeBox && area(beforeBox) < area(screen) * OVERLAY_AREA) {
		return { change: "dialog_closed" };
	}

	return { change: "new_screen" };
};

const contains = (rect: ScreenElementRect, x: number, y: number): boolean =>
	x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;

const containsRect = (outer: ScreenElementRect, inner: ScreenElementRect): boolean =>
	inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

const isDescribed = (element: ScreenElement): boolean => !!(element.text || element.label || element.name || element.identifier);

/**
 * The element that receives a touch at x,y: the topmost one there, preferring elements
 * that have text, a label, a name or an id over anonymous icons and containers. Dumps
 * list parents before children and later siblings above earlier ones, so the topmost
 * element is the last one that contains the point.
 */
export const elementAt = (elements: ScreenElement[], x: number, y: number): ScreenElement | undefined => {
	const candidates = elements.filter(element => area(element.rect) > 0 && contains(element.rect, x, y));
	const described = candidates.filter(isDescribed);
	const pool = described.length > 0 ? described : candidates;
	return pool[pool.length - 1];
};

export type TypingStatus = "match" | "mismatch" | "hidden" | "no_field";

export interface TypingCheck {
	status: TypingStatus;
	field?: ScreenElement;
	value?: string;
}

const TEXT_FIELD_TYPE = /(edittext|textfield|searchfield|textinput)/i;
const SECURE_TYPE = /secure|password/i;
const MASKED_VALUE = /^[•●*·\u2022]+$/;

/**
 * Read the focused field after typing (or, where focus isn't reported, the text field
 * whose content changed) and check that it holds what was typed.
 */
export const checkTypedText = (diff: ElementDiff, after: ScreenElement[], typed: string): TypingCheck => {
	const field = after.find(element => element.focused) ??
		diff.changed.find(change => TEXT_FIELD_TYPE.test(shortType(change.after.type)) && (change.fields.includes("text") || change.fields.includes("value")))?.after;
	if (!field) {
		return { status: "no_field" };
	}

	// android keeps a field's content in text, ios in value
	const value = [field.text, field.value].find(candidate => candidate?.includes(typed)) ?? field.text ?? field.value ?? "";
	if (SECURE_TYPE.test(field.type) || (value !== "" && MASKED_VALUE.test(value))) {
		return { status: "hidden", field };
	}

	return { status: value.includes(typed) ? "match" : "mismatch", field, value };
};

export interface FeedbackReport {
	change: ScreenChange;
	scroll?: { dx: number; dy: number };
	settled: boolean;
	elapsedMs: number;
	foregroundApp?: ForegroundApp;
	touch?: { element?: ScreenElement; aimed?: ScreenElement; x: number; y: number };
	typing?: TypingCheck & { typed: string };
	diff: ElementDiff;
}

export interface ScreenState {
	elements: ScreenElement[];
	app?: ForegroundApp;
}

export const buildReport = (target: ActionTarget, before: ScreenState, after: ScreenState, settle: { settled: boolean; elapsedMs: number }): FeedbackReport => {
	const diff = diffElements(before.elements, after.elements);
	const { change, scroll } = classifyChange(before.elements, after.elements, diff, before.app, after.app);
	const report: FeedbackReport = { change, scroll, settled: settle.settled, elapsedMs: settle.elapsedMs, diff };

	if (change === "new_screen" && !sameForegroundApp(before.app, after.app)) {
		report.foregroundApp = after.app;
	}

	if (target.kind === "point") {
		report.touch = { element: elementAt(before.elements, target.x, target.y), x: target.x, y: target.y };
	} else if (target.kind === "ref") {
		const aimed = before.elements.find(element => element.ref === target.ref);
		if (aimed) {
			const center = centerOf(aimed.rect);
			const element = elementAt(before.elements, center.x, center.y);
			// a child of the aimed element (its label, its icon) is the aimed element too
			if (element && element !== aimed && !containsRect(aimed.rect, element.rect)) {
				report.touch = { element, aimed, x: Math.round(center.x), y: Math.round(center.y) };
			} else if (aimed.enabled === false) {
				// the line ends in "disabled", which explains a tap that did nothing
				report.touch = { element: aimed, x: Math.round(center.x), y: Math.round(center.y) };
			}
		}
	} else if (target.kind === "typing") {
		report.typing = { ...checkTypedText(diff, after.elements, target.text), typed: target.text };
	}

	return report;
};

const quote = (value: string): string => JSON.stringify(value);

// elements from the screen before the action: their refs are no longer valid
const formatOldElement = (element: ScreenElement): string => formatElementAsText({ ...element, ref: undefined });

const shortName = (element: ScreenElement, withRef: boolean): string => {
	const parts: string[] = [];
	if (withRef && element.ref) {
		parts.push(element.ref);
	}

	parts.push(shortType(element.type));
	const name = element.label || element.name || element.identifier;
	if (name) {
		parts.push(quote(name));
	} else if (element.text) {
		parts.push(quote(element.text));
	}

	return parts.join(" ");
};

const describeFieldChange = (change: ElementChange, field: string): string => {
	const { before, after } = change;
	switch (field) {
		case "text":
			return `text ${quote(before.text ?? "")} -> ${quote(after.text ?? "")}`;
		case "value":
			return `value ${quote(before.value ?? "")} -> ${quote(after.value ?? "")}`;
		case "focused":
			return after.focused ? "focused" : "unfocused";
		case "selected":
			return after.selected ? "selected" : "deselected";
		case "checked":
			return after.checked ? "checked" : "unchecked";
		case "enabled":
			return after.enabled === false ? "disabled" : "enabled";
		default:
			return `moved to at=${after.rect.x},${after.rect.y} size=${after.rect.width}x${after.rect.height}`;
	}
};

const describeScroll = (scroll: { dx: number; dy: number }): string => {
	const moves: string[] = [];
	if (scroll.dy !== 0) {
		moves.push(`${scroll.dy < 0 ? "up" : "down"} by ${Math.abs(scroll.dy)}px`);
	}

	if (scroll.dx !== 0) {
		moves.push(`${scroll.dx < 0 ? "left" : "right"} by ${Math.abs(scroll.dx)}px`);
	}

	return `scrolled, content moved ${moves.join(" and ")}`;
};

const describeChange = (report: FeedbackReport): string => {
	switch (report.change) {
		case "none":
			return "no change, the action had no visible effect";
		case "content_changed":
			return "content changed";
		case "new_screen": {
			const app = report.foregroundApp;
			if (!app) {
				return "new screen";
			}

			return `new screen, foreground app ${app.packageName}${app.activity ? `, activity ${app.activity}` : ""}`;
		}
		case "dialog_opened":
			return "a dialog or sheet appeared";
		case "dialog_closed":
			return "a dialog or sheet closed";
		case "scrolled":
			return describeScroll(report.scroll!);
	}
};

export const formatReport = (report: FeedbackReport, maxDiffLines: number = DEFAULT_FEEDBACK_SETTINGS.maxDiffLines): string => {
	const lines: string[] = [];
	const timing = report.settled ? `settled in ${report.elapsedMs}ms` : `still changing after ${report.elapsedMs}ms`;
	lines.push(`Screen: ${describeChange(report)} (${timing})`);

	if (report.touch) {
		const { element, aimed, x, y } = report.touch;
		if (aimed && element) {
			lines.push(`Touch: landed on ${formatOldElement(element)}, which covers the aimed ${shortName(aimed, false)}`);
		} else if (element) {
			lines.push(`Touch: ${formatOldElement(element)}`);
		} else {
			lines.push(`Touch: no element at ${x},${y}`);
		}
	}

	if (report.typing) {
		const { status, field, value, typed } = report.typing;
		if (status === "no_field") {
			lines.push("Field: no text field is focused or changed, the text may not have reached a field");
		} else if (status === "hidden") {
			lines.push(`Field: ${shortName(field!, true)} hides its value, cannot check what was typed`);
		} else if (status === "match") {
			lines.push(`Field: ${shortName(field!, true)} value=${quote(value!)}`);
		} else {
			lines.push(`Field: ${shortName(field!, true)} value=${quote(value!)} MISMATCH, typed ${quote(typed)}: characters may have been dropped or auto-corrected`);
		}
	}

	if (report.change === "none") {
		return lines.join("\n");
	}

	// a scroll moves everything, the offset already says so
	const changed = report.diff.changed
		.map(change => ({ ...change, fields: report.change === "scrolled" ? change.fields.filter(field => field !== "rect") : change.fields }))
		.filter(change => change.fields.length > 0)
		// state and text changes first, plain moves last
		.sort((a, b) => Number(a.fields.length === 1 && a.fields[0] === "rect") - Number(b.fields.length === 1 && b.fields[0] === "rect"));

	const diffLines = [
		...report.diff.added.map(element => `+ ${formatElementAsText(element)}`),
		...changed.map(change => `~ ${shortName(change.after, true)}: ${change.fields.map(field => describeFieldChange(change, field)).join(", ")}`),
		...report.diff.removed.map(element => `- ${formatOldElement(element)}`),
	];

	if (diffLines.length === 0) {
		return lines.join("\n");
	}

	lines.push(`Changes: ${report.diff.added.length} added, ${report.diff.removed.length} removed, ${changed.length} changed`);
	lines.push(...diffLines.slice(0, maxDiffLines));
	if (diffLines.length > maxDiffLines) {
		lines.push(`... and ${diffLines.length - maxDiffLines} more, call mobile_list_elements_on_screen for the full list`);
	}

	return lines.join("\n");
};

const readForegroundApp = async (robot: FeedbackRobot): Promise<ForegroundApp | undefined> => {
	if (!robot.getForegroundApp) {
		return undefined;
	}

	try {
		return await robot.getForegroundApp();
	} catch {
		return undefined;
	}
};

/**
 * Run an action and append a report of what it changed on screen. The action's own
 * result is always returned; if the screen cannot be read (e.g. it is off), the
 * report is left out rather than failing the action.
 */
export const runWithFeedback = async (robot: FeedbackRobot, target: ActionTarget, action: () => Promise<string>, settings: FeedbackSettings = DEFAULT_FEEDBACK_SETTINGS, clock: SettleClock = realClock): Promise<string> => {
	let before: ScreenState | null = null;
	try {
		before = { elements: await robot.getElementsOnScreen(), app: await readForegroundApp(robot) };
	} catch {
		before = null;
	}

	const result = await action();
	if (!before) {
		return result;
	}

	try {
		const settle = await waitForSettle(() => robot.getElementsOnScreen(), settings, clock);
		const after: ScreenState = { elements: settle.elements, app: await readForegroundApp(robot) };
		const report = buildReport(target, before, after, settle);
		return `${result}\n${formatReport(report, settings.maxDiffLines)}`;
	} catch (err: any) {
		return `${result}\nScreen: could not be read after the action (${err.message})`;
	}
};
