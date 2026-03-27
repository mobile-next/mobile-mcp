import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";

import { validateFileExtension } from "../src/utils";
import { ActionableError } from "../src/robot";

const ALLOWED_APP_EXTENSIONS = [".apk", ".ipa", ".zip", ".app"];

describe("validateInputPath (new: prevents CWE-22 in install_app)", () => {
	let validateInputPath: (filePath: string) => void;

	before(() => {
		const utils = require("../src/utils");
		validateInputPath = utils.validateInputPath;
		if (!validateInputPath) {
			throw new Error("validateInputPath is not exported from src/utils.ts — the fix has not been applied yet");
		}
	});

	it("should allow paths under cwd", () => {
		const filePath = path.join(process.cwd(), "test-input-file.apk");
		fs.writeFileSync(filePath, "fake-apk");
		try {
			assert.doesNotThrow(() => validateInputPath(filePath));
		} finally {
			fs.unlinkSync(filePath);
		}
	});

	it("should reject paths outside allowed roots like /etc", () => {
		assert.throws(() => validateInputPath("/etc/passwd"), ActionableError);
	});

	it("should reject path traversal attempts via ../ from cwd", () => {
		const filePath = path.join(process.cwd(), "..", "..", "etc", "passwd");
		assert.throws(() => validateInputPath(filePath), ActionableError);
	});

	it("should reject absolute paths to /usr", () => {
		assert.throws(() => validateInputPath("/usr/local/bin/malicious.apk"), ActionableError);
	});

	it("should reject paths under /home or /Users outside cwd", () => {
		const otherUser = path.join("/Users", "otheruser", "malware.apk");
		assert.throws(() => validateInputPath(otherUser), ActionableError);
	});

	it("should reject paths to root filesystem", () => {
		assert.throws(() => validateInputPath("/malicious.apk"), ActionableError);
	});
});

describe("validateFileExtension for install_app", () => {
	it("should accept .apk files", () => {
		assert.doesNotThrow(() => validateFileExtension("myapp.apk", ALLOWED_APP_EXTENSIONS, "install_app"));
	});

	it("should accept .ipa files", () => {
		assert.doesNotThrow(() => validateFileExtension("myapp.ipa", ALLOWED_APP_EXTENSIONS, "install_app"));
	});

	it("should accept .zip files", () => {
		assert.doesNotThrow(() => validateFileExtension("myapp.zip", ALLOWED_APP_EXTENSIONS, "install_app"));
	});

	it("should accept .app paths", () => {
		assert.doesNotThrow(() => validateFileExtension("MyApp.app", ALLOWED_APP_EXTENSIONS, "install_app"));
	});

	it("should reject other extensions", () => {
		assert.throws(
			() => validateFileExtension("script.sh", ALLOWED_APP_EXTENSIONS, "install_app"),
			ActionableError,
		);
	});

	it("should reject files with no extension", () => {
		assert.throws(
			() => validateFileExtension("noext", ALLOWED_APP_EXTENSIONS, "install_app"),
			ActionableError,
		);
	});
});
