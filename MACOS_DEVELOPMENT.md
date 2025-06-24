# 📱 Mobile MCP Development - macOS Guide

## 🚀 Like This Project? Want to Contribute?

**Mobile MCP** is revolutionizing mobile automation by bringing AI agents to iOS and Android devices. If you're excited about:

✨ **AI-driven mobile automation** - Let LLMs control real mobile apps  
🤖 **Cross-platform development** - One API for iOS, Android, simulators & physical devices  
🛠️ **Developer tools** - Building the future of mobile testing and automation  
🌍 **Open source impact** - Contributing to tools used by thousands of developers  

**Then you're in the right place!** 🎉

### 🎯 What You'll Build

Contributors to Mobile MCP create tools that enable AI agents to:
- **Automate complex workflows** across multiple mobile apps
- **Test mobile applications** with natural language instructions  
- **Extract data** from any mobile interface
- **Simulate user interactions** for testing and automation
- **Control real devices** programmatically through simple commands

### 💻 This Guide Will Show You:

1. **🔧 Complete macOS setup** - Get your development environment ready
2. **📱 iOS & Android configuration** - Work with simulators, emulators, and real devices
3. **🛠️ Feature development walkthrough** - Add new tools step-by-step
4. **✅ Testing & quality practices** - Ensure your contributions are solid
5. **🚀 Contributing workflow** - From fork to merged pull request

### 🌟 Why Mobile MCP Matters

Mobile MCP bridges the gap between AI and mobile devices, enabling:
- **QA teams** to automate testing with natural language
- **Developers** to create sophisticated mobile automation scripts
- **AI researchers** to build agents that interact with real mobile apps
- **Businesses** to automate repetitive mobile workflows

**Ready to build the future of mobile automation?** Let's get started! 👇

---

# Setup Guide for macOS Developers

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

## 🛠️ Contributing a New Feature - Complete Walkthrough

### Example: Adding "Get Device Info" Feature

Let's walk through adding a new MCP tool that returns detailed device information. This demonstrates the complete development workflow.

#### Step 1: Setup and Planning
```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/mobile-mcp.git
cd mobile-mcp

# 3. Follow the setup guide above to install dependencies
npm install
npm run build

# 4. Create feature branch
git checkout -b feature/get-device-info
```

#### Step 2: Understand the Architecture

**Key Files for MCP Tools:**
- `src/server.ts` - Register new MCP tools
- `src/robot.ts` - Add interface method if needed
- `src/android.ts` - Android implementation
- `src/ios.ts` - iOS physical device implementation  
- `src/iphone-simulator.ts` - iOS simulator implementation

#### Step 3: Define the Interface

**Add to `src/robot.ts`:**
```typescript
export interface DeviceInfo {
  platform: "ios" | "android";
  osVersion: string;
  deviceModel: string;
  screenResolution: string;
  batteryLevel?: number;
  isSimulator: boolean;
}

export interface Robot {
  // ... existing methods ...
  
  /**
   * Get detailed device information
   */
  getDeviceInfo(): Promise<DeviceInfo>;
}
```

#### Step 4: Implement for Each Platform

**Android Implementation (`src/android.ts`):**
```typescript
public async getDeviceInfo(): Promise<DeviceInfo> {
  const model = this.adb("shell", "getprop", "ro.product.model").toString().trim();
  const osVersion = this.adb("shell", "getprop", "ro.build.version.release").toString().trim();
  const screenSize = await this.getScreenSize();
  
  return {
    platform: "android",
    osVersion,
    deviceModel: model,
    screenResolution: `${screenSize.width}x${screenSize.height}`,
    isSimulator: false, // Could detect emulator vs physical
  };
}
```

**iOS Implementation (`src/ios.ts`):**
```typescript
public async getDeviceInfo(): Promise<DeviceInfo> {
  const info = await this.ios("info");
  const json = JSON.parse(info);
  const screenSize = await this.getScreenSize();
  
  return {
    platform: "ios",
    osVersion: json.ProductVersion,
    deviceModel: json.ProductType,
    screenResolution: `${screenSize.width}x${screenSize.height}`,
    isSimulator: false,
  };
}
```

**iOS Simulator Implementation (`src/iphone-simulator.ts`):**
```typescript
public async getDeviceInfo(): Promise<DeviceInfo> {
  const screenSize = await this.getScreenSize();
  // Get simulator info from simctl
  const deviceInfo = execFileSync("xcrun", ["simctl", "list", "devices", "-j"]);
  
  return {
    platform: "ios",
    osVersion: "Simulator",
    deviceModel: "iPhone Simulator",
    screenResolution: `${screenSize.width}x${screenSize.height}`,
    isSimulator: true,
  };
}
```

#### Step 5: Register the MCP Tool

