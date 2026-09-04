# Roadmap

This is a living document of planned and in-progress features. Items are roughly prioritized top-to-bottom. Have a feature request? [Open an issue](https://github.com/mobile-next/mobile-mcp/issues/new/choose).

| Feature | Description | Status |
|---|---|---|
| **Background daemon for speedup** | A long-lived background process that keeps device connections, agents and tunnels warm between tool calls, so each call skips discovery and setup and returns in milliseconds instead of seconds. | In Progress |
| **Element refs in UI dump** | Every element in the UI dump gets a stable `@ref` id that can be passed to tap, type, etc., so agents act on elements without coordinates. | In Progress |
| **Embed Android Device Kit in the binary** | Ship the Android agent as a dex embedded in the executable and run it via `app_process`, so nothing gets installed on the device and the Device Kit APK goes away. | In Progress |
| **Streamable HTTP support** | Support the newer MCP Streamable HTTP transport, alongside the existing SSE and stdio transports. | Planned |
| **File system tools** | List, push, and pull files on the device or within an app container. | Planned |
| **Better screenshot handling** | Native cropping and scaling, removing the dependency on `sips` and ImageMagick. | Planned |
| **App launch options** | Launch an app with custom arguments. | Planned |
| **Pinch to zoom** | Pinch-in and pinch-out gesture support for zooming in and out. | Planned |
| **Device logs** | Read device system logs — syslog, console, and logcat. | Planned |
| **WebView support** | Inspect and interact with WebView content inside native apps. | Planned |

## Done Done

Shipped in 2026, most recent first.

| Feature | Description | Date |
|---|---|---|
| **iOS on Device Kit** | Replaced WebDriverAgent with our own Device Kit on real iOS devices too. | 2026-09-04 |
| **Remove go-ios dependency** | Dropped the external `go-ios` dependency entirely. | 2026-09-04 |
| **iOS Device Kit on Simulator** | Replaced WebDriverAgent with our own Device Kit for iOS Simulator automation. | 2026-05-01 |
| **List crashes** | Retrieve crash reports from the device. | 2026-05-01 |
| **SSE authentication** | Optional Bearer-token auth for the SSE server (`--listen` + `MOBILEMCP_AUTH`). | 2026-04-03 |
| **Safe URL schemes** | Restrict `open url` to safe schemes unless explicitly enabled. | 2026-03-27 |
| **Screen recording** | Record the device screen to an mp4 file. | 2026-03-03 |
| **App launch locales** | Launch apps with a specific locale. | 2026-03-03 |
| **Long-press duration** | Control the duration of a long-press. | 2026-01-01 |
