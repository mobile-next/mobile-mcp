# Roadmap

This is a living document of planned and in-progress features. Items are roughly prioritized top-to-bottom. Have a feature request? [Open an issue](https://github.com/mobile-next/mobile-mcp/issues/new/choose).

| Feature | Description | Status |
|---|---|---|
| **iOS on Device Kit** | Replace WebDriverAgent with our own Device Kit for faster, more reliable iOS automation. | In Progress |
| **Remove go-ios dependency** | Drop the external `go-ios` dependency entirely as Device Kit takes over. | In Progress |
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
| **iOS Device Kit on Simulator** | Replaced WebDriverAgent with our own Device Kit for iOS Simulator automation. | 2026-05-01 |
| **List crashes** | Retrieve crash reports from the device. | 2026-05-01 |
| **SSE authentication** | Optional Bearer-token auth for the SSE server (`--listen` + `MOBILEMCP_AUTH`). | 2026-04-03 |
| **Safe URL schemes** | Restrict `open url` to safe schemes unless explicitly enabled. | 2026-03-27 |
| **Screen recording** | Record the device screen to an mp4 file. | 2026-03-03 |
| **App launch locales** | Launch apps with a specific locale. | 2026-03-03 |
| **Long-press duration** | Control the duration of a long-press. | 2026-01-01 |
