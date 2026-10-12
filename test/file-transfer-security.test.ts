import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { joinContainerPath, validatePackageName, validatePullDestination, validatePushSource } from "../src/utils";

const OUTSIDE_FILE = "/etc/hosts";
const OUTSIDE_DIR = "/etc";

let sandbox: string;

function createSandbox(): string {
	return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mobilemcp-fs-")));
}

function fileInSandbox(relativePath: string, content = "data"): string {
	const filePath = path.join(sandbox, relativePath);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
	return filePath;
}

function symlinkInSandbox(relativePath: string, target: string): string {
	const linkPath = path.join(sandbox, relativePath);
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
	fs.symlinkSync(target, linkPath);
	return linkPath;
}

function pathInSandbox(relativePath: string): string {
	return path.join(sandbox, relativePath);
}

test.describe("file transfer security", () => {

	test.beforeEach(() => {
		sandbox = createSandbox();
	});

	test.afterEach(() => {
		fs.rmSync(sandbox, { recursive: true, force: true });
	});

	test.describe("push source", () => {
		test("allows a regular file in the temp directory and returns its real path", () => {
			const file = fileInSandbox("photo.jpg");
			expect(validatePushSource(file)).toBe(file);
		});

		test("rejects a symlink whose target is outside the allowed directories", () => {
			const link = symlinkInSandbox("innocent.txt", OUTSIDE_FILE);
			expect(() => validatePushSource(link)).toThrow(/not in the list of allowed directories/);
		});

		test("rejects a file reached through a symlinked parent directory", () => {
			symlinkInSandbox("linked-dir", OUTSIDE_DIR);
			expect(() => validatePushSource(pathInSandbox("linked-dir/hosts"))).toThrow(/not in the list of allowed directories/);
		});

		test("rejects a dotfile such as .env", () => {
			const secrets = fileInSandbox(".env", "API_KEY=secret");
			expect(() => validatePushSource(secrets)).toThrow(/hidden file/);
		});

		test("rejects a file inside a hidden directory such as .git", () => {
			const gitConfig = fileInSandbox(".git/config");
			expect(() => validatePushSource(gitConfig)).toThrow(/hidden directory/);
		});

		test("rejects a symlink that points at a dotfile", () => {
			fileInSandbox(".env", "API_KEY=secret");
			const link = symlinkInSandbox("config.txt", pathInSandbox(".env"));
			expect(() => validatePushSource(link)).toThrow(/hidden file/);
		});

		test("rejects private keys and certificates", () => {
			const key = fileInSandbox("server.pem");
			expect(() => validatePushSource(key)).toThrow(/key or certificate/);
		});

		test("rejects a file that does not exist", () => {
			expect(() => validatePushSource(pathInSandbox("missing.txt"))).toThrow(/does not exist/);
		});

		test("rejects a directory", () => {
			fs.mkdirSync(pathInSandbox("folder"));
			expect(() => validatePushSource(pathInSandbox("folder"))).toThrow(/not a regular file/);
		});
	});

	test.describe("pull destination", () => {
		test("allows a new file in the temp directory", () => {
			expect(() => validatePullDestination(pathInSandbox("pulled.db"))).not.toThrow();
		});

		test("rejects overwriting an existing file", () => {
			const existing = fileInSandbox("package.json");
			expect(() => validatePullDestination(existing)).toThrow(/already exists/);
		});

		test("rejects writing through a symlink that points outside the allowed directories", () => {
			const link = symlinkInSandbox("out.txt", OUTSIDE_FILE);
			expect(() => validatePullDestination(link)).toThrow(/already exists/);
		});

		test("rejects writing through a dangling symlink", () => {
			const link = symlinkInSandbox("dangling.txt", pathInSandbox("does-not-exist-yet"));
			expect(() => validatePullDestination(link)).toThrow(/already exists/);
		});

		test("rejects writing into a symlinked parent directory outside the allowed directories", () => {
			symlinkInSandbox("linked-dir", OUTSIDE_DIR);
			expect(() => validatePullDestination(pathInSandbox("linked-dir/new.txt"))).toThrow(/not in the list of allowed directories/);
		});

		test("rejects creating a git hook", () => {
			fs.mkdirSync(pathInSandbox(".git/hooks"), { recursive: true });
			expect(() => validatePullDestination(pathInSandbox(".git/hooks/pre-commit"))).toThrow(/hidden directory/);
		});

		test("rejects creating a husky hook", () => {
			expect(() => validatePullDestination(pathInSandbox(".husky/pre-commit"))).toThrow(/hidden directory/);
		});

		test("rejects creating an .envrc", () => {
			expect(() => validatePullDestination(pathInSandbox(".envrc"))).toThrow(/hidden file/);
		});

		test("rejects a path outside the allowed directories", () => {
			expect(() => validatePullDestination("/etc/new-file")).toThrow(/not in the list of allowed directories/);
		});

		test("rejects escaping the temp directory with ../", () => {
			expect(() => validatePullDestination(pathInSandbox("../../../../../etc/new-file"))).toThrow(/not in the list of allowed directories/);
		});
	});

	test.describe("app container paths", () => {
		const container = "/data/Containers/Data/Application/ABC";

		test("treats a leading slash as relative to the container", () => {
			expect(joinContainerPath(container, "/Documents/a.txt")).toBe(`${container}/Documents/a.txt`);
		});

		test("resolves an empty path to the container itself", () => {
			expect(joinContainerPath(container, "")).toBe(container);
		});

		test("rejects escaping the container with ../", () => {
			expect(() => joinContainerPath(container, "../OTHER/Documents")).toThrow(/outside the app's container/);
		});

		test("rejects escaping the container through a nested ../", () => {
			expect(() => joinContainerPath(container, "Documents/../../../etc")).toThrow(/outside the app's container/);
		});

		test("rejects a sibling container that shares the same name prefix", () => {
			expect(() => joinContainerPath(container, "../ABC-evil/x")).toThrow(/outside the app's container/);
		});
	});

	test.describe("bundle ids", () => {
		test("rejects a bundle id that would be parsed as a command-line flag", () => {
			expect(() => validatePackageName("-r")).toThrow(/Invalid package name/);
			expect(() => validatePackageName("--device=other")).toThrow(/Invalid package name/);
		});

		test("allows a bundle id with hyphens after the first character", () => {
			expect(() => validatePackageName("com.some-company.app")).not.toThrow();
		});
	});
});
