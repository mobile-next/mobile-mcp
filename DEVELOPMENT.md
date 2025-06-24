# Mobile MCP Development Setup

## ✅ Your Environment Status

**System Information:**
- **OS**: macOS (Darwin 24.5.0)
- **Node.js**: v24.2.0 ✅
- **npm**: 11.3.0 ✅
- **Git**: 2.48.1 ✅
- **TypeScript**: Installed globally ✅

**Platform Tools:**
- **iOS Simulators**: Available (iOS 18.2, 18.4) ✅
- **Android ADB**: v1.0.41 (Version 35.0.2) ✅
- **go-ios**: Installed ✅
- **Xcode CLI Tools**: Available ✅

**Project Status:**
- **Dependencies**: Installed ✅
- **Build**: Successful ✅
- **Linting**: Passing ✅

## 🚀 Development Workflow

### Quick Start Commands
```bash
# Build and watch for changes
npm run watch

# Build once
npm run build

# Run linting
npm run lint

# Test specific components
npx mocha --require ts-node/register test/iphone-simulator.ts
npx mocha --require ts-node/register test/android.ts
```

### Testing the MCP Server
```bash
# Test the built server
node lib/index.js --help

# Start server in stdio mode (default)
node lib/index.js

# Start server with SSE on port 3000
node lib/index.js --port 3000
```

## 📱 Device Testing

### iOS Simulator Testing
```bash
# List available simulators
xcrun simctl list devices

# Boot a simulator for testing
xcrun simctl boot "iPhone 16"

# Verify simulator is booted
xcrun simctl list devices | grep Booted
```

### Android Emulator Testing
```bash
# Check connected devices
adb devices

# If you have Android Studio, start an emulator:
# emulator -avd YOUR_AVD_NAME
```

## 🛠️ Development Tips

### Project Structure
- `src/server.ts` - Main MCP server logic
- `src/robot.ts` - Core device abstraction
- `src/android.ts` - Android implementation
- `src/ios.ts` - iOS physical device implementation
- `src/iphone-simulator.ts` - iOS simulator implementation

### Making Changes
1. Edit source files in `src/`
2. Watch mode will auto-rebuild (`npm run watch`)
3. Test changes with `node lib/index.js`
4. Run specific tests for your changes

### Testing Your Changes
```bash
# Test with MCP client like Cursor/Cline by updating your config:
{
  "mcpServers": {
    "mobile-mcp-dev": {
      "command": "node",
      "args": ["/Users/rbs_saiful_mac_mini/office_projects/mobile-mcp/lib/index.js"]
    }
  }
}
```

## 🔧 IDE Recommendations

### VS Code Extensions
- TypeScript Importer
- ESLint
- Prettier
- GitLens

### Settings
```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 🐛 Troubleshooting

### Common Issues
1. **Tests failing with 'ios ENOENT'**: Install go-ios globally
2. **WebDriverAgent not found**: Ensure you have Xcode installed
3. **Android ADB issues**: Check ANDROID_HOME environment variable

### Getting Help
- Check the [wiki](https://github.com/mobile-next/mobile-mcp/wiki)
- Join [Slack community](http://mobilenexthq.com/join-slack)
- Review existing [GitHub issues](https://github.com/mobile-next/mobile-mcp/issues)

---

**Next Steps:**
1. Try making a small change in `src/server.ts`
2. Test with a simulator/emulator
3. Consider adding new MCP tools or improving existing ones 