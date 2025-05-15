import assert from "assert";

import { PNG } from "../src/png";
import { Simctl, SimctlManager } from "../src/iphone-simulator";
import { randomBytes } from "crypto";

describe("iphone-simulator", () => {

	const manager = new SimctlManager();
	const bootedSimulators = manager.listBootedSimulators();
	const hasOneSimulator = bootedSimulators.length === 1;
	const simctl = manager.getSimulator(bootedSimulators?.[0]?.uuid || "");

	const restartApp = async (app: string) => {
		await simctl.launchApp(app);
		await simctl.terminateApp(app);
		await simctl.launchApp(app);
	};

	const restartPreferencesApp = async () => {
		await restartApp("com.apple.Preferences");
	};

	const restartRemindersApp = async () => {
		await restartApp("com.apple.reminders");
	};

	it("should be able to swipe", async function() {
		hasOneSimulator || this.skip();
		await restartPreferencesApp();

		// make sure "General" is present (since it's at the top of the list)
		const elements1 = await simctl.getElementsOnScreen();
		assert.ok(elements1.findIndex(e => e.name === "com.apple.settings.general") !== -1);

		// swipe down
		await simctl.swipe("down");

		// make sure "General" is not visible now
		const elements2 = await simctl.getElementsOnScreen();
		assert.ok(elements2.findIndex(e => e.name === "com.apple.settings.general") === -1);

		// swipe up
		await simctl.swipe("up");

		// make sure "General" is visible again
		const elements3 = await simctl.getElementsOnScreen();
		assert.ok(elements3.findIndex(e => e.name === "com.apple.settings.general") !== -1);
	});

	it("should be able to send keys and press enter", async function() {
		hasOneSimulator || this.skip();
		await restartRemindersApp();

		// find new reminder element
		await new Promise(resolve => setTimeout(resolve, 3000));
		const elements = await simctl.getElementsOnScreen();
		const newElement = elements.find(e => e.label === "New Reminder");
		assert.ok(newElement !== undefined, "should have found New Reminder element");

		// click on new reminder
		await simctl.tap(newElement.rect.x, newElement.rect.y);

		// wait for keyboard to appear
		await new Promise(resolve => setTimeout(resolve, 1000));

		// send keys with press button "Enter"
		const random1 = randomBytes(8).toString("hex");
		await simctl.sendKeys(random1);
		await simctl.pressButton("ENTER");

		// send keys with "\n"
		const random2 = randomBytes(8).toString("hex");
		await simctl.sendKeys(random2 + "\n");

		const elements2 = await simctl.getElementsOnScreen();
		assert.ok(elements2.findIndex(e => e.value === random1) !== -1);
		assert.ok(elements2.findIndex(e => e.value === random2) !== -1);
	});

	it("should be able to get the screen size", async function() {
		hasOneSimulator || this.skip();
		const screenSize = await simctl.getScreenSize();
		assert.ok(screenSize.width > 256);
		assert.ok(screenSize.height > 256);
		assert.ok(screenSize.scale >= 1);
		assert.equal(Object.keys(screenSize).length, 3, "screenSize should have exactly 3 properties");
	});

	it("should be able to get screenshot", async function() {
		hasOneSimulator || this.skip();
		const screenshot = await simctl.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		const screenSize = await simctl.getScreenSize();
		assert.equal(pngSize.width, screenSize.width * screenSize.scale);
		assert.equal(pngSize.height, screenSize.height * screenSize.scale);
	});

	it("should be able to open url", async function() {
		hasOneSimulator || this.skip();
		// simply checking thato openurl with https:// launches safari
		await simctl.openUrl("https://www.example.com");
		await new Promise(resolve => setTimeout(resolve, 1000));

		const elements = await simctl.getElementsOnScreen();
		assert.ok(elements.length > 0);

		const addressBar = elements.find(element => element.type === "TextField" && element.name === "TabBarItemTitle" && element.label === "Address");
		assert.ok(addressBar !== undefined, "should have address bar");
	});

	it("should be able to list apps", async function() {
		hasOneSimulator || this.skip();
		const apps = await simctl.listApps();
		const packages = apps.map(app => app.packageName);
		assert.ok(packages.includes("com.apple.mobilesafari"));
		assert.ok(packages.includes("com.apple.reminders"));
		assert.ok(packages.includes("com.apple.Preferences"));
	});

	it("should be able to get elements on screen", async function() {
		hasOneSimulator || this.skip();
		await simctl.pressButton("HOME");
		await new Promise(resolve => setTimeout(resolve, 2000));

		const elements = await simctl.getElementsOnScreen();
		assert.ok(elements.length > 0);

		// must have News app in home screen
		const element = elements.find(e => e.type === "Icon" && e.label === "News");
		assert.ok(element !== undefined, "should have News app in home screen");
	});

	it("should be able to launch and terminate app", async function() {
		hasOneSimulator || this.skip();
		await restartPreferencesApp();
		await new Promise(resolve => setTimeout(resolve, 2000));
		const elements = await simctl.getElementsOnScreen();

		const buttons = elements.filter(e => e.type === "Button").map(e => e.label);
		assert.ok(buttons.includes("General"));
		assert.ok(buttons.includes("Accessibility"));

		// make sure app is terminated
		await simctl.terminateApp("com.apple.Preferences");
		const elements2 = await simctl.getElementsOnScreen();
		const buttons2 = elements2.filter(e => e.type === "Button").map(e => e.label);
		assert.ok(!buttons2.includes("General"));
	});

	it("should throw an error if button is not supported", async function() {
		hasOneSimulator || this.skip();
		try {
			await simctl.pressButton("NOT_A_BUTTON" as any);
			assert.fail("should have thrown an error");
		} catch (error) {
			assert.ok(error instanceof Error);
			assert.ok(error.message.includes("Button \"NOT_A_BUTTON\" is not supported"));
		}
	});

	// this test exists for regression testing, see issue #59
	it("should parse listapps output properly", () => {
		const text = `
		{
			".xctrunner" =     {
				ApplicationType = User;
				Bundle = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Bundle/Application/8EB6C622-A298-4BB6-8E29-AA2A5CE062EF/WebDriverAgentRunner-Runner.app/";
				BundleContainer = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Bundle/Application/8EB6C622-A298-4BB6-8E29-AA2A5CE062EF/";
				CFBundleDisplayName = "WebDriverAgentRunner-Runner";
				CFBundleExecutable = "WebDriverAgentRunner-Runner";
				CFBundleIdentifier = ".xctrunner";
				CFBundleName = "WebDriverAgentRunner-Runner";
				CFBundleVersion = 1;
				DataContainer = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Data/Application/AE7D36A1-AACA-4171-A070-645992DEAEB9/";
				GroupContainers =         {
				};
				Path = "/Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Bundle/Application/8EB6C622-A298-4BB6-8E29-AA2A5CE062EF/WebDriverAgentRunner-Runner.app";
				SBAppTags =         (
				);
			};
			"com.mobilenext.sample1" =     {
				ApplicationType = System;
				Bundle = "file:///Library/Developer/CoreSimulator/Volumes/iOS_22D8075/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS%2018.3.simruntime/Contents/Resources/RuntimeRoot/Applications/Bridge.app/";
				CFBundleDisplayName = Sample1;
				CFBundleExecutable = Sample1;
				CFBundleIdentifier = "com.mobilenext.sample1";
				CFBundleName = "Sample{1}App";
				CFBundleVersion = "1.0";
				DataContainer = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Data/Application/0D5C84C1-044C-4C03-B443-A1416DC1A296/";
				GroupContainers =         {
					"243LU875E5.groups.com.apple.podcasts" = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Shared/AppGroup/8B2DA97D-2308-4B65-B87F-1E71493477E5/";
					"group.com.apple.bridge" = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Shared/AppGroup/F6E42206-B548-4F83-AB13-6E5BD7D69AB0/";
					"group.com.apple.iBooks" = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Shared/AppGroup/EEBEC72A-6673-446A-AB31-E154AB850B69/";
					"group.com.apple.mail" = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Shared/AppGroup/C3339457-EB6A-46D1-92A3-AE398DA8CAC5/";
					"group.com.apple.stocks" = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Shared/AppGroup/50E3741D-E249-421F-83E8-24A896A1245B/";
					"group.com.apple.weather" = "file:///Library/Developer/CoreSimulator/Devices/FB9D9985-8FD0-493D-9B09-58FD3AA4BE65/data/Containers/Shared/AppGroup/28D40933-57F1-4B65-864F-1F6538B3ADF9/";
				};
				Path = "/Library/Developer/CoreSimulator/Volumes/iOS_22D8075/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 18.3.simruntime/Contents/Resources/RuntimeRoot/Applications/Bridge.app";
				SBAppTags =         (
					"watch-companion"
				);
			};
		}
		`;

		const apps = Simctl.parseIOSAppData(text);
		assert.equal(apps.length, 2);
		assert.equal(apps[0].CFBundleDisplayName, "WebDriverAgentRunner-Runner");
		assert.equal(apps[1].CFBundleDisplayName, "Sample1");
		assert.equal(apps[1].CFBundleName, "Sample{1}App");
	});
});
