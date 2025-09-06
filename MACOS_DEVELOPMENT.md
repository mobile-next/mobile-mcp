# 📱 Mobile MCP Development – macOS Quick Guide

---

## 📑 Table of Contents
1. [Project Setup](#project-setup)
2. [Platform Setup](#platform-setup)
3. [Add a Feature](#add-a-feature)
4. [Local Development & Testing](#local-development--testing)
5. [Common Setup Pain Points & Solutions](#common-setup-pain-points--solutions)
6. [Unclear Workflow Steps - Clarified](#unclear-workflow-steps---clarified)
7. [Workflow](#workflow)
8. [Architecture](#architecture)
9. [Contributing](#contributing)
10. [FAQ](#faq)

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
    ios version
    ```
    > Note: The command is `ios`, not `go-ios`
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
ios version
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

## Local Development & Testing🧪

### **Setting Up Local Development**

To test your features locally in Cursor or other MCP clients:

1. **Configure MCP for Local Development**:
   Edit your MCP config file (`~/.cursor/mcp.json` for Cursor):
   ```json
   {
     "mcpServers": {
       "mobile-mcp": {
         "command": "node",
         "args": ["/path/to/your/mobile-mcp/lib/index.js", "--stdio"],
         "cwd": "/path/to/your/mobile-mcp"
       }
     }
   }
   ```
   
   Replace `/path/to/your/mobile-mcp` with your actual project path.

2. **Development Workflow**:
   ```bash
   # Start continuous build (optional)
   npm run watch
   
   # Or build manually after changes
   npm run build
   
   # Restart your MCP client (Cursor/Claude Desktop) to pick up changes
   ```

### **Testing Your Features**

1. **Prepare Test Device**:
   ```bash
   # For iOS Simulator
   xcrun simctl boot "iPhone 15"
   
   # For Android (connect device with USB debugging)
   adb devices
   ```

2. **Test Feature Workflow**:
   - Make code changes
   - Build: `npm run build`
   - Restart MCP client
   - Test your new tools!

### **Example: Testing New Feature**

```bash
# 1. Implement your feature in TypeScript files
# 2. Build the project
npm run build

# 3. In Cursor: Cmd+Shift+P → "MCP: Restart Servers"
# 4. Test your tools:
#    - mobile_use_default_device
#    - your_new_feature_tool
```

### **Debugging Tips**

- **Tool not found?** Restart your MCP client after building
- **Build issues?** Check TypeScript errors: `npm run build`
- **MCP config issues?** Verify the path in your config file
- **Test with multiple platforms** to ensure cross-platform compatibility

## Common Setup Pain Points & Solutions🩹

### **Pain Point 1: Command Name Confusion**
**Issue**: Documentation says `go-ios version` but command not found
```bash
$ go-ios version
zsh: command not found: go-ios
```
**Solution**: The actual command is `ios`, not `go-ios`
```bash
$ ios version  # ✅ Correct command
```

### **Pain Point 2: MCP Client Uses Published Package**
**Issue**: Your new tools don't appear even after building
**Root Cause**: MCP client is using `@mobilenext/mobile-mcp@latest` from npm
**Solution**: Update MCP config to point to your local build:
```json
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "node",
      "args": ["/your/path/mobile-mcp/lib/index.js", "--stdio"],
      "cwd": "/your/path/mobile-mcp"
    }
  }
}
```

### **Pain Point 3: npm Global Package PATH Issues**
**Issue**: Package installs but command not found
**Check**: Verify npm global bin directory is in PATH
```bash
npm config get prefix  # Should show /opt/homebrew or similar
echo $PATH | grep $(npm config get prefix)/bin  # Should return a match
```

## Unclear Workflow Steps - Clarified🔍

### **The Build → Test Cycle**
**What's Not Obvious**: `npm run watch` rebuilds code, but MCP client doesn't auto-reload

**Complete Workflow**:
```bash
# 1. Make code changes
# 2. Code builds automatically (if watch running) OR:
npm run build

# 3. ⚠️ CRITICAL STEP: Restart MCP client
# In Cursor: Cmd+Shift+P → "MCP: Restart Servers"
# In Claude Desktop: Restart the app

# 4. Test your tools
```

### **When Tools Don't Appear**
**Symptoms**: Built successfully, but new tools missing in MCP client
**Checklist**:
1. ✅ Code compiles without errors
2. ✅ MCP config points to local build (not npm package)  
3. ✅ Restarted MCP client after building
4. ✅ Tool registered in `src/server.ts` with correct name

### **Development vs Production Setup**
**Development** (your local features):
```json
"command": "node",
"args": ["/path/to/mobile-mcp/lib/index.js", "--stdio"]
```

**Production** (published package):
```json
"command": "npx", 
"args": ["-y", "@mobilenext/mobile-mcp@latest"]
```

**Switch easily**: Just update your `~/.cursor/mcp.json` file

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