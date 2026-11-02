import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type QuotaState = {
	day: string;
	counts: Record<string, number>;
};

// events not listed here are always sent (get_more_tools' $mcp_missing_capability)
const DAILY_CAPS: Record<string, number> = {
	"launch": 1,
	"tool_invoked": 1,
	"tool_failed": 100,
};

// get_more_tools is rare and is the signal we want the most, never cap it
const UNCAPPED_TOOLS = ["get_more_tools"];

// share mobilecli's state dir (it keeps daemon.pid/sock/log there), honoring the same override
const stateDir = (): string => process.env.MOBILECLI_HOME || path.join(os.homedir(), ".mobilecli");

const defaultQuotaPath = (): string => path.join(stateDir(), "mobile-mcp-telemetry.json");

const today = (now: Date): string => now.toISOString().slice(0, 10);

const isValidCounts = (counts: unknown): boolean => {
	if (typeof counts !== "object" || counts === null || Array.isArray(counts)) {
		return false;
	}

	return Object.values(counts).every(count => Number.isInteger(count) && count >= 0);
};

const readState = (statePath: string, day: string): QuotaState => {
	try {
		const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
		if (state?.day === day && isValidCounts(state.counts)) {
			return state;
		}

	} catch {
		// missing or corrupt file, start a fresh day
	}

	return { day, counts: {} };
};

const writeState = (statePath: string, state: QuotaState): void => {
	fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
	// write a temp file and rename over the target, so a planted link at statePath is replaced, not written through
	const tempPath = `${statePath}.${process.pid}.tmp`;
	fs.writeFileSync(tempPath, JSON.stringify(state), { mode: 0o600 });
	fs.renameSync(tempPath, statePath);
};

// ponytail: read-modify-write without a lock, so concurrent launches may slightly exceed a cap.
// add a lock file if that ever matters.
export const shouldSendEvent = (event: string, toolName: string | undefined, statePath = defaultQuotaPath(), now = new Date()): boolean => {
	const cap = DAILY_CAPS[event];
	if (cap === undefined) {
		return true;
	}

	if (toolName !== undefined && UNCAPPED_TOOLS.includes(toolName)) {
		return true;
	}

	try {
		const state = readState(statePath, today(now));
		const sent = state.counts[event] ?? 0;
		if (sent >= cap) {
			return false;
		}

		writeState(statePath, { day: state.day, counts: { ...state.counts, [event]: sent + 1 } });
		return true;
	} catch {
		// can't persist the quota (read-only home, etc.), drop the event rather than flood
		return false;
	}
};
