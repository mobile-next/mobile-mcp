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

---

## 🚀 Project Setup

### Prerequisites

- **Homebrew**
  - Check: `brew --version`
  - If not installed:
    ```bash
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    ```

- **git**
  - Check: `git --version`
  - If not installed:
    ```bash
    brew install git
    # or
    xcode-select --install
    ```

- **Node.js**
  - Check: `node --version` (>= 18)
  - If not installed:
    ```bash
    brew install node
    ```

- **npm**
  - Check: `npm --version` (>= 8)
  - If not installed:
    ```bash
    brew install npm
    ```

- **Xcode CLI**
  - Check: `xcode-select -p`
  - If not installed:
    ```bash
    xcode-select --install
    ```

- **go-ios**
  - Check: `go-ios version`
  - If not installed:
    ```bash
    npm install -g go-ios
    ```

- **adb**
  - Check: `adb version`
  - If not installed:
    ```bash
    brew install android-platform-tools
    ```

---

# Prerequisites
node --version    # >= 18
# 👉 If not installed: brew install node
npm --version     # >= 8
# 👉 If not installed: brew install npm
xcode-select -p   # Xcode CLI tools
# 👉 If not installed: xcode-select --install
brew --version    # Homebrew
# 👉 If not installed: see above

git --version     # Git
# 👉 If not installed: see above

# Clone & build
git clone https://github.com/mobile-next/mobile-mcp.git
cd mobile-mcp
npm install && npm run build && npm run test

## 📱 Platform Setup
```bash
# iOS Simulators
xcrun simctl list devices
# If not installed: Install Xcode from App Store
xcrun simctl boot "iPhone 15"
# iOS Devices
go-ios version
# If not installed: npm install -g go-ios
# Android
adb version
# If not installed: brew install android-platform-tools
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

## 🛠️ Add a Feature
1. `git checkout -b feature/your-feature`
2. Update `src/robot.ts` (interface)
3. Implement in `src/android.ts`, `src/ios.ts`, or `src/iphone-simulator.ts`
4. Register in `src/server.ts`
5. Add tests in `test/`
6. `npm run build && npm run test`
7. PR: clear commits, describe changes

## 🔄 Workflow
```bash
npm run watch   # Auto-rebuild
npm run lint    # Lint code
npm run test    # Run tests
node lib/index.js  # Start server
```

## 🗂️ Architecture
```
src/
├── server.ts           # Tool registration
├── robot.ts            # Cross-platform interface
├── android.ts          # Android logic
├── ios.ts              # iOS device logic
├── iphone-simulator.ts # iOS simulator logic
```

## 🤝 Contributing
- Follow patterns in `server.ts`
- Cross-platform support preferred
- Update types, add tests
- Lint, test, document
- Use clear, conventional commits

## ❓ FAQ
- **Xcode/Homebrew error?** Try `sudo` or check permissions.
- **adb not detecting device?** Enable USB debugging, restart adb.
- **Tests failing?** Check Node/npm versions, reinstall deps.
- **Need help?** [Slack](http://mobilenexthq.com/join-slack) or GitHub Issues.

---
**Build the future of mobile automation. Contribute, test, and make an impact!** 