**Add to `src/server.ts`:**
```typescript
tool(
  "mobile_get_device_info",
  "Get detailed information about the connected device including platform, OS version, model, and screen resolution",
  {
    noParams
  },
  async () => {
    requireRobot();
    const deviceInfo = await robot!.getDeviceInfo();
    
    return JSON.stringify({
      platform: deviceInfo.platform,
      osVersion: deviceInfo.osVersion,
      deviceModel: deviceInfo.deviceModel,
      screenResolution: deviceInfo.screenResolution,
      batteryLevel: deviceInfo.batteryLevel,
      isSimulator: deviceInfo.isSimulator,
    }, null, 2);
  }
);
```

#### Step 6: Test Your Implementation

**Build and test:**
```bash
# Build the project
npm run build

# Test with a device connected
node lib/index.js

# In another terminal, test with MCP client or direct testing
```

**Testing script example:**
```typescript
// test/device-info.ts
import { describe, it } from "mocha";
import { AndroidRobot } from "../src/android";

describe("device-info", () => {
  it("should get Android device info", async () => {
    // Test implementation
  });
  
  it("should get iOS device info", async () => {
    // Test implementation
  });
});
```

#### Step 7: Test with MCP Client

**Cursor/Cline config:**
```json
{
  "mcpServers": {
    "mobile-mcp-dev": {
      "command": "node", 
      "args": ["~/mobile-mcp/lib/index.js"]
    }
  }
}
```

**Test the tool:**
```
> Use the mobile_get_device_info tool to get information about my device
```

#### Step 8: Quality Checks

```bash
# Run linting
npm run lint

# Fix any issues
npm run lint -- --fix

# Run tests
npm test

# Test specific components
npx mocha --require ts-node/register test/device-info.ts
```

#### Step 9: Documentation

**Update appropriate files:**
- Add tool description to README.md
- Document any new dependencies
- Add examples in wiki if complex

#### Step 10: Commit and Submit

```bash
# Commit your changes
git add .
git commit -m "feat: add mobile_get_device_info tool

- Add getDeviceInfo interface to Robot
- Implement device info collection for Android, iOS, and simulators
- Return platform, OS version, model, screen resolution
- Add comprehensive device information MCP tool
- Include tests for all platforms

Closes #123" # if there was an issue

# Push to your fork
git push origin feature/get-device-info

# Create pull request on GitHub
```

#### Step 11: Pull Request Best Practices

**PR Description Template:**
```markdown
## 🚀 Feature: Get Device Info Tool

### What does this PR do?
Adds a new MCP tool `mobile_get_device_info` that returns detailed device information.

### Changes Made
- ✅ Added `getDeviceInfo()` interface to Robot
- ✅ Implemented for Android devices
- ✅ Implemented for iOS devices  
- ✅ Implemented for iOS simulators
- ✅ Added MCP tool registration
- ✅ Added tests
- ✅ Updated documentation

### Testing
- [x] Tested on iOS simulator
- [x] Tested on Android emulator
- [ ] Tested on physical iOS device
- [ ] Tested on physical Android device

### Screenshots/Output
```json
{
  "platform": "ios",
  "osVersion": "17.0",
  "deviceModel": "iPhone15,2", 
  "screenResolution": "1179x2556",
  "isSimulator": false
}
```

### Breaking Changes
None

### Related Issues
Closes #123
```

### 🎯 Key Takeaways for Contributors

1. **Follow the pattern**: Study existing tools in `server.ts`
2. **Implement across platforms**: Android, iOS, iOS Simulator
3. **Add proper TypeScript types**: Update `robot.ts` interface
4. **Test thoroughly**: Multiple devices and scenarios
5. **Document your changes**: README, code comments
6. **Follow conventions**: Naming, error handling, logging
7. **Write good commit messages**: Use conventional commits
8. **Create detailed PRs**: Help reviewers understand your changes

### 💡 Feature Ideas for New Contributors

**Easy features:**
- `mobile_get_battery_level` - Battery percentage
- `mobile_get_wifi_info` - WiFi network details
- `mobile_toggle_airplane_mode` - Airplane mode control

**Medium features:**
- `mobile_install_app` - Install app from file
- `mobile_record_screen` - Screen recording
- `mobile_get_logs` - Device logs

**Advanced features:**
- `mobile_simulate_location` - GPS mocking
- `mobile_test_performance` - Performance metrics
- `mobile_network_conditions` - Simulate network conditions

### 🔗 Useful Resources for Feature Development

- **MCP Spec**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **Android ADB**: [ADB Shell Commands](https://developer.android.com/studio/command-line/adb)
- **iOS go-ios**: [go-ios Documentation](https://github.com/danielpaulus/go-ios)
- **WebDriverAgent**: [WDA Protocol](https://github.com/appium/WebDriverAgent)

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