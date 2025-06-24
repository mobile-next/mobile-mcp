# Mobile MCP Development Setup - macOS Guide

This guide will help you set up a complete development environment for Mobile MCP on macOS, covering both iOS simulators and Android emulators.

## 📋 Prerequisites

### System Requirements
- **macOS**: 10.15+ (Catalina or later)
- **Xcode**: Latest version from App Store
- **Node.js**: v18+ (v20+ recommended)
- **Git**: For version control

### Quick Environment Check
```bash
# Verify your current setup
node --version    # Should be >= 18
npm --version     # Should be >= 8
git --version     # Any recent version
xcode-select -p   # Should show Xcode path
```

## 🛠️ Initial Setup

### 1. Install Core Development Tools

**Install Xcode Command Line Tools:**
```bash
xcode-select --install
```

**Install Node.js (if not already installed):**
```bash
# Option 1: Using Homebrew (recommended)
brew install node

# Option 2: Download from nodejs.org
# https://nodejs.org/en/download/

# Option 3: Using nvm for version management
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

**Install TypeScript globally:**
```bash
npm install -g typescript
```

### 2. Clone and Setup Project

```bash
# Clone the repository
git clone https://github.com/mobile-next/mobile-mcp.git
cd mobile-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Verify installation
node lib/index.js --help
```

## 📱 Platform-Specific Setup

### iOS Development Setup

**1. Verify iOS Simulator Access:**
```bash
# List available simulators
xcrun simctl list devices

# Boot a simulator for testing
xcrun simctl boot "iPhone 15"  # or any available device
```

**2. Install go-ios (for physical iOS devices):**
```bash
# Install globally via npm
npm install -g go-ios

# Verify installation
ios version
```

**Alternative go-ios installation methods:**
```bash
# Using Homebrew
brew install go-ios

# Manual installation from releases
# Download from: https://github.com/danielpaulus/go-ios/releases
```

**3. WebDriverAgent Setup:**
For iOS automation, WebDriverAgent needs to be running. This typically requires:
- Xcode project setup (see [iOS Wiki](https://github.com/mobile-next/mobile-mcp/wiki))
- Signing certificates for physical devices
- Port forwarding setup

### Android Development Setup

**1. Install Android SDK Platform Tools:**
```bash
# Option 1: Using Homebrew
brew install android-platform-tools

# Option 2: Using Android Studio
# Download Android Studio and install SDK through the IDE

# Option 3: Manual download
# Download from: https://developer.android.com/tools/releases/platform-tools
```

**2. Set Environment Variables:**
```bash
# Add to your ~/.zshrc or ~/.bash_profile
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"

# Reload your shell
source ~/.zshrc  # or source ~/.bash_profile
```

**3. Verify ADB Installation:**
```bash
adb version
adb devices  # Should list connected devices/emulators
```

**4. Setup Android Emulator (Optional):**
```bash
# If using Android Studio, create an AVD through the IDE
# Or use command line:
avdmanager create avd -n "Mobile_MCP_Test" -k "system-images;android-33;google_apis;arm64-v8a"
emulator -avd Mobile_MCP_Test
```

## 🚀 Development Workflow

### Building and Testing
```bash
# Development with auto-rebuild
npm run watch

# Single build
npm run build

# Run linting
npm run lint

# Run tests (requires devices/simulators)
npm test

# Test specific components
npx mocha --require ts-node/register test/iphone-simulator.ts
npx mocha --require ts-node/register test/android.ts
```

### Testing the MCP Server
```bash
# Test help command
node lib/index.js --help

# Start server in stdio mode (default)
node lib/index.js

