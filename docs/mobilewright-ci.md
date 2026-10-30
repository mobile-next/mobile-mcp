# From Mobile MCP to CI

Mobile MCP lets a coding agent such as Claude Code or Cursor drive an iOS simulator, an Android emulator or a real device. It is a good way to explore an app and check a flow by hand. An agent session is not a test, though: it costs tokens on every run and the agent can take a different path each time.

This guide turns one agent session into a [Mobilewright](https://mobilewright.dev/?utm_source=mobile-mcp&utm_medium=docs&utm_campaign=agent-to-ci) test that runs the same way every time, then runs that test in GitHub Actions on every pull request.

The examples use [Milliways](https://github.com/mobile-next/Milliways), our sample app. Replace the bundle ID and the steps with your own app's.

## 1. Install Mobile MCP

Run the installer:

```bash
npx @mobilenext/mobile-mcp@latest install
```

It finds the MCP clients on your machine (Claude Code, Cursor, VS Code, Codex, Windsurf and more), lets you pick which ones to set up, and adds Mobile MCP to each of them. Add `--yes` to set up every client it finds without asking.

To set up a client by hand instead, see [Installation and configuration](../README.md#installation-and-configuration) in the README.

Then boot a simulator, start an emulator, or plug in a device.

## 2. Let the agent explore the flow

Ask the agent to do the flow you want to cover, in plain words. You don't need to install the app first; the agent can do that too:

```text
Download and install the app from https://github.com/mobile-next/Milliways/releases/latest
on the iPhone simulator. Then open it, start a new order, add two Green Salads,
open the order and check that the total is ₭44.00.
```

The agent picks the right build for the device (the simulator `.zip`, the `.apk` for Android, or the `.ipa` for a real iPhone), downloads it, and installs it with Mobile MCP.

The agent reads the screen through Mobile MCP's element list, taps by element, and reports what it saw at each step:

![The four screens the agent went through: the Milliways home screen, the menu, the Green Salad detail with quantity 2, and the order with a total of ₭44.00](screenshots/mobile-mcp-agent-session.png)

This is the time to fix the flow: if the agent gets stuck or the app misbehaves, you see it here, before any test code exists.

## 3. Ask for a Mobilewright test

In the same session, ask the agent to write down what it just did:

```text
Now write what you just did as a Mobilewright test in tests/order.spec.ts.
Use getByRole and getByText locators, not coordinates, and end with an
assertion on the order screen.
```

If the project does not use Mobilewright yet, the agent (or you) can add it first:

```bash
npm init mobilewright@latest
```

The agent already knows the labels and roles of every element it tapped, so the locators come straight from the session. For the flow above it writes:

`tests/order.spec.ts`:

```ts
import { test, expect } from '@mobilewright/test';

test('adds two green salads to the order', async ({ screen }) => {
  await screen.getByText('New Order').tap();
  await screen.getByText('Green Salad').tap();
  await screen.getByRole('button', { name: '+' }).tap();
  await screen.getByRole('button', { name: 'Add to Order' }).tap();

  await screen.getByRole('button', { name: /View Order/ }).tap();
  await expect(screen.getByText('Your Order')).toBeVisible();
  await expect(screen.getByText('2 × ₭22.00')).toBeVisible();
});
```

`mobilewright.config.ts`:

```ts
import { defineConfig } from 'mobilewright';

export default defineConfig({
  platform: 'ios',
  bundleId: 'com.mobilenext.Milliways',
  deviceName: /iPhone/,
});
```

Mobilewright waits for each element before acting on it, so there are no sleeps in the test. See [Locators](https://mobilewright.dev/docs/guides/locators) and [Assertions](https://mobilewright.dev/docs/guides/assertions) if you want to tighten what the agent wrote.

## 4. Run it locally

```bash
npx mobilewright test --reporter list,html
```

```
Running 1 test using 1 worker

  ✓  1 tests/order.spec.ts:3:5 › adds two green salads to the order (8.7s)

  1 passed (14.1s)
```

Open the report with `npx mobilewright show-report`:

![The Mobilewright HTML report with one passed test, "adds two green salads to the order"](screenshots/mobile-mcp-html-report.png)

From now on this flow runs in seconds, without an agent and without tokens. Keep using Mobile MCP to explore new flows and to debug a failing test, and ask the agent to update the test when the app changes.

## 5. Run it in GitHub Actions

In CI, run the tests on remote devices instead of simulators. The runner doesn't need a Mac or a simulator: Mobilewright allocates a device on [Mobile Next Cloud](https://mobilewright.dev/docs/cloud-providers/mobile-next-cloud), installs your app on it, runs the tests, and uploads the report to your dashboard.

Switch the driver when an API key is present, so the same config keeps working locally:

`mobilewright.config.ts`:

```ts
import { defineConfig, type MobilewrightConfig } from 'mobilewright';
import { MobileNextDriver } from '@mobilewright/driver-mobilenext';

const config: MobilewrightConfig = {
  platform: 'ios',
  bundleId: 'com.mobilenext.Milliways',
  deviceName: /iPhone/,
};

if (process.env.MOBILENEXT_API_KEY) {
  config.driver = new MobileNextDriver();
  config.deviceType = 'real';
  config.installApps = ['./build/app.ipa'];
}

export default defineConfig(config);
```

Create an API key at [mobilenext.ai](https://mobilenext.ai/cloud?utm_source=mobile-mcp&utm_medium=docs&utm_campaign=agent-to-ci), add it to your repository as the `MOBILENEXT_API_KEY` secret, and create `.github/workflows/mobilewright.yml`:

`.github/workflows/mobilewright.yml`:

```yaml
name: Mobilewright Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build-app.sh  # produces build/app.ipa
      - uses: actions/upload-artifact@v4
        with:
          name: app
          path: build/

  test:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      MOBILENEXT_API_KEY: ${{ secrets.MOBILENEXT_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: app
          path: build/
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx mobilewright test --reporter list,html

      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: mobilewright-report
          path: mobilewright-report/
          retention-days: 30
```

Key points:

- **Build once, test anywhere.** The `build` job compiles the app on a Mac. The `test` job only needs Node.js and the app file, so it runs on `ubuntu-latest`, which costs less and starts faster.
- **Android** works the same way: point `installApps` at your `.apk` and set `platform: 'android'`, or add a [project](https://mobilewright.dev/docs/test/projects) per platform.
- **More devices.** Raise `--workers` to run tests on several cloud devices at once.
- **`if: ${{ !cancelled() }}`** uploads the report when tests fail, which is when you need it.

Mobile Next Cloud is one of several [cloud providers](https://mobilewright.dev/docs/cloud-providers) Mobilewright supports; the workflow is the same for the others, with their driver and credentials. [Best Practices](https://mobilewright.dev/docs/guides/best-practices) covers splitting the build from the test job, and when to use workers or sharding.

## Tips for prompts

- **Name the end state.** "Check that the total is ₭44.00" gives the test a real assertion. "Add a salad" gives it nothing to check.
- **Ask for role and text locators.** The agent sees coordinates too. Coordinates break on the next screen size; `getByRole` and `getByText` don't.
- **One flow per test.** Ask for a separate test per flow instead of one long script, so a failure points at one thing.
- **Run it before you commit it.** Ask the agent to run `npx mobilewright test` and fix the test until it passes.

## See also

- [Best Practices](https://mobilewright.dev/docs/guides/best-practices) for running Mobilewright in CI
- [Cloud providers](https://mobilewright.dev/docs/cloud-providers)
- [Setting up CI](https://mobilewright.dev/docs/getting-started/ci), for local simulators and emulators
- [Agent CLI](https://mobilewright.dev/docs/agent-cli/introduction), a shell alternative to Mobile MCP for agents
- [Codegen](https://mobilewright.dev/docs/guides/codegen), to record a test by clicking instead of prompting
