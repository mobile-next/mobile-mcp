# Mobile Next - MCP server for Mobile Development and Automation  | iOS, Android, Simulator, Emulator, and physical devices

This is a [Model Context Protocol (MCP) server](https://github.com/modelcontextprotocol) that enables scalable mobile automation, development through a platform-agnostic interface, eliminating the need for distinct iOS or Android knowledge. You can run it on emulators, simulators, and physical devices (iOS and Android).
This server allows Agents and LLMs to interact with native iOS/Android applications and devices through structured accessibility snapshots or coordinate-based taps based on screenshots.

<h4 align="center">
<a href="https://github.com/mobile-next/mobile-mcp">
    <img src="https://img.shields.io/github/stars/mobile-next/mobile-mcp" alt="Mobile Next Stars" />
  </a>
 <a href="https://github.com/mobile-next/mobile-mcp">
    <img src="https://img.shields.io/github/contributors/mobile-next/mobile-mcp?color=green" alt="Mobile Next Downloads" />
  </a>
  <a href="https://www.npmjs.com/package/@mobilenext/mobile-mcp">
    <img src="https://img.shields.io/npm/dm/@mobilenext/mobile-mcp?logo=npm&style=flat&color=red" alt="npm">
  </a>
<a href="https://github.com/mobile-next/mobile-mcp/releases">
    <img src="https://img.shields.io/github/release/mobile-next/mobile-mcp">
  </a>
<a href="https://github.com/mobile-next/mobile-mcp/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache 2.0-blue.svg" alt="Mobile MCP is released under the Apache-2.0 License">
  </a>

</p>

<h4 align="center">
<a href="http://mobilenexthq.com/join-slack">
    <img src="https://img.shields.io/badge/join-Slack-blueviolet?logo=slack&style=flat" alt="Slack community channel" />
</a>
</p>

https://github.com/user-attachments/assets/c4e89c4f-cc71-4424-8184-bdbc8c638fa1

<p align="center">
    <a href="https://github.com/mobile-next/">
        <img alt="mobile-mcp" src="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-banner.png" width="600">
    </a>
</p>

### 🚀 Mobile MCP Roadmap: Building the Future of Mobile

Join us on our journey as we continuously enhance Mobile MCP!
Check out our detailed roadmap to see upcoming features, improvements, and milestones. Your feedback is invaluable in shaping the future of mobile automation.

👉 [Explore the Roadmap](https://github.com/orgs/mobile-next/projects/3)


### Main use cases

How we help to scale mobile automation:

- 📲 Native app automation (iOS and Android) for testing or data-entry scenarios.
- 📝 Scripted flows and form interactions without manually controlling simulators/emulators or physical devices (iPhone, Samsung, Google Pixel etc)
- 🧭 Automating multi-step user journeys driven by an LLM
- 👆 General-purpose mobile application interaction for agent-based frameworks
- 🤖 Enables agent-to-agent communication for mobile automation usecases, data extraction

## Main Features

- 🚀 **Fast and lightweight**: Uses native accessibility trees for most interactions, or screenshot based coordinates where a11y labels are not available.
- 🤖 **LLM-friendly**: No computer vision model required in Accessibility (Snapshot).
- 🧿 **Visual Sense**: Evaluates and analyses what’s actually rendered on screen to decide the next action. If accessibility data or view-hierarchy coordinates are unavailable, it falls back to screenshot-based analysis.
- 📊 **Deterministic tool application**: Reduces ambiguity found in purely screenshot-based approaches by relying on structured data whenever possible.
- 📺 **Extract structured data**: Enables you to extract structred data from anything visible on screen.

## 🏗️ Mobile MCP Architecture

<p align="center">
    <a href="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-arch-1.png">
        <img alt="mobile-mcp" src="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-arch-1.png" width="600">
    </a>
</p>


## 📚 Wiki page

More details in our [wiki page](https://github.com/mobile-next/mobile-mcp/wiki) for setup, configuration and debugging related questions.


## Installation and configuration

Setup our MCP with Cline, Cursor, Claude, VS Code, Github Copilot:

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "npx",
      "args": ["-y", "@mobilenext/mobile-mcp@latest"]
    }
  }
}