# Start server with SSE on custom port
node lib/index.js --port 3000
```

### Integration Testing
Test your local development version with MCP clients:

**Cursor/Cline Configuration:**
```json
{
  "mcpServers": {
    "mobile-mcp-dev": {
      "command": "node",
      "args": ["~/path/to/mobile-mcp/lib/index.js"]
    }
  }
}
```

## 📂 Project Structure

```
src/
├── server.ts              # Main MCP server logic & tool registration
├── index.ts               # CLI entry point
├── robot.ts               # Core device abstraction interface
├── android.ts             # Android implementation (ADB + UIAutomator)
├── ios.ts                 # iOS physical device (go-ios + WebDriverAgent)
├── iphone-simulator.ts    # iOS simulator (simctl + WebDriverAgent)
├── webdriver-agent.ts     # WebDriverAgent HTTP client
├── image-utils.ts         # Image processing utilities
├── png.ts                 # PNG handling
└── logger.ts              # Logging utilities

test/                      # Test suites for each platform
lib/                       # Compiled JavaScript output
```

## 🔧 IDE Setup Recommendations

### VS Code Configuration
```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.formatOnSave": true,
  "editor.rulers": [120],
  "typescript.preferences.quoteStyle": "double"
}
```

**Recommended VS Code Extensions:**
- TypeScript Importer
- ESLint
- Prettier - Code formatter
- GitLens — Git supercharged
- Error Lens
- Auto Rename Tag

### Terminal Setup
```bash
# Add helpful aliases to ~/.zshrc or ~/.bash_profile
alias mcp-build="npm run build"
alias mcp-watch="npm run watch"
alias mcp-test="npm test"
alias mcp-lint="npm run lint"
alias mcp-start="node lib/index.js"

# iOS simulator helpers
alias ios-list="xcrun simctl list devices"
alias ios-boot="xcrun simctl boot"

# Android helpers
alias android-devices="adb devices"
alias android-emulator="emulator -list-avds && emulator -avd"
```

## 🐛 Common Issues & Troubleshooting

### iOS Issues
**Problem**: `WebDriverAgent is not running on simulator`
```bash
# Solution: Ensure Xcode is properly set up
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcrun simctl list devices
```

**Problem**: `go-ios` command not found
```bash
# Solution: Install go-ios and verify PATH
npm install -g go-ios
which ios  # Should show installation path
```

### Android Issues
**Problem**: `adb: command not found`
```bash
# Solution: Install platform tools and set PATH
brew install android-platform-tools
echo 'export PATH="$PATH:$(brew --prefix)/bin"' >> ~/.zshrc
```

**Problem**: `ANDROID_HOME` not set
```bash
# Solution: Set environment variable
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

### Build Issues
**Problem**: TypeScript compilation errors
```bash
# Solution: Clean and rebuild
npm run clean
npm install
npm run build
```

**Problem**: ESLint errors
```bash
# Solution: Auto-fix common issues
npm run lint -- --fix
```

### Testing Issues
**Problem**: Tests fail with device connection errors
```bash
# Solution: Ensure devices are connected and accessible
# For iOS:
xcrun simctl list devices | grep Booted

# For Android:
adb devices
```

## 🚀 Contributing

### Before Making Changes
1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test on both iOS and Android if applicable
4. Run linting: `npm run lint`
5. Build successfully: `npm run build`

### Testing Your Changes
1. Test with simulators/emulators
2. Verify MCP tool integration works
3. Test with different device types if possible

### Submitting Changes
1. Commit with descriptive messages
2. Push to your fork
3. Create a pull request with clear description

## 📚 Additional Resources

- **Project Wiki**: [GitHub Wiki](https://github.com/mobile-next/mobile-mcp/wiki)
- **MCP Documentation**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **iOS Setup Guide**: [Wiki - iOS Setup](https://github.com/mobile-next/mobile-mcp/wiki/)
- **Community**: [Slack Channel](http://mobilenexthq.com/join-slack)
- **Issues**: [GitHub Issues](https://github.com/mobile-next/mobile-mcp/issues)

---

**Ready to start developing?** 🎉
1. Follow the setup steps above
2. Start with `npm run watch`
3. Make a small test change
4. Join the community for support! 