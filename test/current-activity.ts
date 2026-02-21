import assert from "node:assert";

import { AndroidRobot, AndroidDeviceManager } from "../src/android";
import { IosRobot, IosManager } from "../src/ios";

const androidManager = new AndroidDeviceManager();
const androidDevices = androidManager.getConnectedDevices();
const hasAndroidDevice = androidDevices.length > 0;

const iosManager = new IosManager();
const iosDevices = iosManager.listDevices();
const hasIosDevice = iosDevices.length > 0;

describe("getCurrentActivity", () => {
	describe("Android", () => {
		const android = new AndroidRobot(androidDevices?.[0]?.deviceId || "");

		it("should return current activity as object with id field", async function() {
			hasAndroidDevice || this.skip();

			// First, ensure we're on the home screen
			await android.pressButton("HOME");

			// Get current activity
			const activity = await android.getCurrentActivity();

			// Should return an object with id field
			assert.ok(activity, "Activity should be defined");
			assert.ok("id" in activity, "Activity should have an id field");
			assert.ok(typeof activity.id === "string", "Activity id should be a string");
			assert.ok(activity.id.length > 0, "Activity id should not be empty");
		});

		it("should return correct package name after launching an app", async function() {
			hasAndroidDevice || this.skip();

			const testAppPackage = "com.android.settings";

			// Launch the settings app
			await android.launchApp(testAppPackage);

			// Small delay to ensure app is focused
			await new Promise(resolve => setTimeout(resolve, 500));

			const activity = await android.getCurrentActivity();
			assert.equal(activity.id, testAppPackage, `Expected ${testAppPackage} but got ${activity.id}`);
		});

		it("should throw ActionableError if no activity in focus", async function() {
			// This test is skipped as it's difficult to reliably create a state
			// where no activity is in focus on a real device
			this.skip();
		});
	});

	describe("iOS", () => {
		const ios = new IosRobot(iosDevices?.[0]?.deviceId || "");

		it("should return current activity as object with id field", async function() {
			hasIosDevice || this.skip();

			try {
				const activity = await ios.getCurrentActivity();

				// Should return an object with id field
				assert.ok(activity, "Activity should be defined");
				assert.ok("id" in activity, "Activity should have an id field");
				assert.ok(typeof activity.id === "string", "Activity id should be a string");
				assert.ok(activity.id.length > 0, "Activity id should not be empty");
			} catch (error: any) {
				// Skip if tunnel is not running or other setup issues
				if (error.message.includes("tunnel") || error.message.includes("WebDriver")) {
					this.skip();
				} else {
					throw error;
				}
			}
		});

		it("should return bundle ID format", async function() {
			hasIosDevice || this.skip();

			try {
				const activity = await ios.getCurrentActivity();

				// Bundle IDs typically contain dots (e.g., com.apple.mobilesafari)
				// or are single words like "Health", "Maps", etc.
				assert.ok(activity.id.length > 0, "Bundle ID should not be empty");

				// Verify bundle ID format (at least one dot for typical apps)
				// or common single-word system apps
				const isBundleIdFormat = /\./.test(activity.id);
				const isSystemApp = ["Health", "Maps", "Settings", "Photos"].includes(activity.id);
				assert.ok(isBundleIdFormat || isSystemApp, `Bundle ID "${activity.id}" should have a reverse-DNS format or be a known system app`);

				// Try to launch an app and verify we get its bundle ID
				// Using com.apple.mobilesafari as it's typically available
				const testBundleId = "com.apple.mobilesafari";
				await ios.launchApp(testBundleId);

				// Small poll to let Safari become foreground
				const deadline = Date.now() + 5000;
				let newActivity = await ios.getCurrentActivity();
				while (newActivity.id !== testBundleId && Date.now() < deadline) {
					await new Promise(resolve => setTimeout(resolve, 500));
					newActivity = await ios.getCurrentActivity();
				}

				assert.strictEqual(newActivity.id, testBundleId, `Expected ${testBundleId} but got ${newActivity.id}`);
			} catch (error: any) {
				// Skip if tunnel is not running or other setup issues
				if (error.message.includes("tunnel") || error.message.includes("WebDriver")) {
					this.skip();
				} else {
					throw error;
				}
			}
		});
	});
});