```
[Cline:](https://docs.cline.bot/mcp/configuring-mcp-servers) To setup Cline, just add the json above to your MCP settings file.
[More in our wiki](https://github.com/mobile-next/mobile-mcp/wiki/Cline)

[Claude Code:](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)

```
claude mcp add mobile -- npx -y @mobilenext/mobile-mcp@latest
```

[Read more in our wiki](https://github.com/mobile-next/mobile-mcp/wiki)! 🚀


### 🛠️ How to Use 📝

After adding the MCP server to your IDE/Client, you can instruct your AI assistant to use the available tools.
For example, in Cursor's agent mode, you could use the prompts below to quickly validate, test and iterate on UI intereactions, read information from screen, go through complex workflows.
Be descriptive, straight to the point.

### ✨ Example Prompts

#### Workflows

You can specifiy detailed workflows in a single prompt, verify business logic, setup automations. You can go crazy:

**Search for a video, comment, like and share it.**
```
Find the video called " Beginner Recipe for Tonkotsu Ramen" by Way of
Ramen, click on like video, after liking write a comment " this was
delicious, will make it next Friday", share the video with the first
contact in your whatsapp list.
```

**Download a successful step counter app, register, setup workout and 5-star the app**
```
Find and Download a free "Pomodoro" app that has more than 1k stars.
Launch the app, register with my email, after registration find how to
start a pomodoro timer. When the pomodoro timer started, go back to the
app store and rate the app 5 stars, and leave a comment how useful the
app is.
```

**Search in Substack, read, highlight, comment and save an article**
```
Open Substack website, search for "Latest trends in AI automation 2025",
open the first article, highlight the section titled "Emerging AI trends",
and save article to reading list for later review, comment a random
paragraph summary.
```

**Reserve a workout class, set timer**
```
Open ClassPass, search for yoga classes tomorrow morning within 2 miles,
book the highest-rated class at 7 AM, confirm reservation,
setup a timer for the booked slot in the phone
```

**Find a local event, setup calendar event**
```
Open Eventbrite, search for AI startup meetup events happening this
weekend in "Austin, TX", select the most popular one, register and RSVP
yes to the event, setup a calendar event as a reminder.
```

**Check weather forecast and send a Whatsapp/Telegram/Slack message**
```
Open Weather app, check tomorrow's weather forecast for "Berlin", and
send the summary via Whatsapp/Telegram/Slack to contact "Lauren Trown",
thumbs up their response.
```

- **Schedule a meeting in Zoom and share invite via email**
```
Open Zoom app, schedule a meeting titled "AI Hackathon" for tomorrow at
10AM with a duration of 1 hour, copy the invitation link, and send it via
Gmail to contacts "team@example.com".
```
[More prompt examples can be found here.](https://github.com/mobile-next/mobile-mcp/wiki/Prompt-Example-repo-list)

## Prerequisites

What you will need to connect MCP with your agent and mobile devices:

- [Xcode command line tools](https://developer.apple.com/xcode/resources/)
- [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)
- [node.js](https://nodejs.org/en/download/) v22+
- [MCP](https://modelcontextprotocol.io/introduction) supported foundational models or agents, like [Claude MCP](https://modelcontextprotocol.io/quickstart/server), [OpenAI Agent SDK](https://openai.github.io/openai-agents-python/mcp/), [Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/)

### Simulators, Emulators, and Physical Devices

When launched, Mobile MCP can connect to:
- iOS Simulators on macOS/Linux
- Android Emulators on Linux/Windows/macOS
- Physical iOS or Android devices (requires proper platform tools and drivers)

Make sure you have your mobile platform SDKs (Xcode, Android SDK) installed and configured properly before running Mobile Next Mobile MCP.

### Running in "headless" mode on Simulators/Emulators

When you do not have a physical phone connected to your machine, you can run Mobile MCP with an emulator or simulator in the background.

For example, on Android:
1. Start an emulator (avdmanager / emulator command).
2. Run Mobile MCP with the desired flags

On iOS, you'll need Xcode and to run the Simulator before using Mobile MCP with that simulator instance.
- `xcrun simctl list`
- `xcrun simctl boot "iPhone 16"`

# Thanks to all contributors ❤️

### We appreciate everyone who has helped improve this project.

  <a href = "https://github.com/mobile-next/mobile-mcp/graphs/contributors">
   <img src = "https://contrib.rocks/image?repo=mobile-next/mobile-mcp"/>
 </a>

