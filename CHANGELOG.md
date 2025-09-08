## [0.0.25](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.25) (2025-09-08)

* Server: install mobile-mcp in vscode with a single-click in README ([#173](https://github.com/mobile-next/mobile-mcp/pull/173))
* Android: try finding 'adb' under $HOME/Library/Android if $ANDROID_HOME is not defined ([#183](https://github.com/mobile-next/mobile-mcp/pull/183))
* Android: better escaping of text input, for improved security ([#182](https://github.com/mobile-next/mobile-mcp/pull/183))

## [0.0.24](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.24) (2025-08-24)

* iOS: new tool for long press ([#143](https://github.com/mobile-next/mobile-mcp/pull/143))
* Android: new tool for long press ([#143](https://github.com/mobile-next/mobile-mcp/pull/143))
* Android: fixed screenshot from devices with multiple devices (foldables) again ([#171](https://github.com/mobile-next/mobile-mcp/pull/171))

## [0.0.23](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.23) (2025-07-31)

* Android: fixed a bug where devices with multiple screens (such as foldables) failed to take and save screenshot ([#159](https://github.com/mobile-next/mobile-mcp/pull/159))

## [0.0.22](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.22) (2025-07-17)

* iOS: fixed detection of go-ios installation ([#132](https://github.com/mobile-next/mobile-mcp/pull/132) by [@codeaholicguy](https://github.com/codeaholicguy)

## [0.0.21](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.21) (2025-06-27)

* Server: use node: prefixed modules (like node:fs) ([449c498](https://github.com/mobile-next/mobile-mcp/commit/449c498e6e9a3e68aab55ea82f15c296171fc05e))
* iOS: automatically start WebDriverAgent on simulator if already installed ([#126](https://github.com/mobile-next/mobile-mcp/pull/126))
* Android: fixed detection of com.mobilenext.devicekit when running mcp on windows ([c11c642](https://github.com/mobile-next/mobile-mcp/commit/c11c6427c71cb7cef6ce87005047df977f6bea8a))

## [0.0.20](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.20) (2025-06-23)

* Server: new tool `save_screenshot` which saves the screenshot to disk, to be used by other mcp servers ([#112](https://github.com/mobile-next/mobile-mcp/pull/112))
* Server: new tool `use_default_device` which picks the only device that is connected, to speed up use ([#112](https://github.com/mobile-next/mobile-mcp/pull/112))
* iOS: Use wda to grab screenshots for both real devices and simulators ([#115](https://github.com/mobile-next/mobile-mcp/pull/115))
* Android: Support for utf-8 text in sendKeys, see [wiki page]() for getting started ([#117](https://github.com/mobile-next/mobile-mcp/pull/117))

## [0.0.19](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.19) (2025-06-16)

* Server: Fixed support for Windsurf, where some tools caused a -32602 error ([#101](https://github.com/mobile-next/mobile-mcp/pull/101)) by [@amebahead](https://github.com/amebahead)
* iOS: Support for swipe left and right. Support x,y,direction,duration for custom swipes ([#92](https://github.com/mobile-next/mobile-mcp/pull/92/)) by [@benlmyers](https://github.com/benlmyers)
* Android: Support for swipe left and right. Support x,y,direction,duration for custom swipes ([#92](https://github.com/mobile-next/mobile-mcp/pull/92/)) by [@benlmyers](https://github.com/benlmyers)
* Android: Fix for get elements on screen, where uiautomator prints out warnings before the actual xml ([#86](https://github.com/mobile-next/mobile-mcp/pull/86)) by [@wenerme](https://github.com/wenerme)

## [0.0.18](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.18) (2025-06-12)

* Server: New support for SSE (Server-Sent-Events) transport, [see wiki for more information](https://github.com/mobile-next/mobile-mcp/wiki/Using-SSE-Transport) ([1b70d40](https://github.com/mobile-next/mobile-mcp/commit/1b70d403cd562a97a0723464f2b286f2fd6eee0a))
* iOS: Using plutil for `simctl listapps` parsing, might probably fix some parsing issues ([cfba3aa](https://github.com/mobile-next/mobile-mcp/commit/cfba3aaac5beb66d08d1138fe42c924309ede303))
* Other: We have a new Slack server, join us at http://mobilenexthq.com/join-slack

## [0.0.17](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.17) (2025-05-16)

* iOS: Fixed parsing of simctl listapps where CFBundleDisplayName contains non-alphanumerical characters ([#59](https://github.com/mobile-next/mobile-mcp/issues/59)) ([bf19771d](https://github.com/mobile-next/mobile-mcp/pull/63/commits/bf19771dcd49444ba4841ec649e3a72a03b54c74))

## [0.0.16](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.16) (2025-05-10)

* Server: Detect if there is a new version of the mcp and notify user ([14b015f](https://github.com/mobile-next/mobile-mcp/commit/14b015f29ab47aa1f3ae122a670a58eb7ef51fd8))
* Server: Instead of returning x,y for tap, return [top,left,width,height] of elements on screen ([3169d2f](https://github.com/mobile-next/mobile-mcp/commit/3169d2f46f0c789e4c3188e137ac645d6f6eb27c))
* iOS: Fixed coordinates location for iOS with retina display after image scaledown ([3169d2f](https://github.com/mobile-next/mobile-mcp/commit/3169d2f46f0c789e4c3188e137ac645d6f6eb27c))
* iOS: Added detection of StaticText and Image in mobile_list_elements_on_screen ([debe75b](https://github.com/mobile-next/mobile-mcp/commit/debe75b5c8afcafcef8328201e9886bffdd1f128))

## [0.0.15](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.15) (2025-05-04)

* Android: Fixed broken Android screenshots on Windows because of crlf ([#53](https://github.com/mobile-next/mobile-mcp/pull/53/files) by [@hanyuan97](https://github.com/hanyuan97))

## [0.0.14](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.14) (2025-05-02)

* Server: Fix a bug where xcrun was required, now works on Linux as well ([7fddba7](https://github.com/mobile-next/mobile-mcp/commit/7fddba71af51690cfa76f81154f72c3120ab7f07))
* Server: Removed dependency on sharp which was causing issues during installation, now ImageMagick is an optional dependency
* Android: Try uiautomator-dump multiple times, in case ui hierarchy is not stable
* Android: Return more information about elements on screen for better element detection
* Android: Support for Android TV using dpad for navigation ([399443d](https://github.com/mobile-next/mobile-mcp/commit/399443d519284a54b670a1598689a73d178db2ec) by [@surajsau](https://github.com/surajsau))

## [0.0.13](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.13) (2025-04-17)

* Server: Fix a bug where 'adb' is required to even work with iOS-only ([#30](https://github.com/mobile-next/mobile-mcp/issues/30)) ([867f662](https://github.com/mobile-next/mobile-mcp/pull/35/commits/867f662ac2edc68d542519bd72d1762d3dbca18d))
* iOS: Support for orientation changes ([844dc0e](https://github.com/mobile-next/mobile-mcp/pull/28/commits/844dc0eb953169871b4cdd2a57735bf50abe721a))
* Android: Support for orientation changes (eg 'change device to landscape') ([844dc0e](https://github.com/mobile-next/mobile-mcp/pull/28/commits/844dc0eb953169871b4cdd2a57735bf50abe721a))
* Android: Improve element detection by using element name if label not found ([8e8aadf](https://github.com/mobile-next/mobile-mcp/pull/33/commits/8e8aadfd7f300ff5b7f0a7857a99d1103cd9e941) by [@tomoya0x00](https://github.com/tomoya0x00))

## [0.0.12](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.12) (2025-04-12)

* Server: If hitting an error with tunnel, forward proxy, wda, descriptive error and link to documentation will be returned
* iOS: go-ios path can be set in env GO_IOS_PATH
* iOS: Support go-ios that was built locally (no version)
* iOS: Return bundle display name for apps for better app launch
* iOS: Fixed finding element coordinates on retina displays
* iOS: Saving temporary screenshots onto temporary directory ([#19](https://github.com/mobile-next/mobile-mcp/issues/19))
* iOS: Find elements better by removing off-screen and hidden elements
* Android: Support for 'adb' under ANDROID_HOME
* Android: Find elements better using accessibility hints and class names

## [0.0.11](https://github.com/mobile-next/mobile-mcp/releases/tag/0.0.11) (2025-04-06)

* Server: Support submit after sending text (\n)
* Server: Added support for multiple devices at the same time
* iOS: Support for iOS physical devices using go-ios ([see wiki](https://github.com/mobile-next/mobile-mcp/wiki/Getting-Started-with-iOS-Physical-Device))
* iOS: Added support for icons, search fields, and switches when getting elements on screen
