import { expect, test } from "@playwright/test";

import { formatElements } from "../src/format-elements";
import { ScreenElement } from "../src/robot";

const incrementButton: ScreenElement = {
	ref: "@e42",
	type: "android.widget.Button",
	text: "+",
	identifier: "com.mobilenext.playground:id/stepper_increment",
	rect: { x: 1070, y: 1340, width: 120, height: 120 },
};

const focusedTextField: ScreenElement = {
	ref: "@e32",
	type: "android.widget.EditText",
	text: "Hello World",
	label: "text_field",
	rect: { x: 48, y: 447, width: 1184, height: 149 },
	focused: true,
	enabled: false,
};

test("text format emits one self-describing line per element with coordinates", () => {
	const lines = formatElements([incrementButton, focusedTextField], "text").split("\n");
	expect(lines[0]).toContain("@ref Type");
	expect(lines[1]).toBe("@e42 Button text=\"+\" id=com.mobilenext.playground:id/stepper_increment at=1070,1340 size=120x120");
	expect(lines[2]).toBe("@e32 EditText text=\"Hello World\" label=\"text_field\" at=48,447 size=1184x149 focused disabled");
});

test("json format keeps the legacy shape", () => {
	const text = formatElements([incrementButton], "json");
	const parsed = JSON.parse(text.replace("Found these elements on screen: ", ""));
	expect(parsed[0].coordinates).toEqual({ x: 1070, y: 1340, width: 120, height: 120 });
	expect(parsed[0].enabled).toBeUndefined();
});
