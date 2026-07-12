# Mobile MCP — Automated Installation Guide

This file is written for AI coding agents (Cline, Cursor, Claude Code, etc.) to install and
configure the Mobile MCP server automatically. Follow the steps in order.

## What this server does

Mobile MCP lets an agent drive real iOS and Android devices, simulators, and emulators through
one interface: taps, swipes, gestures, app install/launch/terminate, screenshots, structured UI
element extraction, screen recording, and crash reports.

## Prerequisites

Check that the user's machine has:

- **Node.js v20+** (the server runs via `npx`, no separate install needed)
- **Android** targets: Android Platform Tools with `adb` on `PATH`
- **iOS** targets (macOS only): Xcode command line tools
- At least one target available: a booted iOS Simulator, a running Android emulator, or a
  connected real device

No API key or credentials are required.

## Installation

Add the server to the MCP configuration.

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "npx",
      "args": ["-y", "@mobilenext/mobile-mcp@latest"]
    }
  }
}
```

## Verify the installation

Ask the agent to call the `mobile_list_available_devices` tool. A working install returns the list
of connected simulators, emulators, and devices. If the list is empty, make sure a simulator or
emulator is running, or that a device is connected and authorized.

## Notes

- **iOS real devices** need extra setup (go-ios + WebDriverAgent + a device tunnel). Simulators and
  Android need no extra setup beyond the prerequisites above. See the
  [README](https://github.com/mobile-next/mobile-mcp) and
  [wiki](https://github.com/mobile-next/mobile-mcp/wiki) for details.
