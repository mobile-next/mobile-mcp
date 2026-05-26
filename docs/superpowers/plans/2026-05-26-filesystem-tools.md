# Filesystem MCP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 new MCP tools (`mobile_list_files`, `mobile_create_directory`, `mobile_pull_file`, `mobile_push_file`, `mobile_remove_file`, `mobile_get_app_container_path`) that expose `mobilecli fs` and `mobilecli apps path` to agents.

**Architecture:** Add response type interfaces and 6 wrapper methods to the `Mobilecli` class in `src/mobilecli.ts`, then register the 6 tools using the existing `tool()` helper in `src/server.ts`. Local paths on `pull` and `push` are validated with the existing `validateOutputPath()` to prevent path traversal attacks.

**Tech Stack:** TypeScript, Node.js, mobilecli CLI binary, Zod (for MCP tool parameter schemas), Mocha + Node assert (test runner already configured)

---

## File Map

| File | Change |
|---|---|
| `src/mobilecli.ts` | Add 3 response interfaces + 6 wrapper methods |
| `src/server.ts` | Register 6 new tools near existing app-management tools |
| `test/mobilecli.test.ts` | Add `describe` blocks for each new method |

---

## Task 1: Add types and `fsList` method to `mobilecli.ts` (TDD)

**Files:**
- Modify: `src/mobilecli.ts`
- Test: `test/mobilecli.test.ts`

- [ ] **Step 1: Write the failing test**

Open `test/mobilecli.test.ts` and add this `describe` block inside the top-level `describe("mobilecli", ...)`:

```typescript
describe("fsList", () => {
    const mockResponse = JSON.stringify({
        status: "ok",
        data: [
            { name: "Documents", path: "/data/Documents", size: 0, modTime: "2026-01-01T00:00:00Z", isDir: true },
            { name: "config.json", path: "/data/config.json", size: 512, modTime: "2026-01-01T00:00:00Z", isDir: false },
        ]
    });

    it("should call fs ls with device only", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsList("device1");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "ls", "--device", "device1"]);
    });

    it("should call fs ls with bundleId", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsList("device1", "com.example.app");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "ls", "com.example.app", "--device", "device1"]);
    });

    it("should call fs ls with bundleId and path", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsList("device1", "com.example.app", "/Documents");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "ls", "com.example.app", "/Documents", "--device", "device1"]);
    });

    it("should parse and return the file list", () => {
        const { mobilecli } = createMockMobilecli(mockResponse);
        const result = mobilecli.fsList("device1");

        assert.equal(result.status, "ok");
        assert.equal(result.data.length, 2);
        assert.equal(result.data[0].name, "Documents");
        assert.equal(result.data[0].isDir, true);
        assert.equal(result.data[1].name, "config.json");
        assert.equal(result.data[1].size, 512);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test 2>&1 | grep -A 3 "fsList"
```

Expected: errors like `mobilecli.fsList is not a function`

- [ ] **Step 3: Add response type interfaces to `src/mobilecli.ts`**

Add these three interfaces right after the existing `MobilecliDevicesOptions` interface (before the `const TIMEOUT` line):

```typescript
export interface MobilecliFileEntry {
    name: string;
    path: string;
    size: number;
    modTime: string;
    isDir: boolean;
}

export interface MobilecliFilesListResponse {
    status: "ok";
    data: MobilecliFileEntry[];
}

export interface MobilecliAppContainerPathResponse {
    status: "ok";
    data: {
        path: string;
    };
}
```

- [ ] **Step 4: Add `fsList` method to the `Mobilecli` class**

Add this method after the `getDevices` method (before the closing `}`):

```typescript
fsList(deviceId: string, bundleId?: string, remotePath?: string): MobilecliFilesListResponse {
    const args = ["fs", "ls"];

    if (bundleId) {
        args.push(bundleId);
    }

    if (remotePath) {
        args.push(remotePath);
    }

    args.push("--device", deviceId);
    const output = this.executeCommand(args);
    return JSON.parse(output) as MobilecliFilesListResponse;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test 2>&1 | grep -A 3 "fsList"
```

