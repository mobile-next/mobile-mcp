# Mobile Next - 用于移动开发与自动化的 MCP 服务器 | iOS、Android、模拟器、仿真器与真机

[English](README.md) | [日本語](README.ja.md) | **简体中文**

这是一个 MCP 服务器，它通过与平台无关的接口实现可扩展的移动自动化与开发，让你无需掌握 iOS 或 Android 的专门知识。你可以在仿真器、模拟器以及真机（iOS 和 Android）上运行它。

该服务器让智能体和 LLM 能够通过结构化的无障碍（accessibility）快照，或基于截图的坐标点击，来与原生 iOS/Android 应用和设备交互。

**支持 Claude Code、Codex、Gemini、GitHub Copilot、Antigravity** —— 以及任何兼容 MCP 的客户端。

你可以在自己机器上的设备运行它，也可以通过 **[Mobile Next Cloud](https://mobilenext.ai/cloud?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=intro)** 在云端真实 iOS 和 Android 设备上运行 —— 工具完全相同，无需本地环境配置。

<h4 align="center">
  <a href="https://github.com/mobile-next/mobile-mcp">
    <img src="https://img.shields.io/github/stars/mobile-next/mobile-mcp" alt="Mobile Next Stars" />
  </a>
  <a href="https://www.npmjs.com/package/@mobilenext/mobile-mcp">
    <img src="https://img.shields.io/npm/dm/@mobilenext/mobile-mcp?logo=npm&style=flat&color=red" alt="npm" />
  </a>
  <a href="https://github.com/mobile-next/mobile-mcp/releases">
    <img src="https://img.shields.io/github/release/mobile-next/mobile-mcp" />
  </a>
  <a href="https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%7B%22name%22%3A%22mobile-mcp%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40mobilenext%2Fmobile-mcp%40latest%22%5D%7D">
    <img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code" />
  </a>
  <a href="https://github.com/mobile-next/mobile-mcp/wiki">
    <img src="https://img.shields.io/badge/documentation-wiki-blue" alt="wiki" />
  </a>
  <a href="https://mobilenext.ai/join-slack?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=badge">
    <img src="https://img.shields.io/badge/join-Slack-blueviolet?logo=slack&style=flat" alt="join on Slack" />
  </a>
</h4>


https://github.com/user-attachments/assets/bb084777-beb3-4930-ae6f-8d3fe694ddde


<p align="center">
    <a href="https://github.com/mobile-next/">
        <img alt="mobile-mcp" src="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-banner.png" width="600" />
    </a>
</p>

### 主要使用场景

我们如何帮助你扩展移动自动化:

- 📲 面向测试或数据录入场景的原生应用自动化（iOS 和 Android）
- 📝 无需手动操作模拟器/仿真器或真机（iPhone、三星、Google Pixel 等）即可执行的脚本化流程与表单交互
- 🧭 由 LLM 驱动的多步骤用户旅程自动化
- 👆 面向智能体框架的通用移动应用交互能力
- 🤖 为移动自动化和数据提取场景提供智能体之间的通信能力

## 主要特性

- 🚀 **无障碍优先 —— 快速且低成本**: 基于原生无障碍树驱动应用（无需视觉模型，不消耗图像 token），仅在必要时回退到截图 + 坐标方式。
- 📱 **一套 API，覆盖所有目标**: 同一套工具同时适用于 iOS 和 Android —— 模拟器、仿真器和真机皆可。
- 🧠 **无需平台专业知识**: 不需要 XCUITest，不需要 Espresso，也不需要各平台的胶水代码 —— 描述目标，智能体来完成。
- 🧰 **完整的设备控制**: 点击、滑动与手势；应用安装/启动/终止；屏幕录制；硬件按键；深度链接；屏幕方向。
- 📊 **结构化、确定性的输出**: 读取真实的 UI 元素并提取结构化数据，减少纯截图方案带来的歧义。

### 🎯 平台支持

| 目标 | 是否支持 | 环境准备 |
|---|:---:|---|
| iOS 模拟器 | ✅ | Xcode 以及已启动的模拟器 (`xcrun simctl`) |
| iOS 真机 | ✅ | 通过 USB 连接并已信任的设备 |
| Android 仿真器 | ✅ | Android SDK 以及运行中的仿真器 (`adb`) |
| Android 真机 | ✅ | `adb`，并已启用并授权 USB 调试 |

## 🔧 可用的 MCP 工具

### 设备管理
- **`mobile_list_available_devices`** - 列出所有可用设备（模拟器、仿真器和真机）
- **`mobile_get_screen_size`** - 获取移动设备的屏幕尺寸（像素）
- **`mobile_get_orientation`** - 获取设备当前的屏幕方向
- **`mobile_set_orientation`** - 更改屏幕方向（竖屏/横屏）
- **`mobile_set_location`** - 覆盖设备上报的 GPS 位置，或清除该覆盖
- **`mobile_clipboard`** - 读取或替换设备剪贴板内容

### 远程设备（Mobile Next Cloud）
- **`mobile_login_to_cloud_provider`** - 将本机与云设备提供方进行认证（基于浏览器的设备码登录）
- **`mobile_list_remote_devices`** - 列出可从云设备池中预约的设备型号
- **`mobile_allocate_remote_device`** - 预约一台物理云设备以供独占使用
- **`mobile_release_remote_device`** - 将已预约的云设备释放回设备池

### 应用管理
- **`mobile_list_apps`** - 列出设备上已安装的所有应用
- **`mobile_get_foreground_app`** - 获取当前处于前台的应用
- **`mobile_launch_app`** - 使用包名启动应用
- **`mobile_terminate_app`** - 停止并终止正在运行的应用
- **`mobile_install_app`** - 从文件安装应用（.apk、.ipa、.app、.zip）
- **`mobile_uninstall_app`** - 使用 bundle ID 或包名卸载应用

### 屏幕交互
- **`mobile_take_screenshot`** - 截取屏幕截图以了解屏幕上的内容
- **`mobile_save_screenshot`** - 将截图保存为文件
- **`mobile_list_elements_on_screen`** - 列出 UI 元素及其坐标和属性
- **`mobile_click_on_screen_at_coordinates`** - 点击指定的 x,y 坐标
- **`mobile_double_tap_on_screen`** - 双击指定坐标
- **`mobile_long_press_on_screen_at_coordinates`** - 长按指定坐标
- **`mobile_swipe_on_screen`** - 向任意方向滑动（上、下、左、右）
- **`mobile_start_screen_recording`** - 开始将设备屏幕录制为视频文件
- **`mobile_stop_screen_recording`** - 停止当前的屏幕录制并保存视频

### 输入与导航
- **`mobile_type_keys`** - 向获得焦点的元素输入文本，可选择是否提交
- **`mobile_press_button`** - 按下设备按键（HOME、BACK、VOLUME_UP/DOWN、ENTER 等）
- **`mobile_open_url`** - 在设备浏览器中打开 URL

### 日志与崩溃报告
- **`mobile_get_device_logs`** - 采集设备实时日志（Android 上为 logcat，iOS 上为 unified log），可选择保存到文件
- **`mobile_list_crashes`** - 列出设备上可用的崩溃报告
- **`mobile_get_crash`** - 按 ID 获取崩溃报告的完整内容

## 🏗️ Mobile MCP 架构

<p align="center">
    <a href="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-arch-1.png">
        <img alt="mobile-mcp" src="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-arch-1.png" width="600">
    </a>
</p>


## 📚 Wiki 页面

关于安装、配置和调试的更多细节，请查看我们的 [wiki 页面](https://github.com/mobile-next/mobile-mcp/wiki)。


## 前置条件

将 MCP 与你的智能体和移动设备连接起来所需要的东西:

- [Xcode 命令行工具](https://developer.apple.com/xcode/resources/)
- [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)
- [node.js](https://nodejs.org/en/download/) v20 及以上
- 支持 [MCP](https://modelcontextprotocol.io/introduction) 的基础模型或智能体，例如 [Claude MCP](https://modelcontextprotocol.io/quickstart/server)、[OpenAI Agent SDK](https://openai.github.io/openai-agents-python/mcp/)、[Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/)

## 安装与配置

**标准配置** 适用于大多数工具:

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

<details>
<summary>Amp</summary>

可以通过 Amp 的 VS Code 扩展设置界面添加，或者更新你的 `settings.json` 文件:

```json
"amp.mcpServers": {
  "mobile-mcp": {
    "command": "npx",
    "args": [
      "@mobilenext/mobile-mcp@latest"
    ]
  }
}
```

**Amp CLI:**

在终端中运行以下命令:

```bash
amp mcp add mobile-mcp -- npx @mobilenext/mobile-mcp@latest
```

</details>

<details>
<summary>Antigravity 2</summary>

Antigravity 没有添加 MCP 服务器的 CLI 命令，因此需要手动添加。编辑 `~/.gemini/config/mcp_config.json` 并加入:

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

</details>

<details>
<summary>Cline</summary>

配置 Cline 时，只需将上面的 json 添加到你的 MCP 设置文件中即可。

[更多内容见我们的 wiki](https://github.com/mobile-next/mobile-mcp/wiki/Cline)

</details>

<details>
<summary>Claude Code</summary>

使用 Claude Code CLI 添加 Mobile MCP 服务器:

```bash
claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest
```
</details>

<details>
<summary>Claude Desktop</summary>

参照 [MCP 安装指南](https://modelcontextprotocol.io/quickstart/user)，使用上面的 json 配置。

</details>

<details>
<summary>Codex</summary>

使用 Codex CLI 添加 Mobile MCP 服务器:

```bash
codex mcp add mobile-mcp npx "@mobilenext/mobile-mcp@latest"
```

或者，创建或编辑配置文件 `~/.codex/config.toml` 并加入:

```toml
[mcp_servers.mobile-mcp]
command = "npx"
args = ["@mobilenext/mobile-mcp@latest"]
```

更多信息请参阅 Codex 的 MCP 文档。

</details>

<details>
<summary>Copilot</summary>

使用 Copilot CLI 交互式地添加 Mobile MCP 服务器:

```text
/mcp add
```

你也可以编辑配置文件 `~/.copilot/mcp-config.json` 并加入:

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "type": "local",
      "command": "npx",
      "tools": [
        "*"
      ],
      "args": [
        "@mobilenext/mobile-mcp@latest"
      ]
    }
  }
}
```

更多信息请参阅 Copilot CLI 文档。

</details>

<details>
<summary>Cursor</summary>

#### 点击按钮安装:

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=Mobile%20MCP&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBtb2JpbGVuZXh0L21vYmlsZS1tY3BAbGF0ZXN0Il19)

#### 或手动安装:

依次进入 `Cursor Settings` -> `MCP` -> `Add new MCP Server`。名称可自定义，类型选择 `command`，命令填写 `npx -y @mobilenext/mobile-mcp@latest`。你也可以点击 `Edit` 来核对配置或添加命令行参数。

</details>

<details>
<summary>Gemini CLI</summary>

使用 Gemini CLI 添加 Mobile MCP 服务器:

```bash
gemini mcp add mobile-mcp npx -y @mobilenext/mobile-mcp@latest
```

</details>

<details>
<summary>Goose</summary>

#### 点击按钮安装:

[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=%40mobilenext%2Fmobile-mcp%40latest&id=mobile-mcp&name=Mobile%20MCP&description=Mobile%20automation%20and%20development%20for%20iOS%2C%20Android%2C%20simulators%2C%20emulators%2C%20and%20real%20devices)

#### 或手动安装:

依次进入 `Advanced settings` -> `Extensions` -> `Add custom extension`。名称可自定义，类型选择 `STDIO`，并将 `command` 设为 `npx -y @mobilenext/mobile-mcp@latest`。然后点击 “Add Extension”。

</details>

<details>
<summary>Kiro</summary>

请参照 MCP 服务器[文档](https://kiro.dev/docs/mcp/)。例如在 `.kiro/settings/mcp.json` 中:

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "npx",
      "args": [
        "@mobilenext/mobile-mcp@latest"
      ]
    }
  }
}
```

</details>

<details>
<summary>opencode</summary>

请参照 MCP 服务器文档。例如在 `~/.config/opencode/opencode.json` 中:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mobile-mcp": {
      "type": "local",
      "command": [
        "npx",
        "@mobilenext/mobile-mcp@latest"
      ],
      "enabled": true
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

打开 Windsurf 设置，进入 MCP servers，使用 `command` 类型添加一个新服务器:

```bash
npx @mobilenext/mobile-mcp@latest
```

或者按照上文所示，将标准配置添加到设置中的 `mcpServers` 下。

</details>


[在我们的 wiki 中了解更多](https://github.com/mobile-next/mobile-mcp/wiki)! 🚀

### ✅ 验证是否正常工作

服务器配置完成后，让你的智能体列出设备:

> list available devices

你应当会看到正在运行的模拟器、仿真器以及已连接的设备。如果能看到，说明 Mobile MCP 已正确接入。如果列表为空，请确认已经启动了模拟器或仿真器（参见[前置条件](#前置条件)）—— 需要更多帮助请查看 [wiki](https://github.com/mobile-next/mobile-mcp/wiki)。

### ☁️ 扩展规模，使用云设备

想扩展到数百台设备？想在 CI/CD 流水线中使用 Mobile MCP？

在你的智能体中输入提示词:
```text
log in to mobile next cloud and then show me which remote devices are available to me
```

### Streamable HTTP 服务器模式

Mobile MCP 默认通过 stdio 运行。若要改为启动 [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) 服务器，请使用 `--listen` 参数:

```bash
npx @mobilenext/mobile-mcp@latest --listen 3000
```

这会绑定到 `localhost:3000`。若要绑定到指定网络接口:

```bash
npx @mobilenext/mobile-mcp@latest --listen 0.0.0.0:3000
```

然后将你的 MCP 客户端配置为连接 `http://<host>:3000/mcp`（TLS 后可用 `https://…/mcp`）。该端点接受 Streamable HTTP（对 `/mcp` 的 `POST`/`GET`/`DELETE`）；远程模式为 **无状态**（无需会话亲和性）。

> **迁移说明:** 此前 `--listen` 在 `/mcp` 上提供已弃用的 HTTP+SSE。客户端需对 `http(s)://host:port/mcp` 使用 Streamable HTTP。见 [#98](https://github.com/mobile-next/mobile-mcp/issues/98)。

#### 认证授权

若要在 HTTP 服务器上强制使用 Bearer token 授权，请设置环境变量 `MOBILEMCP_AUTH`:

```bash
MOBILEMCP_AUTH=my-secret-token npx @mobilenext/mobile-mcp@latest --listen 3000
```

设置之后，所有请求都必须包含请求头 `Authorization: Bearer my-secret-token`。未设置时接受未认证连接并输出警告。

### 🛠️ 如何使用

将 MCP 服务器添加到你的 IDE/客户端之后，你就可以指示 AI 助手使用这些可用工具。
例如在 Cursor 的 agent 模式下，你可以使用下面的提示词来快速验证、测试和迭代 UI 交互，从屏幕读取信息，或者走完复杂的流程。
描述要具体，直击要点。

### ✨ 提示词示例

#### 工作流

你可以在一条提示词中指定详细的工作流，验证业务逻辑，搭建自动化。可以尽情发挥:

**搜索视频，评论、点赞并分享**
```
Find the video called " Beginner Recipe for Tonkotsu Ramen" by Way of
Ramen, click on like video, after liking write a comment " this was
delicious, will make it next Friday", share the video with the first
contact in your whatsapp list.
```

**下载一款热门计步应用，注册、设置锻炼并给出五星好评**
```
Find and Download a free "Pomodoro" app that has more than 1k stars.
Launch the app, register with my email, after registration find how to
start a pomodoro timer. When the pomodoro timer started, go back to the
app store and rate the app 5 stars, and leave a comment how useful the
app is.
```

**在 Substack 中搜索、阅读、高亮、评论并保存文章**
```
Open Substack website, search for "Latest trends in AI automation 2025",
open the first article, highlight the section titled "Emerging AI trends",
and save article to reading list for later review, comment a random
paragraph summary.
```

**预约健身课程并设置计时器**
```
Open ClassPass, search for yoga classes tomorrow morning within 2 miles,
book the highest-rated class at 7 AM, confirm reservation,
setup a timer for the booked slot in the phone
```

**查找本地活动并创建日历事件**
```
Open Eventbrite, search for AI startup meetup events happening this
weekend in "Austin, TX", select the most popular one, register and RSVP
yes to the event, setup a calendar event as a reminder.
```

**查看天气预报并通过 Whatsapp/Telegram/Slack 发送消息**
```
Open Weather app, check tomorrow's weather forecast for "Berlin", and
send the summary via Whatsapp/Telegram/Slack to contact "Lauren Trown",
thumbs up their response.
```

- **在 Zoom 中安排会议并通过邮件分享邀请**
```
Open Zoom app, schedule a meeting titled "AI Hackathon" for tomorrow at
10AM with a duration of 1 hour, copy the invitation link, and send it via
Gmail to contacts "team@example.com".
```

## 运行与配置

### 环境变量

| 变量 | 说明 | 示例 |
|---|---|---|
| `MOBILEMCP_AUTH` | 要求 Streamable HTTP 服务器（`--listen`）使用 Bearer token —— 设置后每个请求都必须发送 `Authorization: Bearer <token>`。 | `MOBILEMCP_AUTH=my-secret-token` |
| `MOBILEMCP_DISABLE_TELEMETRY` | 关闭匿名使用情况遥测。 | `MOBILEMCP_DISABLE_TELEMETRY=1` |
| `MOBILEMCP_ALLOW_UNSAFE_URLS` | 允许 `mobile_open_url` 打开非标准的 URL scheme（默认被阻止）。 | `MOBILEMCP_ALLOW_UNSAFE_URLS=1` |
| `MOBILEMCP_LEGACY_ROBOT` | 对 Android 设备和 iOS 真机使用旧版的平台专用 robot。iOS 模拟器仍然使用 `mobilecli`。 | `MOBILEMCP_LEGACY_ROBOT=1` |

### 模拟器、仿真器与真机

启动后，Mobile MCP 可以连接到:
- macOS/Linux 上的 iOS 模拟器
- Linux/Windows/macOS 上的 Android 仿真器
- iOS 或 Android 真机（需要相应的平台工具和驱动）

在运行 Mobile Next Mobile MCP 之前，请确保已正确安装并配置移动平台 SDK（Xcode、Android SDK）。

### 遥测

Mobile MCP 通过 PostHog 和 Scarf 收集匿名的使用情况遥测数据。若要关闭，请设置环境变量 `MOBILEMCP_DISABLE_TELEMETRY`:

```bash
MOBILEMCP_DISABLE_TELEMETRY=1 npx @mobilenext/mobile-mcp@latest
```

对于 json 配置:

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "npx",
      "args": ["-y", "@mobilenext/mobile-mcp@latest"],
      "env": {
        "MOBILEMCP_DISABLE_TELEMETRY": "1"
      }
    }
  }
}
```

### 在模拟器/仿真器上以“无头”模式运行

当你的机器上没有连接真机时，可以让 Mobile MCP 配合后台运行的仿真器或模拟器工作。

例如在 Android 上:
1. 启动一个仿真器（avdmanager / emulator 命令）。
2. 使用所需参数运行 Mobile MCP。

在 iOS 上，你需要安装 Xcode，并在通过 Mobile MCP 使用某个模拟器实例之前先启动 Simulator。
- `xcrun simctl list`
- `xcrun simctl boot "iPhone 16"`

## 🧩 Mobile Next 的一部分

Mobile MCP 是驱动真实移动设备这套工具集中的一环:

- **[mobilewright](https://github.com/mobile-next/mobilewright)** —— “移动端的 Playwright”。当你准备把智能体驱动的探索式操作变成 iOS 和 Android 上**可重复、确定性的测试**时，就该升级到 mobilewright。
- **[mobilecli](https://github.com/mobile-next/mobilecli)** —— Mobile MCP 所构建于其上的通用设备 CLI: 通过命令行或 JSON-RPC API 控制设备、模拟器和仿真器。
- **[Mobile Next Cloud](https://mobilenext.ai/cloud?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=part-of-mobile-next)** —— 同一套技术栈，按需租用: 随时可用的真实 iOS 和 Android 设备。只需向你的智能体输入提示词 `log in to mobile next cloud and then show me which remote devices are available to me` 即可开始。

## 🚀 路线图

我们持续改进 Mobile MCP。想了解我们接下来在做什么，请查看 [ROADMAP.md](ROADMAP.md) —— 优先级在很大程度上取决于社区反馈，所以请告诉我们你希望看到什么。

## 🤝 参与贡献

我们欢迎各种形式的贡献 —— 代码、文档、错误报告和想法。

- ⭐ **[给仓库点个 star](https://github.com/mobile-next/mobile-mcp)** —— 这是帮助更多人发现 Mobile MCP 最简单的方式。
- 阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何构建、测试并提交 pull request。
- 浏览[待处理的 issue](https://github.com/mobile-next/mobile-mcp/issues) 寻找可以着手的工作。
- 也欢迎在我们的 [Slack 社区](https://mobilenext.ai/join-slack?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=contributing) 中提问和分享想法。

也请阅读我们的[行为准则](CODE_OF_CONDUCT.md)。

# 感谢所有贡献者 ❤️

### 感谢每一位帮助改进这个项目的人。

  <a href = "https://github.com/mobile-next/mobile-mcp/graphs/contributors">
   <img src = "https://contrib.rocks/image?repo=mobile-next/mobile-mcp"/>
 </a>

## 隐私政策

Mobile MCP 在本地运行，仅与你所连接的设备通信。
有关数据收集、使用、保留以及联系方式，请查看 Mobile Next 隐私政策:
https://mobilenext.ai/privacy。
