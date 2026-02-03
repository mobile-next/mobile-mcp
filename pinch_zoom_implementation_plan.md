# Implementation Plan: Pinch Zoom Tool for mobile-mcp

## Issue Reference
https://github.com/mobile-next/mobile-mcp/issues/258

## Overview
Add a new MCP tool `mobile_pinch_on_screen` that enables pinch-to-zoom gestures on both Android and iOS devices. This is a multi-touch gesture requiring two simultaneous touch points moving toward (zoom out) or away from (zoom in) each other.

---

## Step 0: Git Setup

### Disable Claude Co-authoring (Optional)

If you don't want commits to show "Co-authored-by: Claude", run this before starting:

```bash
claude config set --global gitCommitCoAuthoring false
```

Or for just this session, start Claude with:
```bash
claude --no-git-co-authoring
```

### Create Feature Branch

```bash
# Make sure you're on the latest main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feat/pinch-zoom-tool
```

### Recommended Commit Structure

Keep commits atomic and logical for easier review:

1. **Commit 1**: Add pinch method to Robot interface
   ```bash
   git commit -m "feat: add pinch method signature to Robot interface"
   ```

2. **Commit 2**: Android implementation
   ```bash
   git commit -m "feat(android): implement pinch zoom gesture"
   ```

3. **Commit 3**: iOS implementation
   ```bash
   git commit -m "feat(ios): implement pinch zoom gesture"
   ```

4. **Commit 4**: Register MCP tool
   ```bash
   git commit -m "feat: register mobile_pinch_on_screen MCP tool"
   ```

5. **Commit 5**: Documentation
   ```bash
   git commit -m "docs: add pinch zoom tool documentation"
   ```

This way if maintainers want changes to just the iOS part, the history is clean and easy to amend.

### Submitting the PR

Once all commits are done:

```bash
# Push your branch
git push -u origin feat/pinch-zoom-tool
```

Then create the PR manually on GitHub.

---

## Prerequisites: iOS Simulator Setup

```bash
# Install Xcode command line tools (if not already installed)
xcode-select --install

# Accept Xcode license
sudo xcodebuild -license accept

# List available simulators
xcrun simctl list devices

# Boot a simulator (e.g., iPhone 15)
xcrun simctl boot "iPhone 15"

# Or open Simulator app directly
open -a Simulator
```

---

## Step 1: Understand the Codebase Structure

Before writing any code, examine these files to understand existing patterns:

```bash
# Key files to examine:
cat src/server.ts              # MCP tool definitions
cat src/robot/robot.ts         # Robot interface/abstraction
cat src/robot/android-robot.ts # Android gesture implementations
cat src/robot/ios-robot.ts     # iOS gesture implementations

# Look at existing gesture implementations for patterns:
grep -n "swipe" src/robot/*.ts
grep -n "input swipe" src/robot/android-robot.ts
```

**Questions to answer from code review:**
1. What is the Robot interface signature for gestures?
2. How are coordinates normalized (pixels vs percentages)?
3. What's the error handling pattern?
4. How is device selection handled?

---

## Step 2: API Design

### Proposed Tool Signature

```typescript
mobile_pinch_on_screen({
  x: number,           // Center X coordinate of pinch
  y: number,           // Center Y coordinate of pinch  
  scale: number,       // Zoom factor: >1 = zoom in, <1 = zoom out (e.g., 2.0 = 2x zoom in, 0.5 = 2x zoom out)
  duration?: number    // Duration in milliseconds (default: 500)
})
```

### Alternative API (if maintainers prefer explicit control)

```typescript
mobile_pinch_on_screen({
  x: number,
  y: number,
  startDistance: number,  // Starting distance between fingers in pixels
  endDistance: number,    // Ending distance between fingers in pixels
  duration?: number
})
```

### Return Value
Follow existing tool patterns - likely returns success/failure status and any relevant metadata.

---

## Step 3: Android Implementation

### Recommended Approach: Parallel Swipes with `&`

Running two `adb shell input swipe` commands simultaneously in the background simulates a two-finger pinch gesture. This is the simplest approach and doesn't require additional binaries.

