# Mobile Next - モバイル開発・自動化のための MCP サーバー | iOS、Android、シミュレーター、エミュレーター、実機

[English](README.md) | **日本語** | [简体中文](README.zh-CN.md)

これは MCP サーバーです。プラットフォームに依存しないインターフェースを通じて、スケーラブルなモバイル自動化と開発を可能にし、iOS や Android の個別知識を不要にします。エミュレーター、シミュレーター、実機（iOS および Android）で実行できます。

このサーバーにより、エージェントや LLM は、構造化されたアクセシビリティスナップショット、またはスクリーンショットに基づく座標タップを通じて、ネイティブの iOS / Android アプリケーションおよびデバイスを操作できます。

**Claude Code、Codex、Gemini、GitHub Copilot、Antigravity に対応** — その他 MCP 互換クライアントでも動作します。

自分のマシン上のデバイスに対して実行することも、**[Mobile Next Cloud](https://mobilenext.ai/cloud?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=intro)** 上の実際の iOS / Android 実機に対して実行することもできます。同じツール群を、ローカルセットアップなしで利用できます。

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

### 主なユースケース

モバイル自動化のスケールをどのように支援するか:

- 📲 テストやデータ入力シナリオのためのネイティブアプリ自動化（iOS および Android）
- 📝 シミュレーター / エミュレーターや実機（iPhone、Samsung、Google Pixel など）を手動操作せずに実行するスクリプト化されたフローとフォーム入力
- 🧭 LLM が駆動する複数ステップのユーザージャーニーの自動化
- 👆 エージェントベースのフレームワークのための汎用的なモバイルアプリケーション操作
- 🤖 モバイル自動化やデータ抽出のユースケースにおけるエージェント間通信の実現

## 主な機能

- 🚀 **アクセシビリティ優先 — 高速かつ低コスト**: ネイティブのアクセシビリティツリーからアプリを操作します（ビジョンモデル不要、画像トークン不要）。必要な場合のみスクリーンショット + 座標にフォールバックします。
- 📱 **1 つの API であらゆるターゲットへ**: 同じツールが iOS と Android の両方で動作します — シミュレーター、エミュレーター、実機を問いません。
- 🧠 **プラットフォームの専門知識は不要**: XCUITest も Espresso もプラットフォームごとのつなぎコードも不要です。目的を伝えればエージェントが実行します。
- 🧰 **完全なデバイス制御**: タップ、スワイプ、ジェスチャー、アプリのインストール / 起動 / 終了、画面録画、ハードウェアボタン、ディープリンク、画面の向き。
- 📊 **構造化された決定的な出力**: 実際の UI 要素を読み取って構造化データを抽出し、スクリーンショットのみのアプローチにありがちな曖昧さを削減します。

### 🎯 対応プラットフォーム

| ターゲット | 対応 | セットアップ |
|---|:---:|---|
| iOS シミュレーター | ✅ | Xcode と起動済みのシミュレーター (`xcrun simctl`) |
| iOS 実機 | ✅ | USB 接続され、信頼済みのデバイス |
| Android エミュレーター | ✅ | Android SDK と実行中のエミュレーター (`adb`) |
| Android 実機 | ✅ | `adb` と、有効化・認可済みの USB デバッグ |

## 🔧 利用可能な MCP ツール

### デバイス管理
- **`mobile_list_available_devices`** - 利用可能なすべてのデバイス（シミュレーター、エミュレーター、実機）を一覧表示します
- **`mobile_get_screen_size`** - モバイルデバイスの画面サイズをピクセル単位で取得します
- **`mobile_get_orientation`** - デバイスの現在の画面の向きを取得します
- **`mobile_set_orientation`** - 画面の向きを変更します（縦向き / 横向き）
- **`mobile_set_location`** - デバイスが報告する GPS 位置情報を上書きする、または上書きを解除します
- **`mobile_clipboard`** - デバイスのクリップボードを読み取る、または置き換えます

### リモートデバイス（Mobile Next Cloud）
- **`mobile_login_to_cloud_provider`** - このマシンをクラウドデバイスプロバイダーで認証します（ブラウザベースのデバイスコードログイン）
- **`mobile_list_remote_devices`** - クラウドフリートから予約可能なデバイスモデルを一覧表示します
- **`mobile_allocate_remote_device`** - 物理クラウドデバイスを専有利用のために予約します
- **`mobile_release_remote_device`** - 予約済みのクラウドデバイスをフリートに返却します

### アプリ管理
- **`mobile_list_apps`** - デバイスにインストールされているすべてのアプリを一覧表示します
- **`mobile_get_foreground_app`** - 現在フォアグラウンドにあるアプリを取得します
- **`mobile_launch_app`** - パッケージ名を指定してアプリを起動します
- **`mobile_terminate_app`** - 実行中のアプリを停止・終了します
- **`mobile_install_app`** - ファイル（.apk、.ipa、.app、.zip）からアプリをインストールします
- **`mobile_uninstall_app`** - バンドル ID またはパッケージ名を指定してアプリをアンインストールします

### 画面操作
- **`mobile_take_screenshot`** - 画面に何が表示されているかを把握するためにスクリーンショットを撮影します
- **`mobile_save_screenshot`** - スクリーンショットをファイルに保存します
- **`mobile_list_elements_on_screen`** - UI 要素を座標やプロパティとともに一覧表示します
- **`mobile_click_on_screen_at_coordinates`** - 指定した x,y 座標をクリックします
- **`mobile_double_tap_on_screen`** - 指定した座標をダブルタップします
- **`mobile_long_press_on_screen_at_coordinates`** - 指定した座標を長押しします
- **`mobile_swipe_on_screen`** - 任意の方向にスワイプします（上、下、左、右）
- **`mobile_start_screen_recording`** - デバイス画面の録画をビデオファイルへ開始します
- **`mobile_stop_screen_recording`** - 実行中の画面録画を停止し、ビデオを保存します

### 入力とナビゲーション
- **`mobile_type_keys`** - フォーカスされた要素にテキストを入力します（送信の有無を選択可能）
- **`mobile_press_button`** - デバイスのボタンを押します（HOME、BACK、VOLUME_UP/DOWN、ENTER など）
- **`mobile_open_url`** - デバイスのブラウザで URL を開きます

### ログとクラッシュレポート
- **`mobile_get_device_logs`** - デバイスのライブログを収集します（Android は logcat、iOS は unified log）。ファイルへの保存も可能です
- **`mobile_list_crashes`** - デバイス上で利用可能なクラッシュレポートを一覧表示します
- **`mobile_get_crash`** - ID を指定してクラッシュレポートの全文を取得します

## 🏗️ Mobile MCP のアーキテクチャ

<p align="center">
    <a href="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-arch-1.png">
        <img alt="mobile-mcp" src="https://raw.githubusercontent.com/mobile-next/mobile-next-assets/refs/heads/main/mobile-mcp-arch-1.png" width="600">
    </a>
</p>


## 📚 Wiki ページ

セットアップ、設定、デバッグに関する詳細は [wiki ページ](https://github.com/mobile-next/mobile-mcp/wiki) をご覧ください。


## 前提条件

MCP をエージェントおよびモバイルデバイスに接続するために必要なもの:

- [Xcode コマンドラインツール](https://developer.apple.com/xcode/resources/)
- [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)
- [node.js](https://nodejs.org/en/download/) v20 以上
- [MCP](https://modelcontextprotocol.io/introduction) に対応した基盤モデルまたはエージェント。例: [Claude MCP](https://modelcontextprotocol.io/quickstart/server)、[OpenAI Agent SDK](https://openai.github.io/openai-agents-python/mcp/)、[Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/)

## インストールと設定

**標準設定** はほとんどのツールで動作します:

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

Amp の VS Code 拡張機能の設定画面から追加するか、`settings.json` ファイルを更新してください:

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

ターミナルで次のコマンドを実行します:

```bash
amp mcp add mobile-mcp -- npx @mobilenext/mobile-mcp@latest
```

</details>

<details>
<summary>Antigravity 2</summary>

Antigravity には MCP サーバーを追加する CLI コマンドがないため、手動で追加します。`~/.gemini/config/mcp_config.json` を編集して次を追加してください:

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

Cline をセットアップするには、上記の json を MCP 設定ファイルに追加するだけです。

[詳細は wiki をご覧ください](https://github.com/mobile-next/mobile-mcp/wiki/Cline)

</details>

<details>
<summary>Claude Code</summary>

Claude Code CLI を使って Mobile MCP サーバーを追加します:

```bash
claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest
```
</details>

<details>
<summary>Claude Desktop</summary>

[MCP インストールガイド](https://modelcontextprotocol.io/quickstart/user) に従い、上記の json 設定を使用してください。

</details>

<details>
<summary>Codex</summary>

Codex CLI を使って Mobile MCP サーバーを追加します:

```bash
codex mcp add mobile-mcp npx "@mobilenext/mobile-mcp@latest"
```

あるいは、設定ファイル `~/.codex/config.toml` を作成または編集して次を追加します:

```toml
[mcp_servers.mobile-mcp]
command = "npx"
args = ["@mobilenext/mobile-mcp@latest"]
```

詳細は Codex の MCP ドキュメントをご覧ください。

</details>

<details>
<summary>Copilot</summary>

Copilot CLI を使って対話的に Mobile MCP サーバーを追加します:

```text
/mcp add
```

設定ファイル `~/.copilot/mcp-config.json` を編集して次を追加することもできます:

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

詳細は Copilot CLI のドキュメントをご覧ください。

</details>

<details>
<summary>Cursor</summary>

#### ボタンをクリックしてインストール:

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=Mobile%20MCP&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBtb2JpbGVuZXh0L21vYmlsZS1tY3BAbGF0ZXN0Il19)

#### または手動でインストール:

`Cursor Settings` -> `MCP` -> `Add new MCP Server` を開きます。名前は任意で、`command` タイプを選び、コマンドに `npx -y @mobilenext/mobile-mcp@latest` を指定します。`Edit` をクリックして設定の確認やコマンド引数の追加もできます。

</details>

<details>
<summary>Gemini CLI</summary>

Gemini CLI を使って Mobile MCP サーバーを追加します:

```bash
gemini mcp add mobile-mcp npx -y @mobilenext/mobile-mcp@latest
```

</details>

<details>
<summary>Goose</summary>

#### ボタンをクリックしてインストール:

[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=%40mobilenext%2Fmobile-mcp%40latest&id=mobile-mcp&name=Mobile%20MCP&description=Mobile%20automation%20and%20development%20for%20iOS%2C%20Android%2C%20simulators%2C%20emulators%2C%20and%20real%20devices)

#### または手動でインストール:

`Advanced settings` -> `Extensions` -> `Add custom extension` を開きます。名前は任意で、タイプに `STDIO` を選び、`command` に `npx -y @mobilenext/mobile-mcp@latest` を設定します。「Add Extension」をクリックしてください。

</details>

<details>
<summary>Kiro</summary>

MCP サーバーの[ドキュメント](https://kiro.dev/docs/mcp/)に従ってください。例えば `.kiro/settings/mcp.json` に次のように記述します:

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

MCP サーバーのドキュメントに従ってください。例えば `~/.config/opencode/opencode.json` に次のように記述します:

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

Windsurf の設定を開き、MCP servers に移動して、`command` タイプの新しいサーバーを次の内容で追加します:

```bash
npx @mobilenext/mobile-mcp@latest
```

または、上記の標準設定を設定ファイルの `mcpServers` の下に追加してください。

</details>


[詳細は wiki をご覧ください](https://github.com/mobile-next/mobile-mcp/wiki)! 🚀

### ✅ 動作確認

サーバーの設定が完了したら、エージェントにデバイスの一覧を尋ねてみましょう:

> list available devices

実行中のシミュレーター、エミュレーター、接続済みのデバイスが返ってくるはずです。返ってくれば、Mobile MCP は正しく設定されています。リストが空の場合は、シミュレーターまたはエミュレーターが起動していることを確認してください（[前提条件](#前提条件)を参照）。さらに詳しくは [wiki](https://github.com/mobile-next/mobile-mcp/wiki) をご覧ください。

### ☁️ クラウドデバイスでスケールする

数百台規模のデバイスにスケールしたい場合は？ CI/CD パイプラインで Mobile MCP を使いたい場合は？

エージェントで次のようにプロンプトを入力してください:
```text
log in to mobile next cloud and then show me which remote devices are available to me
```

### SSE サーバーモード

Mobile MCP はデフォルトで stdio 上で動作します。代わりに SSE サーバーを起動するには、`--listen` フラグを使用します:

```bash
npx @mobilenext/mobile-mcp@latest --listen 3000
```

これは `localhost:3000` にバインドします。特定のインターフェースにバインドするには:

```bash
npx @mobilenext/mobile-mcp@latest --listen 0.0.0.0:3000
```

その後、MCP クライアントが `http://<host>:3000/mcp` に接続するよう設定します。

#### 認可

SSE サーバーで Bearer トークンによる認可を要求するには、環境変数 `MOBILEMCP_AUTH` を設定します:

```bash
MOBILEMCP_AUTH=my-secret-token npx @mobilenext/mobile-mcp@latest --listen 3000
```

設定すると、すべてのリクエストにヘッダー `Authorization: Bearer my-secret-token` を含める必要があります。

### 🛠️ 使い方

IDE / クライアントに MCP サーバーを追加したら、AI アシスタントに対して利用可能なツールを使うよう指示できます。
例えば Cursor のエージェントモードでは、以下のプロンプトを使って UI 操作の検証・テスト・改善を素早く行ったり、画面から情報を読み取ったり、複雑なワークフローを実行したりできます。
具体的に、要点を押さえて記述してください。

### ✨ プロンプト例

#### ワークフロー

1 つのプロンプトで詳細なワークフローを指定し、ビジネスロジックを検証したり、自動化を構築したりできます。かなり大胆な指示も可能です:

**動画を検索し、コメント、いいね、共有する**
```
Find the video called " Beginner Recipe for Tonkotsu Ramen" by Way of
Ramen, click on like video, after liking write a comment " this was
delicious, will make it next Friday", share the video with the first
contact in your whatsapp list.
```

**人気の歩数計アプリをダウンロードし、登録し、ワークアウトを設定して 5 つ星を付ける**
```
Find and Download a free "Pomodoro" app that has more than 1k stars.
Launch the app, register with my email, after registration find how to
start a pomodoro timer. When the pomodoro timer started, go back to the
app store and rate the app 5 stars, and leave a comment how useful the
app is.
```

**Substack で検索し、記事を読み、ハイライト、コメント、保存する**
```
Open Substack website, search for "Latest trends in AI automation 2025",
open the first article, highlight the section titled "Emerging AI trends",
and save article to reading list for later review, comment a random
paragraph summary.
```

**ワークアウトのクラスを予約し、タイマーを設定する**
```
Open ClassPass, search for yoga classes tomorrow morning within 2 miles,
book the highest-rated class at 7 AM, confirm reservation,
setup a timer for the booked slot in the phone
```

**地域のイベントを探し、カレンダーに予定を登録する**
```
Open Eventbrite, search for AI startup meetup events happening this
weekend in "Austin, TX", select the most popular one, register and RSVP
yes to the event, setup a calendar event as a reminder.
```

**天気予報を確認し、Whatsapp / Telegram / Slack でメッセージを送る**
```
Open Weather app, check tomorrow's weather forecast for "Berlin", and
send the summary via Whatsapp/Telegram/Slack to contact "Lauren Trown",
thumbs up their response.
```

- **Zoom で会議を予定し、招待をメールで共有する**
```
Open Zoom app, schedule a meeting titled "AI Hackathon" for tomorrow at
10AM with a duration of 1 hour, copy the invitation link, and send it via
Gmail to contacts "team@example.com".
```

## 実行と設定

### 環境変数

| 変数 | 説明 | 例 |
|---|---|---|
| `MOBILEMCP_AUTH` | SSE サーバーで Bearer トークンを必須にします。設定すると、すべてのリクエストが `Authorization: Bearer <token>` を送信する必要があります。 | `MOBILEMCP_AUTH=my-secret-token` |
| `MOBILEMCP_DISABLE_TELEMETRY` | 匿名の利用テレメトリを無効にします。 | `MOBILEMCP_DISABLE_TELEMETRY=1` |
| `MOBILEMCP_ALLOW_UNSAFE_URLS` | `mobile_open_url` が標準外の URL スキームを開くことを許可します（デフォルトではブロックされます）。 | `MOBILEMCP_ALLOW_UNSAFE_URLS=1` |
| `MOBILEMCP_LEGACY_ROBOT` | Android デバイスおよび iOS 実機に対して、従来のプラットフォーム固有のロボットを使用します。iOS シミュレーターは引き続き `mobilecli` を使用します。 | `MOBILEMCP_LEGACY_ROBOT=1` |

### シミュレーター、エミュレーター、実機

起動時、Mobile MCP は次のものに接続できます:
- macOS / Linux 上の iOS シミュレーター
- Linux / Windows / macOS 上の Android エミュレーター
- iOS または Android の実機（適切なプラットフォームツールとドライバーが必要です）

Mobile Next Mobile MCP を実行する前に、モバイルプラットフォームの SDK（Xcode、Android SDK）が正しくインストール・設定されていることを確認してください。

### テレメトリ

Mobile MCP は PostHog と Scarf を通じて匿名の利用テレメトリを収集します。無効にするには、環境変数 `MOBILEMCP_DISABLE_TELEMETRY` を設定します:

```bash
MOBILEMCP_DISABLE_TELEMETRY=1 npx @mobilenext/mobile-mcp@latest
```

json 設定の場合:

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

### シミュレーター / エミュレーターでの「ヘッドレス」モード実行

実機がマシンに接続されていない場合でも、バックグラウンドでエミュレーターまたはシミュレーターを使って Mobile MCP を実行できます。

例えば Android の場合:
1. エミュレーターを起動します（avdmanager / emulator コマンド）。
2. 必要なフラグを付けて Mobile MCP を実行します。

iOS の場合は、Xcode が必要で、そのシミュレーターインスタンスで Mobile MCP を使う前に Simulator を起動しておく必要があります。
- `xcrun simctl list`
- `xcrun simctl boot "iPhone 16"`

## 🧩 Mobile Next の一部として

Mobile MCP は、実際のモバイルデバイスを動かすためのツールキットの 1 つです:

- **[mobilewright](https://github.com/mobile-next/mobilewright)** — 「モバイル版 Playwright」。エージェント主導の探索を iOS / Android 向けの**再現可能で決定的なテスト**に変える準備ができたら、mobilewright へ進みましょう。
- **[mobilecli](https://github.com/mobile-next/mobilecli)** — Mobile MCP が土台としている汎用デバイス CLI。コマンドラインまたは JSON-RPC API から、デバイス、シミュレーター、エミュレーターを制御できます。
- **[Mobile Next Cloud](https://mobilenext.ai/cloud?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=part-of-mobile-next)** — 同じスタックをレンタルで。実際の iOS / Android 実機をオンデマンドで利用できます。エージェントに `log in to mobile next cloud and then show me which remote devices are available to me` とプロンプトを送るだけで始められます。

## 🚀 ロードマップ

Mobile MCP は継続的に改善しています。次に何を作っているかは [ROADMAP.md](ROADMAP.md) をご覧ください。優先順位はコミュニティのフィードバックに大きく影響されるため、見たいものをぜひ教えてください。

## 🤝 コントリビュート

コード、ドキュメント、バグ報告、アイデア — あらゆるコントリビュートを歓迎します。

- ⭐ **[リポジトリにスターを付ける](https://github.com/mobile-next/mobile-mcp)** — Mobile MCP を他の人に知ってもらう最も簡単な方法です。
- ビルド、テスト、プルリクエストの作成方法については [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。
- 取り組めるものを探すには [オープンな issue](https://github.com/mobile-next/mobile-mcp/issues) をご覧ください。
- 質問やアイデアは [Slack コミュニティ](https://mobilenext.ai/join-slack?utm_source=github&utm_medium=readme&utm_campaign=mobile-mcp&utm_content=contributing) でも歓迎します。

[行動規範](CODE_OF_CONDUCT.md)にも目を通してください。

# すべてのコントリビューターに感謝します ❤️

### このプロジェクトの改善に協力してくださったすべての方に感謝します。

  <a href = "https://github.com/mobile-next/mobile-mcp/graphs/contributors">
   <img src = "https://contrib.rocks/image?repo=mobile-next/mobile-mcp"/>
 </a>

## プライバシーポリシー

Mobile MCP はローカルで実行され、接続したデバイスとのみ通信します。
データの収集、利用、保持、連絡先については、Mobile Next のプライバシーポリシー
https://mobilenext.ai/privacy をご覧ください。
