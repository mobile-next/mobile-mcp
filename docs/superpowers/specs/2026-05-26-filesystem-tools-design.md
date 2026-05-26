# Filesystem MCP Tools Design

**Date:** 2026-05-26

## Overview

Add 6 new MCP tools that expose `mobilecli fs` and `mobilecli apps path` to agents. These tools let agents list, read, write, and manage files on a connected device or inside an app's container, and look up an app's container path.

## New Tools

| MCP Tool | mobilecli command | Annotation |
|---|---|---|
| `mobile_list_files` | `fs ls [bundle-id] [path] --device` | readOnly |
| `mobile_create_directory` | `fs mkdir [bundle-id] <path> [-p] --device` | destructive |
| `mobile_pull_file` | `fs pull <remote-path> <local-path> --device` | readOnly |
| `mobile_push_file` | `fs push <local-path> <remote-path> --device` | destructive |
| `mobile_remove_file` | `fs rm [bundle-id] <path> [-r] --device` | destructive |
| `mobile_get_app_container_path` | `apps path <bundle-id> --device` | readOnly |

## Parameters

### `mobile_list_files`
- `device` (required) — device ID
- `bundleId` (optional) — app bundle ID; omit to list device root
- `path` (optional) — remote path to list; omit to list root of bundle/device

### `mobile_create_directory`
- `device` (required)
- `path` (required) — remote path to create
- `bundleId` (optional) — app bundle ID; omit to operate on device filesystem
- `parents` (optional, boolean, default false) — create parent directories as needed (`-p`)

### `mobile_pull_file`
- `device` (required)
- `remotePath` (required) — path on device
- `localPath` (required) — destination path on the machine running the MCP server (caller specifies)

### `mobile_push_file`
- `device` (required)
- `localPath` (required) — source path on the machine running the MCP server
- `remotePath` (required) — destination path on device

### `mobile_remove_file`
- `device` (required)
- `path` (required) — remote path to remove
- `bundleId` (optional) — app bundle ID; omit to operate on device filesystem
- `recursive` (optional, boolean, default false) — remove directories recursively (`-r`)

### `mobile_get_app_container_path`
- `device` (required)
- `bundleId` (required) — app bundle ID whose container path to retrieve

## Architecture

Changes touch exactly two files:

### `src/mobilecli.ts`
- Add response type interfaces: `MobilecliFilesListResponse`, `MobilecliFileEntry`, `MobilecliAppContainerPathResponse`
- Add 6 wrapper methods on the `Mobilecli` class:
  - `fsList(deviceId, bundleId?, path?)` — calls `fs ls`
  - `fsMkdir(deviceId, path, bundleId?, parents?)` — calls `fs mkdir`
  - `fsPull(deviceId, remotePath, localPath)` — calls `fs pull`
  - `fsPush(deviceId, localPath, remotePath)` — calls `fs push`
  - `fsRm(deviceId, path, bundleId?, recursive?)` — calls `fs rm`
  - `appsPath(deviceId, bundleId)` — calls `apps path`

### `src/server.ts`
- Register 6 tools using the existing `tool()` helper
- Place near the existing app management tools (`mobile_list_apps`, `mobile_install_app`, etc.)
- Each tool calls `ensureMobilecliAvailable()` then delegates to the appropriate `mobilecli.*` method

## Data Flow

```
MCP client → tool() in server.ts → Mobilecli method → execFileSync(mobilecli, args) → JSON response
```

`fsList` returns formatted text (one entry per line with name, size, type).  
`fsPull`/`fsPush`/`fsMkdir`/`fsRm` return a brief success message.  
`appsPath` returns the container path string.

## Error Handling

No special handling needed beyond what the existing `tool()` wrapper already does — it catches thrown errors and returns them as MCP error responses.

## Out of Scope

- Streaming large file transfers
- Returning file contents inline (pull always writes to a caller-specified local path)