```bash
# Zoom OUT (pinch) - two fingers move toward center
adb shell input swipe 300 800 400 900 500 & adb shell input swipe 500 1000 400 900 500

# Zoom IN (spread) - two fingers move away from center
adb shell input swipe 400 900 300 800 500 & adb shell input swipe 400 900 500 1000 500
```

**How it works:**
- The `&` runs both swipes in parallel (same shell session)
- Both touches happen simultaneously, simulating two fingers
- Duration (last param, 500ms) should match for smooth gesture

### Implementation Pseudocode

```typescript
async pinchAndroid(
  centerX: number, 
  centerY: number, 
  scale: number, 
  duration: number
): Promise<void> {
  // Distance from center to each finger
  const baseDistance = 100; // pixels
  
  let finger1Start, finger1End, finger2Start, finger2End;
  
  if (scale > 1) {
    // Zoom IN: fingers start close to center, move apart
    const startOffset = baseDistance / 2;
    const endOffset = (baseDistance * scale) / 2;
    
    finger1Start = { x: centerX - startOffset, y: centerY };
    finger1End = { x: centerX - endOffset, y: centerY };
    finger2Start = { x: centerX + startOffset, y: centerY };
    finger2End = { x: centerX + endOffset, y: centerY };
  } else {
    // Zoom OUT: fingers start apart, move toward center
    const startOffset = baseDistance / 2;
    const endOffset = (baseDistance * scale) / 2;
    
    finger1Start = { x: centerX - startOffset, y: centerY };
    finger1End = { x: centerX - endOffset, y: centerY };
    finger2Start = { x: centerX + startOffset, y: centerY };
    finger2End = { x: centerX + endOffset, y: centerY };
  }
  
  // Execute both swipes in parallel using shell's &
  const cmd = `input swipe ${finger1Start.x} ${finger1Start.y} ${finger1End.x} ${finger1End.y} ${duration} & ` +
              `input swipe ${finger2Start.x} ${finger2Start.y} ${finger2End.x} ${finger2End.y} ${duration}`;
  
  await this.execAdb(['shell', cmd]);
}
```

### Alternative: minitouch (More Precise)

If the parallel swipe approach isn't smooth enough, consider [minitouch](https://github.com/openstf/minitouch) — a lightweight binary that provides precise multi-touch control via socket:

```
d 0 300 800 50    # finger 0 down at (300,800)
d 1 500 800 50    # finger 1 down at (500,800)
c                  # commit
m 0 250 800 50    # finger 0 move
m 1 550 800 50    # finger 1 move
c                  # commit
...
u 0               # finger 0 up
u 1               # finger 1 up
c                  # commit
```

However, minitouch requires pushing a binary to the device. Start with the parallel swipe approach — it works for most use cases.

### Key ADB Commands for Testing

```bash
# Test zoom in on center of screen (540, 960 on 1080p device)
adb shell "input swipe 490 960 390 960 500 & input swipe 590 960 690 960 500"

# Test zoom out
adb shell "input swipe 390 960 490 960 500 & input swipe 690 960 590 960 500"
```

---

## Step 4: iOS Implementation

### For iOS Simulator

Use `xcrun simctl` - but pinch isn't directly supported. Options:

1. **Private APIs via AppleScript/Accessibility**
2. **XCUITest-style automation** (if project has test framework integration)
3. **simctl with IPC** (complex)

### For Real iOS Devices

Likely needs WebDriverAgent or similar framework that the project may already use.

**Check existing iOS implementation:**

```bash
# See what the project uses for iOS gestures
grep -n "xcrun\|simctl\|WebDriver\|XCUITest" src/robot/ios-robot.ts
```

### iOS Pseudocode

```typescript
async pinchIOS(x: number, y: number, scale: number, duration: number): Promise<void> {
  // Implementation depends on what framework is used
  // If using WebDriverAgent:
  // await this.wda.pinch({ x, y, scale, velocity: 1.0 });
  
  // If using simulator-only approach:
  // May need to use accessibility APIs or inject touch events
}
```

---

## Step 5: Register the MCP Tool

In `src/server.ts`, add the tool definition following existing patterns:

