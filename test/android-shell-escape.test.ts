import { test, expect } from "@playwright/test";

import { AndroidRobot } from "../src/android";

// adb's `shell` subcommand joins its arguments with spaces into a single command
// string, and the device shell parses that string again. So the contract of
// escapeShellText is "whatever the device shell parses this back into", not
// "whatever argv we built".
async function deviceCommand(text: string): Promise<string> {
	const robot = new AndroidRobot("");
	const calls: string[][] = [];
	robot.adb = (...args: string[]): Buffer => {
		calls.push(args);
		return Buffer.alloc(0);
	};

	await robot.sendKeys(text);

	expect(calls.length, `expected one adb invocation for ${JSON.stringify(text)}`).toBe(1);
	expect(calls[0][0], "expected an `adb shell` call").toBe("shell");
	return calls[0].slice(1).join(" ");
}

test.describe("android shell escaping", () => {

	test("escapes a leading # so the device shell does not start a comment", async () => {
		// unescaped, `input text #general` parses as `input text` plus a comment,
		// so the text is silently never typed.
		expect(await deviceCommand("#general")).toBe("input text \\#general");
	});

	test("escapes a leading ~ so the device shell does not expand it", async () => {
		// unescaped, `~/shared/notes` parses as `$HOME/shared/notes`.
		expect(await deviceCommand("~/shared/notes")).toBe("input text \\~/shared/notes");
	});

	test("keeps a # that follows an escaped space in the same word", async () => {
		expect(await deviceCommand("hashtag #travel")).toBe("input text hashtag\\ \\#travel");
	});

	test("keeps dialer codes intact", async () => {
		// * was already escaped, so # was mid-word and harmless here before and after.
		expect(await deviceCommand("*#06#")).toBe("input text \\*\\#06\\#");
	});

	test("leaves plain text untouched", async () => {
		expect(await deviceCommand("hello")).toBe("input text hello");
	});

});
