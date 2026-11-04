import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { shouldSendEvent } from "../src/telemetry-quota";

const MONDAY = new Date("2026-11-02T10:00:00Z");
const TUESDAY = new Date("2026-11-03T10:00:00Z");

const freshQuotaFile = (): string => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-quota-"));
	return path.join(dir, "nested", "telemetry.json");
};

const countSentEvents = (event: string, toolName: string | undefined, attempts: number, statePath: string, now: Date): number => {
	let sent = 0;
	for (let i = 0; i < attempts; i++) {
		if (shouldSendEvent(event, toolName, statePath, now)) {
			sent++;
		}

	}

	return sent;
};

test("sends only one launch per day", () => {
	const quotaFile = freshQuotaFile();
	expect(countSentEvents("launch", undefined, 5, quotaFile, MONDAY)).toBe(1);
});

test("sends only one tool_invoked per day", () => {
	const quotaFile = freshQuotaFile();
	expect(countSentEvents("tool_invoked", "mobile_take_screenshot", 5, quotaFile, MONDAY)).toBe(1);
});

test("sends at most 100 tool_failed per day", () => {
	const quotaFile = freshQuotaFile();
	expect(countSentEvents("tool_failed", "mobile_click_on_screen_at_coordinates", 150, quotaFile, MONDAY)).toBe(100);
});

test("always sends get_more_tools invocations and missing capabilities", () => {
	const quotaFile = freshQuotaFile();
	expect(countSentEvents("tool_invoked", "get_more_tools", 5, quotaFile, MONDAY)).toBe(5);
	expect(countSentEvents("$mcp_missing_capability", undefined, 5, quotaFile, MONDAY)).toBe(5);
});

test("caps reset on the next day", () => {
	const quotaFile = freshQuotaFile();
	countSentEvents("launch", undefined, 3, quotaFile, MONDAY);
	expect(countSentEvents("launch", undefined, 3, quotaFile, TUESDAY)).toBe(1);
});

test("each event has its own cap", () => {
	const quotaFile = freshQuotaFile();
	countSentEvents("launch", undefined, 1, quotaFile, MONDAY);
	expect(countSentEvents("tool_invoked", "mobile_list_apps", 1, quotaFile, MONDAY)).toBe(1);
});

test("a corrupt quota file starts a fresh day", () => {
	const quotaFile = freshQuotaFile();
	fs.mkdirSync(path.dirname(quotaFile), { recursive: true });
	fs.writeFileSync(quotaFile, "not json");
	expect(countSentEvents("launch", undefined, 2, quotaFile, MONDAY)).toBe(1);
});

test("a quota file with an invalid count starts a fresh day", () => {
	const quotaFile = freshQuotaFile();
	fs.mkdirSync(path.dirname(quotaFile), { recursive: true });
	fs.writeFileSync(quotaFile, JSON.stringify({ day: "2026-11-02", counts: { launch: "x", tool_failed: -5 } }));
	expect(countSentEvents("launch", undefined, 3, quotaFile, MONDAY)).toBe(1);
});

test("a planted link is replaced, not written through", () => {
	const quotaFile = freshQuotaFile();
	const victim = path.join(path.dirname(path.dirname(quotaFile)), "victim.txt");
	fs.writeFileSync(victim, "untouched");
	fs.mkdirSync(path.dirname(quotaFile), { recursive: true });
	fs.symlinkSync(victim, quotaFile);
	shouldSendEvent("launch", undefined, quotaFile, MONDAY);
	expect(fs.readFileSync(victim, "utf8")).toBe("untouched");
	expect(fs.lstatSync(quotaFile).isSymbolicLink()).toBe(false);
});