```typescript
// Find where other tools are defined and add:

server.tool(
  "mobile_pinch_on_screen",
  "Perform a pinch gesture to zoom in or out at the specified coordinates",
  {
    x: z.number().describe("X coordinate of the pinch center"),
    y: z.number().describe("Y coordinate of the pinch center"),
    scale: z.number().positive().describe("Zoom scale factor. Greater than 1 zooms in, less than 1 zooms out. Example: 2.0 doubles zoom, 0.5 halves it"),
    duration: z.number().optional().default(500).describe("Duration of the pinch gesture in milliseconds")
  },
  async ({ x, y, scale, duration }) => {
    // Get the robot instance for current device
    const robot = await getRobot();
    await robot.pinch(x, y, scale, duration);
    return { success: true };
  }
);
```

---

## Step 6: Add to Robot Interface

In `src/robot/robot.ts`, add the method signature:

```typescript
interface Robot {
  // ... existing methods
  pinch(x: number, y: number, scale: number, duration: number): Promise<void>;
}
```

---

## Step 7: Testing

### Manual Testing

```bash
# Build the project
npm run build

# Start the MCP server
npm start

# Test with an MCP client or directly via the test harness
```

### Test Cases

1. **Zoom in on center of screen** - scale: 2.0
2. **Zoom out on center of screen** - scale: 0.5
3. **Zoom at specific coordinates** - e.g., map pin location
4. **Edge cases:**
   - Very small scale (0.1)
   - Very large scale (5.0)
   - Coordinates near screen edge
   - Very short duration (100ms)
   - Very long duration (2000ms)

### Apps to Test With

- Google Maps (zoom on location)
- Photos app (zoom on image)
- Browser (pinch zoom on webpage)
- Any app with pinch-zoomable content

---

## Step 8: Documentation

Update README.md or relevant docs to include:

```markdown
### mobile_pinch_on_screen

Perform a pinch gesture to zoom in or out.

**Parameters:**
- `x` (number): X coordinate of the pinch center
- `y` (number): Y coordinate of the pinch center  
- `scale` (number): Zoom factor. >1 zooms in, <1 zooms out
- `duration` (number, optional): Gesture duration in ms (default: 500)

**Example:**
```
Zoom in 2x on the center of a map:
mobile_pinch_on_screen(540, 960, 2.0)

Zoom out on an image:
mobile_pinch_on_screen(400, 600, 0.5, 300)
```
```

---

## Implementation Checklist

- [ ] Create feature branch `feat/pinch-zoom-tool`
- [ ] Review existing codebase patterns (swipe, tap implementations)
- [ ] Add `pinch` method to Robot interface → **Commit 1**
- [ ] Implement `pinch` in AndroidRobot → **Commit 2**
- [ ] Implement `pinch` in IOSRobot → **Commit 3**
- [ ] Register MCP tool in server.ts → **Commit 4**
- [ ] Add input validation and error handling
- [ ] Test on Android emulator
- [ ] Test on iOS simulator
- [ ] Test on real device (if available)
- [ ] Update documentation → **Commit 5**
- [ ] Run linter and fix issues
- [ ] Push branch and create PR with clear description

---

## Potential Challenges

1. **Android parallel swipe timing**: The `&` approach runs commands in parallel but timing may vary slightly. Test if gestures feel smooth enough.
2. **iOS simulator limitations**: May not support programmatic pinch easily — check what framework the project already uses
3. **Coordinate systems**: Ensure consistency with existing tools (pixels vs percentages)
4. **Edge cases**: Pinch near screen edges may have fingers go off-screen — add bounds checking

---

## Reference Links

- [ADB Cheat Sheet - Pinch gestures](https://github.com/Linuxndroid/ADB-Cheat-Sheet) — shows parallel swipe approach
- [minitouch - Multi-touch tool](https://github.com/openstf/minitouch) — precise multi-touch if needed
- [Android input command docs](https://developer.android.com/studio/command-line/adb#shellcommands)
- [mobile-mcp existing tools](https://github.com/mobile-next/mobile-mcp/blob/main/src/server.ts)
