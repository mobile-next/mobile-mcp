import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

import { PNG } from "../src/png";
import { MobileDevice } from "../src/mobile-device";
import { Mobilecli } from "../src/mobilecli";
import { ScreenElement } from "../src/robot";

test.describe("iphone-simulator", () => {

	const mobilecli = new Mobilecli();
	const devicesResponse = mobilecli.getDevices({
		platform: "ios",
		type: "simulator",
		includeOffline: false,
	});

	const bootedSimulators = devicesResponse.data.devices;
	const hasOneSimulator = bootedSimulators.length >= 1;
	const device = new MobileDevice(bootedSimulators?.[0]?.id || "");

	const waitForElements = async (
		predicate: (elements: ScreenElement[]) => boolean,
		description: string,
		timeoutMs = 15_000,
	): Promise<ScreenElement[]> => {
		const deadline = Date.now() + timeoutMs;
		let elements: ScreenElement[] = [];

		while (Date.now() < deadline) {
			elements = await device.getElementsOnScreen();
			if (predicate(elements)) {
				return elements;
			}
			await new Promise(resolve => setTimeout(resolve, 250));
		}

		throw new Error(`Timed out waiting for ${description}. Last elements: ${JSON.stringify(elements)}`);
	};

	const waitForElement = async (
		predicate: (element: ScreenElement) => boolean,
		description: string,
	): Promise<ScreenElement> => {
		const elements = await waitForElements(
			currentElements => currentElements.some(predicate),
			description,
		);
		const element = elements.find(predicate);
		if (!element) {
			throw new Error(`Element disappeared while waiting for ${description}`);
		}
		return element;
	};

	const tapElement = async (element: ScreenElement): Promise<void> => {
		const x = Math.floor(element.rect.x + element.rect.width / 2);
		const y = Math.floor(element.rect.y + element.rect.height / 2);
		await device.tap(x, y);
	};

	const restartApp = async (app: string) => {
		await device.launchApp(app);
		await device.terminateApp(app);
		await device.launchApp(app);
	};

	const restartPreferencesApp = async () => {
		await restartApp("com.apple.Preferences");
	};

	const restartRemindersApp = async () => {
		await restartApp("com.apple.reminders");
	};

	const openNewReminder = async (): Promise<void> => {
		let remindersListReady = false;

		for (let step = 0; step < 10; step++) {
			const elements = await waitForElements(
				currentElements => currentElements.some(element =>
					["Continue", "Not Now", "Cancel", "Discard Changes", "Reminders"].includes(element.label || "") ||
					element.name === "BackButton",
				),
				"Reminders navigation to become ready",
			);

			const onboardingAction = elements.find(element =>
				element.type === "Button" && ["Continue", "Not Now"].includes(element.label || ""),
			);
			if (onboardingAction) {
				await tapElement(onboardingAction);
				continue;
			}

			const discardButton = elements.find(element =>
				element.type === "Button" && element.label === "Discard Changes",
			);
			if (discardButton) {
				await tapElement(discardButton);
				continue;
			}

			const cancelButton = elements.find(element =>
				element.type === "Button" && element.label === "Cancel",
			);
			if (cancelButton) {
				await tapElement(cancelButton);
				continue;
			}

			const isInRemindersList = elements.some(element => element.name === "BackButton");
			const doneButton = elements.find(element =>
				element.type === "Button" && element.label === "Done",
			);
			if (isInRemindersList && doneButton) {
				await tapElement(doneButton);
				continue;
			}

			const newReminderButton = elements.find(element =>
				element.type === "Button" && element.label === "New Reminder",
			);
			if (isInRemindersList && newReminderButton) {
				remindersListReady = true;
				break;
			}

			const remindersList = elements.find(element =>
				element.type === "StaticText" && element.label === "Reminders",
			);
			if (remindersList) {
				await tapElement(remindersList);
			} else if (isInRemindersList) {
				// Already in the list but "Done"/"New Reminder" haven't rendered yet —
				// give the UI a moment to finish its push transition before retrying,
				// since the guarding waitForElements is already satisfied by BackButton.
				await new Promise(resolve => setTimeout(resolve, 250));
			}
		}

		if (!remindersListReady) {
			throw new Error("Unable to navigate to the Reminders list");
		}

		for (let step = 0; step < 8; step++) {
			const elements = await waitForElements(
				currentElements => currentElements.some(element =>
					(element.type === "TextField" && element.name === "Title" && element.value === "") ||
					(element.type === "Button" && element.label === "Continue") ||
					(element.type === "Button" && element.identifier === "Return") ||
					(element.type === "Button" && element.label === "New Reminder"),
				),
				"the new reminder editor",
			);

			if (elements.some(element =>
				element.type === "Button" && element.identifier === "Return",
			)) {
				return;
			}

			const continueButton = elements.find(element =>
				element.type === "Button" && element.label === "Continue",
			);
			if (continueButton) {
				await tapElement(continueButton);
				continue;
			}

			const newReminderButton = elements.find(element =>
				element.type === "Button" && element.label === "New Reminder",
			);
			if (newReminderButton) {
				await tapElement(newReminderButton);
				continue;
			}

			const titleField = elements.find(element =>
				element.type === "TextField" && element.name === "Title" && element.value === "",
			);
			if (titleField) {
				await tapElement(titleField);
				// Wait for the keyboard/Return key to appear rather than immediately
				// re-satisfying the predicate with the still-empty title field.
				await new Promise(resolve => setTimeout(resolve, 250));
			}
		}

		throw new Error("Unable to focus a new reminder after dismissing onboarding");
	};

	test("should be able to swipe", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await restartPreferencesApp();

		// make sure "General" is present (since it's at the top of the list)
		await waitForElement(
			element => element.name === "com.apple.settings.general",
			"General settings to appear",
		);

		// swipe up (bottom of screen to top of screen)
		await device.swipe("up");

		// make sure "General" is not visible now
		await waitForElements(
			elements => !elements.some(element => element.name === "com.apple.settings.general"),
			"General settings to leave the screen",
		);

		// swipe down
		await device.swipe("down");

		// make sure "General" is visible again
		await waitForElement(
			element => element.name === "com.apple.settings.general",
			"General settings to return",
		);
	});

	test("should be able to send keys and press enter", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await restartRemindersApp();

		await openNewReminder();

		// send keys with press button "Enter"
		const random1 = randomBytes(8).toString("hex");
		await device.sendKeys(random1);
		await waitForElements(
			elements => elements.some(element => element.value === random1),
			"the first reminder value to appear",
		);
		await device.pressButton("ENTER");
		await waitForElements(
			elements =>
				elements.some(element => element.value === random1) &&
				elements.some(element =>
					element.type === "TextField" &&
					element.name === "Title" &&
					element.value === "",
				),
			"Enter to create another reminder",
		);

		// send keys with "\n"
		const random2 = randomBytes(8).toString("hex");
		await device.sendKeys(random2 + "\n");

		const elements2 = await waitForElements(
			elements =>
				elements.some(element => element.value === random1) &&
				elements.some(element => element.value === random2),
			"both reminder values to appear",
		);
		expect(elements2.findIndex(e => e.value === random1)).not.toBe(-1);
		expect(elements2.findIndex(e => e.value === random2)).not.toBe(-1);
	});

	test("should be able to get the screen size", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		const screenSize = await device.getScreenSize();
		expect(screenSize.width).toBeGreaterThan(256);
		expect(screenSize.height).toBeGreaterThan(256);
		expect(screenSize.scale).toBeGreaterThanOrEqual(1);
		expect(Object.keys(screenSize).length, "screenSize should have exactly 3 properties").toBe(3);
	});

	test("should be able to get screenshot", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		const screenshot = await device.getScreenshot();
		expect(screenshot.length).toBeGreaterThan(64 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		const screenSize = await device.getScreenSize();

		// wda returns screen size as points, round up
		expect(Math.ceil(pngSize.width / screenSize.scale)).toBe(screenSize.width);
		expect(Math.ceil(pngSize.height / screenSize.scale)).toBe(screenSize.height);
	});

	test("should be able to open url", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		// simply checking that openurl with https:// launches safari
		await device.openUrl("https://www.example.com");

		const elements = await waitForElements(
			currentElements => currentElements.some(element =>
				element.type === "TextField" &&
				element.name === "TabBarItemTitle" &&
				element.label === "Address",
			),
			"Safari address bar to appear",
		);
		expect(elements.length).toBeGreaterThan(0);

		const addressBar = elements.find(element => element.type === "TextField" && element.name === "TabBarItemTitle" && element.label === "Address");
		expect(addressBar, "should have address bar").toBeDefined();
	});

	test("should be able to list apps", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		const apps = await device.listApps();
		const packages = apps.map(app => app.packageName);
		expect(packages).toContain("com.apple.mobilesafari");
		expect(packages).toContain("com.apple.reminders");
		expect(packages).toContain("com.apple.Preferences");
	});

	test("should be able to get elements on screen", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await device.pressButton("HOME");
		const elements = await waitForElements(
			currentElements => currentElements.some(element =>
				element.type === "Icon" && element.label === "News",
			),
			"the Home screen to appear",
		);
		expect(elements.length).toBeGreaterThan(0);

		// must have News app in home screen
		const element = elements.find(e => e.type === "Icon" && e.label === "News");
		expect(element, "should have News app in home screen").toBeDefined();
	});

	test("should be able to launch and terminate app", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await restartPreferencesApp();
		const elements = await waitForElements(
			currentElements => {
				const buttonLabels = currentElements
					.filter(element => element.type === "Button")
					.map(element => element.label);
				return buttonLabels.includes("General") && buttonLabels.includes("Accessibility");
			},
			"Settings buttons to appear",
		);

		const buttons = elements.filter(e => e.type === "Button").map(e => e.label);
		expect(buttons).toContain("General");
		expect(buttons).toContain("Accessibility");

		// make sure app is terminated
		await device.terminateApp("com.apple.Preferences");
		const elements2 = await waitForElements(
			currentElements => !currentElements.some(element =>
				element.type === "Button" && element.label === "General",
			),
			"Settings to terminate",
		);
		const buttons2 = elements2.filter(e => e.type === "Button").map(e => e.label);
		expect(buttons2).not.toContain("General");
	});

	/*
	test("should be able to get and set orientation", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");

		// Set to portrait and verify
		await device.setOrientation("portrait");
		const portrait = await device.getOrientation();
		expect(portrait).toBe("portrait");

		// Set to landscape and verify
		await device.setOrientation("landscape");
		const landscape = await device.getOrientation();
		expect(landscape).toBe("landscape");

		// Return to portrait
		await device.setOrientation("portrait");
		const portraitAgain = await device.getOrientation();
		expect(portraitAgain).toBe("portrait");
	});
	*/

	test("should throw an error if button is not supported", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await expect(device.pressButton("NOT_A_BUTTON" as any)).rejects.toThrow("unsupported button: NOT_A_BUTTON");
	});
});
