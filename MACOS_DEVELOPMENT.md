# 📱 Mobile MCP Development – macOS Quick Guide

---

## 📑 Table of Contents
1. [Project Setup](#project-setup)
2. [Platform Setup](#platform-setup)
3. [Add a Feature](#add-a-feature)
4. [Workflow](#workflow)
5. [Architecture](#architecture)
6. [Contributing](#contributing)
7. [FAQ](#faq)

## Project Setup🚀

Before you start, make sure you have these tools installed:

- **Homebrew**
  - Check:
    ```bash
    brew --version
    ```
  - If not installed:
    ```bash
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    ```

- **git**
  - Check:
    ```bash
    git --version
    ```
  - If not installed:
    ```bash
    brew install git
    # or
    xcode-select --install
    ```

- **Node.js** (>= 18)
  - Check:
    ```bash
    node --version
    ```
  - If not installed:
    ```bash
    brew install node
    ```

- **Xcode CLI**
  - Check:
    ```bash
    xcode-select -p
    ```
  - If not installed:
    ```bash
    xcode-select --install
    ```

- **go-ios**
  - Check:
    ```bash
    go-ios version
    ```
  - If not installed:
    ```bash
    npm install -g go-ios
    ```

- **adb**
  - Check:
    ```bash
    adb version
    ```
  - If not installed:
    ```bash
    brew install android-platform-tools
    ```

---

### Clone & Build

```bash
git clone https://github.com/mobile-next/mobile-mcp.git
cd mobile-mcp
npm install && npm run build && npm run test
```

## Platform Setup📱

### iOS Simulators

Check available simulators:
```bash
xcrun simctl list devices
```
> If not installed: Install Xcode from the App Store

Boot a simulator:
```bash
xcrun simctl boot "iPhone 15"
```

### iOS Devices

Check go-ios:
```bash
go-ios version
```
> If not installed:
```bash
npm install -g go-ios
```

### Android

Check adb:
```bash
adb version
```
> If not installed:
```bash
brew install android-platform-tools
```

Set Android environment variables:
```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

## Add a Feature🔨

Want to contribute a new tool or capability? Here's how:

1. Create a new branch:
    ```bash
    git checkout -b feature/your-feature
    ```
2. Update the interface in `src/robot.ts`
3. Implement your feature in:
    - `src/android.ts`
    - `src/ios.ts`
    - or `src/iphone-simulator.ts`
4. Register your tool in `src/server.ts`
5. Add or update tests in `test/`
6. Build and test:
    ```bash
    npm run build && npm run test
    ```
7. Open a pull request with clear commits and a helpful description.

## Workflow🔄
```bash
npm run watch   # Auto-rebuild
npm run lint    # Lint code
npm run test    # Run tests
node lib/index.js  # Start server
```

## Architecture📁

Project structure:
```
src/
├── server.ts           # Tool registration
├── robot.ts            # Cross-platform interface
├── android.ts          # Android logic
├── ios.ts              # iOS device logic
├── iphone-simulator.ts # iOS simulator logic
```

## Contributing🤝
- Follow patterns in `server.ts`
- Cross-platform support preferred
- Update types, add tests
- Lint, test, document
- Use clear, conventional commits

## FAQ❓
- **Xcode/Homebrew error?** Try `sudo` or check permissions.
- **adb not detecting device?** Enable USB debugging, restart adb.
- **Tests failing?** Check Node/npm versions, reinstall deps.
- **Need help?** [Slack](http://mobilenexthq.com/join-slack) or GitHub Issues.

---
Build the future of mobile automation. Contribute, test, and make an impact! 