Expected: `4 passing` lines under `fsList`

- [ ] **Step 6: Commit**

```bash
git add src/mobilecli.ts test/mobilecli.test.ts
git commit -m "feat: add fsList method and response types to Mobilecli"
```

---

## Task 2: Add `appsPath`, `fsMkdir`, and `fsRm` methods (TDD)

**Files:**
- Modify: `src/mobilecli.ts`
- Test: `test/mobilecli.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these three `describe` blocks inside the top-level `describe("mobilecli", ...)` in `test/mobilecli.test.ts`:

```typescript
describe("appsPath", () => {
    const mockResponse = JSON.stringify({
        status: "ok",
        data: { path: "/var/containers/Bundle/Application/ABC123" }
    });

    it("should call apps path with bundle id and device", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.appsPath("device1", "com.example.app");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["apps", "path", "com.example.app", "--device", "device1"]);
    });

    it("should parse and return the container path", () => {
        const { mobilecli } = createMockMobilecli(mockResponse);
        const result = mobilecli.appsPath("device1", "com.example.app");

        assert.equal(result.status, "ok");
        assert.equal(result.data.path, "/var/containers/Bundle/Application/ABC123");
    });
});

describe("fsMkdir", () => {
    const mockResponse = JSON.stringify({ status: "ok" });

    it("should call fs mkdir with path and device", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsMkdir("device1", "/data/newdir");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "mkdir", "/data/newdir", "--device", "device1"]);
    });

    it("should include bundleId when provided", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsMkdir("device1", "/Documents/newdir", "com.example.app");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "mkdir", "com.example.app", "/Documents/newdir", "--device", "device1"]);
    });

    it("should include -p flag when parents is true", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsMkdir("device1", "/data/a/b/c", undefined, true);

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "mkdir", "/data/a/b/c", "-p", "--device", "device1"]);
    });
});

describe("fsRm", () => {
    const mockResponse = JSON.stringify({ status: "ok" });

    it("should call fs rm with path and device", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsRm("device1", "/data/file.txt");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "rm", "/data/file.txt", "--device", "device1"]);
    });

    it("should include bundleId when provided", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsRm("device1", "/Documents/file.txt", "com.example.app");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "rm", "com.example.app", "/Documents/file.txt", "--device", "device1"]);
    });

    it("should include -r flag when recursive is true", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsRm("device1", "/data/mydir", undefined, true);

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "rm", "/data/mydir", "-r", "--device", "device1"]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test 2>&1 | grep -E "appsPath|fsMkdir|fsRm|passing|failing"
```

Expected: errors like `mobilecli.appsPath is not a function`

- [ ] **Step 3: Add `appsPath`, `fsMkdir`, and `fsRm` methods to the `Mobilecli` class**

Add these methods after the `fsList` method in `src/mobilecli.ts`:

```typescript
appsPath(deviceId: string, bundleId: string): MobilecliAppContainerPathResponse {
    const output = this.executeCommand(["apps", "path", bundleId, "--device", deviceId]);
    return JSON.parse(output) as MobilecliAppContainerPathResponse;
}

fsMkdir(deviceId: string, remotePath: string, bundleId?: string, parents?: boolean): void {
    const args = ["fs", "mkdir"];

    if (bundleId) {
        args.push(bundleId);
    }

    args.push(remotePath);

    if (parents) {
        args.push("-p");
    }

    args.push("--device", deviceId);
    this.executeCommand(args);
}

