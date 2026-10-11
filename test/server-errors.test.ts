import { expect, test } from "@playwright/test";

import { actionableErrorToolResult } from "../src/server";
import { ActionableError } from "../src/robot";

// Regression test for #489: an ActionableError raised by a tool must be
// reported to the MCP client with isError: true, otherwise the caller treats a
// failed operation as a success.
test("ActionableError tool result sets isError: true", () => {
	const result = actionableErrorToolResult(
		new ActionableError(`Device "nonexistent-device-for-error-check" not found.`),
	);

	expect(result.isError).toBe(true);
	expect(result.content).toHaveLength(1);
	expect(result.content[0].type).toBe("text");
	expect(result.content[0].text).toContain(
		`Device "nonexistent-device-for-error-check" not found.`,
	);
	expect(result.content[0].text).toContain("Please fix the issue and try again.");
});

test("ActionableError text keeps the actionable wording", () => {
	const error = new ActionableError("Either ref or both x and y must be provided");

	const result = actionableErrorToolResult(error);

	expect(result.content[0].text).toBe(
		"Either ref or both x and y must be provided. Please fix the issue and try again.",
	);
});
