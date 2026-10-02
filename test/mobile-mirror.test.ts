import { expect, test } from "@playwright/test";

import { CELL_ASPECT, fitInside, pngSize } from "../plugin/hooks/png";
import { keysToActions } from "../plugin/hooks/keys";

function pngHeaderOfSize(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(24);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

test.describe("mobile-mirror picture sizing", () => {
	test("reads width and height from the PNG header", () => {
		expect(pngSize(pngHeaderOfSize(356, 800))).toEqual({ width: 356, height: 800 });
	});

	test("a portrait screenshot in a short pane is limited by height", () => {
		const columns = Math.floor((20 * 400 * CELL_ASPECT) / 800);
		expect(fitInside(80, 20, 400, 800)).toEqual({ columns, rows: 20 });
	});

	test("a landscape screenshot in a tall pane is limited by width", () => {
		const rows = Math.floor((40 * 400) / 800 / CELL_ASPECT);
		expect(fitInside(40, 100, 800, 400)).toEqual({ columns: 40, rows });
	});

	test("never exceeds 255 cells and keeps the aspect while capped", () => {
		const columns = Math.floor((255 * 100 * CELL_ASPECT) / 1000);
		expect(fitInside(300, 1000, 100, 1000)).toEqual({ columns, rows: 255 });
	});

	test("a picture with no width or height fills the box instead of dividing by zero", () => {
		expect(fitInside(40, 20, 0, 800)).toEqual({ columns: 40, rows: 20 });
		expect(fitInside(40, 20, 400, 0)).toEqual({ columns: 40, rows: 20 });
	});
});

test.describe("mobile-mirror keys", () => {
	test("consecutive characters become one text action", () => {
		expect(keysToActions(["h", "i", "space", "!"], "android")).toEqual([{ type: "text", text: "hi !" }]);
	});

	test("return splits text and presses ENTER", () => {
		expect(keysToActions(["a", "return", "b"], "ios")).toEqual([
			{ type: "text", text: "a" },
			{ type: "button", button: "ENTER" },
			{ type: "text", text: "b" },
		]);
	});

	test("backspace is a button on android and typed text on ios", () => {
		expect(keysToActions(["backspace"], "android")).toEqual([{ type: "button", button: "BACKSPACE" }]);
		expect(keysToActions(["backspace"], "ios")).toEqual([{ type: "text", text: "\b" }]);
	});

	test("arrows press the dpad on android and are dropped on ios", () => {
		expect(keysToActions(["up"], "android")).toEqual([{ type: "button", button: "DPAD_UP" }]);
		expect(keysToActions(["up", "pageup"], "ios")).toEqual([]);
	});
});
