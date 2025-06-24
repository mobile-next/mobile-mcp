# 📱 Mobile MCP Development - macOS Guide

## 🚀 Like This Project? Want to Contribute?

**Mobile MCP** revolutionizes mobile automation by bringing AI agents to iOS and Android devices. Build tools that let LLMs control real mobile apps, automate testing with natural language, and create the future of mobile automation.

### 🎯 What You'll Build
- **AI-driven mobile automation** across iOS/Android
- **Cross-platform tools** for simulators & physical devices  
- **Natural language testing** capabilities
- **Real-world solutions** used by QA teams and developers

### 💻 This Guide: Setup → Develop → Contribute
1. **🔧 macOS Environment** - Complete development setup
2. **📱 Platform Configuration** - iOS/Android tools
3. **🛠️ Feature Development** - Add new MCP tools
4. **🚀 Contribution Workflow** - From code to pull request

**Ready to build the future of mobile automation?** Let's start! 👇

---

## 🛠️ Quick Setup

### Prerequisites
```bash
# Verify your setup
node --version    # >= 18
npm --version     # >= 8
xcode-select -p   # Xcode CLI tools
```

### Project Setup
```bash
# Clone and build
git clone https://github.com/mobile-next/mobile-mcp.git
cd mobile-mcp
npm install && npm run build

# Verify installation
node lib/index.js --help
```

## 📱 Platform Setup

### iOS Development
```bash
# Simulators (built-in)
xcrun simctl list devices
xcrun simctl boot "iPhone 15"

# Physical devices
npm install -g go-ios
ios version
```

### Android Development  
```bash
# Platform tools
brew install android-platform-tools
adb version

# Environment
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

## 🛠️ Adding a New Feature

### Example: "Get Device Info" Tool

**1. Create feature branch:**
```bash
git checkout -b feature/get-device-info
```

**2. Define interface (`src/robot.ts`):**
```typescript
export interface DeviceInfo {
  platform: "ios" | "android";
  osVersion: string;
  deviceModel: string;
  screenResolution: string;
  isSimulator: boolean;
}

export interface Robot {
  getDeviceInfo(): Promise<DeviceInfo>;
}
```

**3. Implement for platforms:**

**Android (`src/android.ts`):**
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
    isSimulator: false,
  };
}
```

**iOS (`src/ios.ts` & `src/iphone-simulator.ts`):**
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

**4. Register MCP tool (`src/server.ts`):**
```typescript
tool(
  "mobile_get_device_info",
  "Get detailed device information including platform, OS version, model, and screen resolution",
  { noParams },
  async () => {
    requireRobot();
    const info = await robot!.getDeviceInfo();
    return JSON.stringify(info, null, 2);
  }
);
```

**5. Test and validate:**
```bash
npm run build
npm run lint
node lib/index.js  # Test the tool
```

**6. Submit contribution:**
```bash
git add .
git commit -m "feat: add mobile_get_device_info tool

- Add getDeviceInfo interface and cross-platform implementation
- Return platform, OS version, model, screen resolution
- Support Android, iOS, and iOS simulators"

git push origin feature/get-device-info
# Create pull request on GitHub
```

## 🔧 Development Workflow

```bash
# Development mode
npm run watch          # Auto-rebuild on changes

# Quality checks  
npm run lint           # Code linting
npm test              # Run test suite

# Testing with MCP clients
node lib/index.js      # Start server locally
```

## 🎯 Architecture Overview

```
src/
├── server.ts          # MCP tool registration
├── robot.ts           # Cross-platform interface
├── android.ts         # Android implementation  
├── ios.ts             # iOS physical devices
├── iphone-simulator.ts # iOS simulators
└── webdriver-agent.ts # iOS automation client
```

## 💡 Feature Ideas

**Beginner:** Battery level, WiFi info, device orientation  
**Intermediate:** App installation, screen recording, device logs  
**Advanced:** Location simulation, performance metrics, network conditions

## 🚀 Contributing Best Practices

1. **Follow the pattern** - Study existing tools in `server.ts`
2. **Cross-platform** - Implement for Android, iOS, simulators
3. **TypeScript types** - Update `robot.ts` interface
4. **Test thoroughly** - Multiple devices and scenarios
5. **Quality first** - Linting, tests, documentation
6. **Clear commits** - Conventional commit messages
7. **Detailed PRs** - Help reviewers understand changes

## 🔗 Resources

- **Project**: [GitHub Repository](https://github.com/mobile-next/mobile-mcp)
- **Community**: [Slack Channel](http://mobilenexthq.com/join-slack)  
- **MCP Docs**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **Platform APIs**: [Android ADB](https://developer.android.com/studio/command-line/adb) | [iOS go-ios](https://github.com/danielpaulus/go-ios)

---

**🌟 Ready to contribute?** Fork the repo, follow this guide, and build amazing mobile automation tools! Your contributions help developers worldwide create better mobile experiences with AI.

**Questions?** Join our [Slack community](http://mobilenexthq.com/join-slack) - we're here to help! 🤝 