fsRm(deviceId: string, remotePath: string, bundleId?: string, recursive?: boolean): void {
    const args = ["fs", "rm"];

    if (bundleId) {
        args.push(bundleId);
    }

    args.push(remotePath);

    if (recursive) {
        args.push("-r");
    }

    args.push("--device", deviceId);
    this.executeCommand(args);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test 2>&1 | grep -E "appsPath|fsMkdir|fsRm|passing|failing"
```

Expected: all new tests passing, no new failures

- [ ] **Step 5: Commit**

```bash
git add src/mobilecli.ts test/mobilecli.test.ts
git commit -m "feat: add appsPath, fsMkdir, fsRm methods to Mobilecli"
```

---

## Task 3: Add `fsPull` and `fsPush` methods (TDD)

**Files:**
- Modify: `src/mobilecli.ts`
- Test: `test/mobilecli.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these two `describe` blocks inside `describe("mobilecli", ...)` in `test/mobilecli.test.ts`:

```typescript
describe("fsPull", () => {
    const mockResponse = JSON.stringify({ status: "ok" });

    it("should call fs pull with remote path, local path, and device", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsPull("device1", "/data/remote.txt", "/tmp/local.txt");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "pull", "/data/remote.txt", "/tmp/local.txt", "--device", "device1"]);
    });
});

describe("fsPush", () => {
    const mockResponse = JSON.stringify({ status: "ok" });

    it("should call fs push with local path, remote path, and device", () => {
        const { mobilecli, calls } = createMockMobilecli(mockResponse);
        mobilecli.fsPush("device1", "/tmp/local.txt", "/data/remote.txt");

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ["fs", "push", "/tmp/local.txt", "/data/remote.txt", "--device", "device1"]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test 2>&1 | grep -E "fsPull|fsPush|passing|failing"
```

Expected: errors like `mobilecli.fsPull is not a function`

- [ ] **Step 3: Add `fsPull` and `fsPush` methods to the `Mobilecli` class**

Add after the `fsRm` method in `src/mobilecli.ts`:

```typescript
fsPull(deviceId: string, remotePath: string, localPath: string): void {
    this.executeCommand(["fs", "pull", remotePath, localPath, "--device", deviceId]);
}

fsPush(deviceId: string, localPath: string, remotePath: string): void {
    this.executeCommand(["fs", "push", localPath, remotePath, "--device", deviceId]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test 2>&1 | grep -E "fsPull|fsPush|passing|failing"
```

Expected: all new tests passing, no new failures

- [ ] **Step 5: Commit**

```bash
git add src/mobilecli.ts test/mobilecli.test.ts
git commit -m "feat: add fsPull and fsPush methods to Mobilecli"
```

---

## Task 4: Register `mobile_list_files` and `mobile_get_app_container_path` tools in `server.ts`

**Files:**
- Modify: `src/server.ts`

These are read-only tools with no local filesystem interaction.

- [ ] **Step 1: Add the two tools to `src/server.ts`**

Find the `mobile_uninstall_app` tool registration (around line 392 in the current file) and add the two new tools immediately after its closing `);`:

```typescript
tool(
    "mobile_list_files",
    "List Files",
    "List files on the device or in an app's container. Use mobile_get_app_container_path to get the container path for a specific app.",
    {
        device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        bundleId: z.string().optional().describe("App bundle ID to list files in its container. Omit to list the device root."),
        path: z.string().optional().describe("Remote path to list. Omit to list the root of the bundle or device."),
    },
    { readOnlyHint: true },
    async ({ device, bundleId, path: remotePath }) => {
        ensureMobilecliAvailable();
        const response = mobilecli.fsList(device, bundleId, remotePath);
        const entries = response.data.map(entry => {
            const type = entry.isDir ? "dir " : "file";
            const size = entry.isDir ? "" : ` (${entry.size} bytes)`;
            return `${type}  ${entry.name}${size}`;
        });
        return entries.join("\n") || "Empty directory";
    }
);

tool(
    "mobile_get_app_container_path",
    "Get App Container Path",
    "Get the container path of an app on the device. Useful as a base path for mobile_list_files, mobile_pull_file, mobile_push_file, and similar tools.",
    {
        device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        bundleId: z.string().describe("The app bundle ID whose container path to retrieve"),
    },
    { readOnlyHint: true },
    async ({ device, bundleId }) => {
        ensureMobilecliAvailable();
        const response = mobilecli.appsPath(device, bundleId);
        return response.data.path;
    }
);
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run build 2>&1
```

Expected: no errors, `lib/` updated

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add mobile_list_files and mobile_get_app_container_path tools"
```

---

## Task 5: Register `mobile_create_directory` and `mobile_remove_file` tools in `server.ts`

**Files:**
- Modify: `src/server.ts`

These are destructive device-side tools with no local path involvement.

- [ ] **Step 1: Add the two tools to `src/server.ts`**

Add immediately after the `mobile_get_app_container_path` tool registration:

```typescript
tool(
    "mobile_create_directory",
    "Create Directory",
    "Create a directory on the device or in an app's container",
    {
        device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        path: z.string().describe("The remote path of the directory to create"),
        bundleId: z.string().optional().describe("App bundle ID to create the directory in its container. Omit to operate on the device filesystem."),
        parents: z.boolean().optional().describe("Create parent directories as needed"),
    },
    { destructiveHint: true },
    async ({ device, path: remotePath, bundleId, parents }) => {
        ensureMobilecliAvailable();
        mobilecli.fsMkdir(device, remotePath, bundleId, parents);
        return `Created directory ${remotePath}`;
    }
);

tool(
    "mobile_remove_file",
    "Remove File",
    "Remove a file or directory on the device or in an app's container",
    {
        device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        path: z.string().describe("The remote path to remove"),
        bundleId: z.string().optional().describe("App bundle ID to remove from its container. Omit to operate on the device filesystem."),
        recursive: z.boolean().optional().describe("Remove directories and their contents recursively"),
    },
    { destructiveHint: true },
    async ({ device, path: remotePath, bundleId, recursive }) => {
        ensureMobilecliAvailable();
        mobilecli.fsRm(device, remotePath, bundleId, recursive);
        return `Removed ${remotePath}`;
    }
);
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run build 2>&1
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add mobile_create_directory and mobile_remove_file tools"
```

---

## Task 6: Register `mobile_pull_file` and `mobile_push_file` tools with security validation

**Files:**
- Modify: `src/server.ts`

These tools touch local paths and must validate them using the existing `validateOutputPath` to prevent path traversal attacks (the same guard used by `mobile_save_screenshot`).

- [ ] **Step 1: Add the two tools to `src/server.ts`**

Add immediately after the `mobile_remove_file` tool registration:

```typescript
tool(
    "mobile_pull_file",
    "Pull File",
    "Pull a file from the device or from an app's container to the local machine. The local path must be within the current directory or the temp directory.",
    {
        device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        remotePath: z.string().describe("The path on the device to pull from"),
        localPath: z.string().describe("The destination path on the local machine. Must be within the current working directory or the system temp directory."),
    },
    { readOnlyHint: true },
    async ({ device, remotePath, localPath }) => {
        ensureMobilecliAvailable();
        validateOutputPath(localPath);
        mobilecli.fsPull(device, remotePath, localPath);
        return `Pulled ${remotePath} to ${localPath}`;
    }
);

tool(
    "mobile_push_file",
    "Push File",
    "Push a file from the local machine to the device or into an app's container. The local path must be within the current directory or the temp directory.",
    {
        device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        localPath: z.string().describe("The source path on the local machine. Must be within the current working directory or the system temp directory."),
        remotePath: z.string().describe("The destination path on the device"),
    },
    { destructiveHint: true },
    async ({ device, localPath, remotePath }) => {
        ensureMobilecliAvailable();
        validateOutputPath(localPath);
        mobilecli.fsPush(device, localPath, remotePath);
        return `Pushed ${localPath} to ${remotePath}`;
    }
);
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run build 2>&1
```

Expected: no errors

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1
```

Expected: all existing tests still pass, no regressions

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: add mobile_pull_file and mobile_push_file tools with path validation"
```
