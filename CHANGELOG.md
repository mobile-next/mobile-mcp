## [0.0.13](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.13) (2025-04-17)

* Server: fix a bug where 'adb' is required to even work with iOS-only ([#30](https://github.com/mobile-next/mobile-mcp/issues/30)) ([867f662](https://github.com/mobile-next/mobile-mcp/pull/35/commits/867f662ac2edc68d542519bd72d1762d3dbca18d))
* iOS: Support for orientation changes ([844dc0e](https://github.com/mobile-next/mobile-mcp/pull/28/commits/844dc0eb953169871b4cdd2a57735bf50abe721a))
* Android: Support for orientation changes (eg 'change device to landscape') ([844dc0e](https://github.com/mobile-next/mobile-mcp/pull/28/commits/844dc0eb953169871b4cdd2a57735bf50abe721a))
* Android: Improve element detection by using element name if label not found ([8e8aadf](https://github.com/mobile-next/mobile-mcp/pull/33/commits/8e8aadfd7f300ff5b7f0a7857a99d1103cd9e941) by @tomoya0x00)

## [0.0.12](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.12) (2025-04-12)

* Server: If hitting an error with tunnel, forward proxy, wda, descriptive error and link to documentation will be returned
* iOS: go-ios path can be set in env GO_IOS_PATH
* iOS: Support go-ios that was built locally (no version)
* iOS: Return bundle display name for apps for better app launch
* iOS: Fixed finding element coordinates on retina displays 
* iOS: Saving temporary screenshots onto temporary directory (fixes [#19](https://github.com/mobile-next/mobile-mcp/issues/19))
* iOS: Find elements better by removing off-screen and hidden elements
* Android: Support for 'adb' under ANDROID_HOME
* Android: Find elements better using accessibility hints and class names

## [0.0.11](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.11) (2025-04-06)

* Server: Support submit after sending text (\n)
* Server: Added support for multiple devices at the same time
* iOS: Support for iOS physical devices using go-ios ([see wiki](https://github.com/mobile-next/mobile-mcp/wiki/Getting-Started-with-iOS-Physical-Device))
* iOS: Added support for icons, search fields, and switches when getting elements on screen
