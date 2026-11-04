import { test, expect } from "@playwright/test";
import {
	analyzeScreenWithKev,
	compactHierarchy,
	formatKevScreenSnapshot,
	getKevModel,
	getOllamaUrl,
	isHostedDecisionModel,
	kevHealth,
	mapComplexityScore,
	selectAvailableKevModel,
} from "../src/kev-hierarchy";
import { ScreenElement, ScreenSize, ForegroundApp } from "../src/robot";

test.describe("kev-hierarchy", () => {

	const screenSize: ScreenSize = { width: 402, height: 874, scale: 3 };
	const foregroundApp: ForegroundApp = {
		appName: "Settings",
		packageName: "com.apple.Preferences",
		activity: "SwiftUI.NavigationStackHostingController",
	};

	const sampleElements: ScreenElement[] = [
		{
			ref: "@e8",
			type: "Cell",
			label: "General",
			name: "com.apple.settings.general",
			identifier: "com.apple.settings.general",
			rect: { x: 16, y: 380, width: 370, height: 52 },
		},
		{
			ref: "@e9",
			type: "Button",
			label: "General",
			name: "com.apple.settings.general",
			identifier: "com.apple.settings.general",
			rect: { x: 16, y: 380, width: 370, height: 52 },
		},
		{
			ref: "@e10",
			type: "StaticText",
			label: "General",
			name: "General",
			rect: { x: 29, y: 392, width: 101, height: 29 },
		},
		{
			ref: "@e11",
			type: "Image",
			name: "chevron.forward",
			identifier: "chevron.forward",
			rect: { x: 360, y: 400, width: 7, height: 12 },
		},
		{
			ref: "@e12",
			type: "Button",
			label: "Accessibility",
			name: "com.apple.settings.accessibility",
			identifier: "com.apple.settings.accessibility",
			rect: { x: 16, y: 432, width: 370, height: 52 },
		},
		{
			ref: "@e40",
			type: "NavigationBar",
			name: "Settings",
			identifier: "Settings",
			rect: { x: 0, y: 62, width: 402, height: 106 },
		},
	];

	test.beforeEach(() => {
		kevHealth.reset();
	});

	test("1. iOS Settings hierarchy: deduplicates Cell+Button, child StaticText, and decorative Image", () => {
		const compacted = compactHierarchy(sampleElements, screenSize, foregroundApp);

		expect(compacted.actionable.length).toBe(2);
		expect(compacted.actionable[0]).toMatchObject({
			ref: "@e9",
			type: "Button",
			label: "General",
			tapX: 201,
			tapY: 406,
		});
		expect(compacted.actionable[1]).toMatchObject({
			ref: "@e12",
			type: "Button",
			label: "Accessibility",
			tapX: 201,
			tapY: 458,
		});

		// NavigationBar "Settings" is preserved as informational; child StaticText "General" and Image "chevron.forward" are filtered
		expect(compacted.informational.length).toBe(1);
		expect(compacted.informational[0]).toMatchObject({
			ref: "@e40",
			type: "NavigationBar",
			label: "Settings",
		});
	});

	test("2. iOS XCUIElementType* prefix normalization and form controls", () => {
		const iosFormElements: ScreenElement[] = [
			{
				ref: "@e1",
				type: "XCUIElementTypeTextField",
				label: "Username",
				value: "alice",
				identifier: "username_input",
				rect: { x: 20, y: 100, width: 300, height: 44 },
			},
			{
				ref: "@e2",
				type: "XCUIElementTypeSecureTextField",
				label: "Password",
				value: "••••••••",
				focused: true,
				rect: { x: 20, y: 160, width: 300, height: 44 },
			},
			{
				ref: "@e3",
				type: "XCUIElementTypeSwitch",
				label: "Remember Me",
				value: "1",
				checked: true,
				rect: { x: 20, y: 220, width: 60, height: 30 },
			},
			{
				ref: "@e4",
				type: "XCUIElementTypeButton",
				label: "Log In",
				rect: { x: 20, y: 270, width: 300, height: 50 },
			},
			{
				ref: "@e5",
				type: "XCUIElementTypeSlider",
				label: "Brightness",
				value: "75%",
				rect: { x: 20, y: 340, width: 300, height: 40 },
			},
			{
				ref: "@e6",
				type: "XCUIElementTypeSegmentedControl",
				label: "Mode",
				value: "Dark",
				selected: true,
				rect: { x: 20, y: 400, width: 300, height: 40 },
			},
			{
				ref: "@e7",
				type: "XCUIElementTypePickerWheel",
				label: "Country",
				value: "United States",
				rect: { x: 20, y: 460, width: 300, height: 100 },
			},
		];

		const compacted = compactHierarchy(iosFormElements, screenSize, foregroundApp);

		expect(compacted.actionable.length).toBe(7);
		expect(compacted.actionable.map(a => `${a.type}:${a.label}`)).toEqual([
			"TextField:Username",
			"SecureTextField:Password",
			"Switch:Remember Me",
			"Button:Log In",
			"Slider:Brightness",
			"SegmentedControl:Mode",
			"PickerWheel:Country",
		]);

		expect(compacted.actionable[1].focused).toBe(true);
		expect(compacted.actionable[2].checked).toBe(true);
		expect(compacted.actionable[5].selected).toBe(true);
		expect(compacted.actionable[0].value).toBe("alice");
	});

	test("3. Android mobilecli hierarchy: handles all Android widget types and retains refs", () => {
		const androidElements: ScreenElement[] = [
			{
				ref: "@e1",
				type: "android.widget.EditText",
				text: "search query",
				label: "Search",
				identifier: "com.example:id/search_box",
				rect: { x: 48, y: 120, width: 900, height: 120 },
			},
			{
				ref: "@e2",
				type: "android.widget.Button",
				text: "Submit",
				rect: { x: 48, y: 260, width: 400, height: 100 },
			},
			{
				ref: "@e3",
				type: "android.widget.ImageButton",
				label: "Back",
				rect: { x: 48, y: 40, width: 96, height: 96 },
			},
			{
				ref: "@e4",
				type: "android.widget.Switch",
				text: "Dark Mode",
				checked: true,
				rect: { x: 48, y: 380, width: 900, height: 80 },
			},
			{
				ref: "@e5",
				type: "android.widget.CheckBox",
				text: "Accept Terms",
				checked: false,
				rect: { x: 48, y: 480, width: 900, height: 80 },
			},
			{
				ref: "@e6",
				type: "android.widget.Spinner",
				text: "Option A",
				label: "Dropdown",
				rect: { x: 48, y: 580, width: 900, height: 100 },
			},
			{
				ref: "@e7",
				type: "android.widget.SeekBar",
				label: "Volume",
				value: "50%",
				rect: { x: 48, y: 700, width: 900, height: 60 },
			},
			{
				ref: "@e8",
				type: "com.google.android.material.floatingactionbutton.FloatingActionButton",
				label: "Add Item",
				rect: { x: 800, y: 1800, width: 140, height: 140 },
			},
			{
				ref: "@e9",
				type: "com.google.android.material.chip.Chip",
				text: "Filtered",
				selected: true,
				rect: { x: 48, y: 860, width: 200, height: 70 },
			},
		];

		const compacted = compactHierarchy(androidElements, { width: 1080, height: 2400 });

		expect(compacted.actionable.length).toBe(9);
		expect(compacted.actionable.map(a => `${a.ref}:${a.type}:${a.label}`)).toEqual([
			"@e1:EditText:Search",
			"@e2:Button:Submit",
			"@e3:ImageButton:Back",
			"@e4:Switch:Dark Mode",
			"@e5:CheckBox:Accept Terms",
			"@e6:Spinner:Dropdown",
			"@e7:SeekBar:Volume",
			"@e8:FloatingActionButton:Add Item",
			"@e9:Chip:Filtered",
		]);
	});

	test("4. Android Settings / Jetpack Compose hierarchy: recognizes resource-ids and promotes TextView rows", () => {
		// Case A: Settings screen with resource-ids and decorative noise
		const settingsElements: ScreenElement[] = [
			{
				ref: "@e1",
				type: "android.widget.TextView",
				text: "Network & internet",
				identifier: "android:id/title",
				rect: { x: 198, y: 360, width: 700, height: 60 },
			},
			{
				ref: "@e2",
				type: "android.widget.TextView",
				text: "Connected devices",
				identifier: "android:id/title",
				rect: { x: 198, y: 520, width: 700, height: 60 },
			},
			{
				ref: "@e3",
				type: "android.widget.TextView",
				text: "Apps",
				identifier: "com.android.settings:id/summary",
				rect: { x: 198, y: 680, width: 700, height: 60 },
			},
			{
				ref: "@e4",
				type: "android.view.View",
				identifier: "android:id/statusBarBackground",
				rect: { x: 0, y: 0, width: 1080, height: 72 },
			},
			{
				ref: "@e5",
				type: "android.view.View",
				identifier: "android:id/navigationBarBackground",
				rect: { x: 0, y: 2328, width: 1080, height: 72 },
			},
		];

		const compactedSettings = compactHierarchy(settingsElements, { width: 1080, height: 2400 });
		expect(compactedSettings.actionable.length).toBe(3);
		expect(compactedSettings.actionable.map(a => a.label)).toEqual([
			"Network & internet",
			"Connected devices",
			"Apps",
		]);

		// Case B: Compose screen without resource-ids where actionable would otherwise be < 2
		const composeElements: ScreenElement[] = [
			{
				ref: "@c1",
				type: "android.widget.TextView",
				text: "Profile Settings",
				rect: { x: 50, y: 200, width: 500, height: 60 },
			},
			{
				ref: "@c2",
				type: "android.view.View",
				label: "Privacy & Security",
				rect: { x: 50, y: 300, width: 500, height: 60 },
			},
		];

		const compactedCompose = compactHierarchy(composeElements, { width: 1080, height: 2400 });
		expect(compactedCompose.actionable.length).toBe(2);
		expect(compactedCompose.actionable[0].label).toBe("Profile Settings");
		expect(compactedCompose.actionable[1].label).toBe("Privacy & Security");
	});

	test("5. Legacy Android / iOS hierarchy: assigns fallback @ref and ranks target_element with 1:1 tap coordinates", async () => {
		const legacyElements: ScreenElement[] = [
			{
				// ref is undefined (legacy Android robot)
				type: "android.widget.TextView",
				text: "Network & internet",
				identifier: "android:id/title",
				rect: { x: 198, y: 360, width: 700, height: 60 },
			},
			{
				type: "android.widget.TextView",
				text: "Connected devices",
				identifier: "android:id/title",
				rect: { x: 198, y: 520, width: 700, height: 60 },
			},
		];

		const compacted = compactHierarchy(legacyElements, { width: 1080, height: 2400 });

		// Verify synthetic refs were assigned
		expect(compacted.actionable.length).toBe(2);
		expect(compacted.actionable[0].ref).toBe("@e1");
		expect(compacted.actionable[0].tapX).toBe(548);
		expect(compacted.actionable[0].tapY).toBe(390);
		expect(compacted.actionable[1].ref).toBe("@e2");
		expect(compacted.actionable[1].tapX).toBe(548);
		expect(compacted.actionable[1].tapY).toBe(550);

		let sentBody: any = null;
		const mockFetch: typeof fetch = async (_url: any, init?: any) => {
			sentBody = JSON.parse(init.body);
			return {
				ok: true,
				status: 200,
				json: async () => ({
					model: "kev:4b-q4_K_M",
					answers: {
						screen_type: { choice: "settings_menu", confidence: 0.95 },
						screen_complexity: { score: 0.5, probabilities: { "0": 0.5, "1": 0.5 } },
						hierarchy_sufficient: { noul: 0.92 },
						target_element: {
							choice: "@e1",
							confidence: 0.96,
							probabilities: { "@e1": 0.96, "@e2": 0.04 },
						},
					},
					usage: { input_tokens: 150, output_tokens: 0 },
				}),
			} as Response;
		};

		const analysis = await analyzeScreenWithKev(compacted, {
			goal: "Open Network settings",
			fetchImpl: mockFetch,
		});

		expect(sentBody.questions.target_element.criteria).toEqual({
			"@e1": "TextView: Network & internet",
			"@e2": "TextView: Connected devices",
		});

		expect(analysis.targetMatch?.choice).toBe("@e1");
		expect(analysis.targetMatch?.element?.tapX).toBe(548);
		expect(analysis.targetMatch?.element?.tapY).toBe(390);

		const snapshot = formatKevScreenSnapshot(compacted, analysis, { width: 1080, height: 2400 });
		expect(snapshot).toContain("Kev Best Match for \"Open Network settings\": @e1 (TextView \"Network & internet\") -> tap=(548, 390) or ref=\"@e1\"");
		expect(snapshot).toContain("@e1 TextView label=\"Network & internet\" id=\"android:id/title\" tap=548,390");
	});

	test("6. Unlabeled / game / canvas screen fallback: hierarchySufficient is false", async () => {
		// Empty hierarchy
		const emptyCompacted = compactHierarchy([], { width: 400, height: 800 });
		expect(emptyCompacted.actionable.length).toBe(0);
		expect(emptyCompacted.informational.length).toBe(0);

		const mockCanvasFetch: typeof fetch = async () => {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					model: "kev:4b-q4_K_M",
					answers: {
						screen_type: { choice: "detail_or_content", confidence: 0.5 },
						screen_complexity: { score: 0.1 },
						hierarchy_sufficient: { noul: 0.12 }, // low sufficiency prob
					},
				}),
			} as Response;
		};

		const analysis = await analyzeScreenWithKev(emptyCompacted, {
			fetchImpl: mockCanvasFetch,
		});

		expect(analysis.hierarchySufficient).toBe(false);
		expect(analysis.hierarchySufficientProb).toBe(0.12);
	});

	test("7. Environment variable configuration and hosted saas-* routing", async () => {
		const origEnv = { ...process.env };
		try {
			process.env.MOBILEMCP_SYSTEMONE_MODEL = "saas-24b-4bit";
			process.env.MOBILEMCP_SYSTEMONE_URL = "https://api.systemone.ai";
			process.env.MOBILEMCP_SYSTEMONE_API_KEY = "test-secret-key";
			process.env.MOBILEMCP_OLLAMA_URL = "http://custom-ollama:11434";

			expect(getKevModel()).toBe("saas-24b-4bit");
			expect(getOllamaUrl()).toBe("http://custom-ollama:11434");
			expect(isHostedDecisionModel("saas-24b-4bit")).toBe(true);
			expect(isHostedDecisionModel("kev:4b-q4_K_M")).toBe(false);

			const compacted = compactHierarchy(sampleElements, screenSize, foregroundApp);
			let capturedUrl = "";
			let capturedHeaders: Record<string, string> = {};
			let capturedBody: any = null;

			const mockFetch: typeof fetch = async (url: any, init?: any) => {
				capturedUrl = String(url);
				capturedHeaders = init.headers;
				capturedBody = JSON.parse(init.body);
				return {
					ok: true,
					status: 200,
					json: async () => ({
						model: "saas-24b-4bit",
						answers: {
							screen_type: { choice: "settings_menu", confidence: 0.9 },
							hierarchy_sufficient: { noul: 0.9 },
						},
					}),
				} as Response;
			};

			await analyzeScreenWithKev(compacted, {
				model: "saas-24b-4bit",
				fetchImpl: mockFetch,
			});

			expect(capturedUrl).toBe("https://api.systemone.ai/v1/systemone");
			expect(capturedHeaders.Authorization).toBe("Bearer test-secret-key");
			// Hosted model must not include keep_alive
			expect(capturedBody.keep_alive).toBeUndefined();

			// Test error thrown when MOBILEMCP_SYSTEMONE_URL is missing
			delete process.env.MOBILEMCP_SYSTEMONE_URL;
			await expect(analyzeScreenWithKev(compacted, {
				model: "saas-24b-4bit",
				fetchImpl: mockFetch,
			})).rejects.toThrow("MOBILEMCP_SYSTEMONE_URL must be set for a hosted decision model");

		} finally {
			process.env = origEnv;
		}
	});

	test("8. kevHealth circuit breaker cooldown, failure tracking, and recovery", async () => {
		const model = "kev:4b-q4_K_M";
		expect(kevHealth.isCooling(model)).toBe(false);
		expect(kevHealth.timeoutMs(model)).toBe(10_000);

		// Record success -> becomes warm
		kevHealth.recordSuccess(model);
		expect(kevHealth.isWarm(model)).toBe(true);
		expect(kevHealth.timeoutMs(model)).toBe(4_000);

		// Record 1st failure -> warm remains, not cooling
		kevHealth.recordFailure(model);
		expect(kevHealth.isCooling(model)).toBe(false);

		// Record 2nd failure -> trips into cooldown
		kevHealth.recordFailure(model);
		expect(kevHealth.isCooling(model)).toBe(true);

		const compacted = compactHierarchy(sampleElements, screenSize, foregroundApp);
		await expect(analyzeScreenWithKev(compacted, { model })).rejects.toThrow("is in cooldown after recent failures");

		// Record success -> recovers from cooldown
		kevHealth.recordSuccess(model);
		expect(kevHealth.isCooling(model)).toBe(false);
		expect(kevHealth.isWarm(model)).toBe(true);
	});

	test("9. Live end-to-end verification against local Ollama (/v1/systemone)", async () => {
		// Verify if local Ollama with kev:4b-q4_K_M is accessible
		let ollamaAvailable = false;
		try {
			const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1000) });
			if (res.ok) {
				const tags = (await res.json()) as any;
				ollamaAvailable = tags?.models?.some((m: any) => m.name === "kev:4b-q4_K_M");
			}
		} catch {
			ollamaAvailable = false;
		}

		if (!ollamaAvailable) {
			test.skip(true, "Local Ollama with kev:4b-q4_K_M is not running");
			return;
		}

		// A: iOS live verification
		const iosElements: ScreenElement[] = [
			{ ref: "@e1", type: "Cell", label: "Wi-Fi", rect: { x: 16, y: 200, width: 370, height: 50 } },
			{ ref: "@e2", type: "Button", label: "Wi-Fi", rect: { x: 16, y: 200, width: 370, height: 50 } },
			{ ref: "@e3", type: "Button", label: "Bluetooth", rect: { x: 16, y: 260, width: 370, height: 50 } },
		];
		const iosCompacted = compactHierarchy(iosElements, screenSize, foregroundApp);
		const iosResult = await analyzeScreenWithKev(iosCompacted, {
			goal: "Connect to Wi-Fi",
			model: "kev:4b-q4_K_M",
			ollamaUrl: "http://127.0.0.1:11434",
		});

		expect(iosResult.targetMatch?.choice).toBe("@e2");
		expect(iosResult.targetMatch?.element?.tapX).toBe(201);
		expect(iosResult.targetMatch?.element?.tapY).toBe(225);
		expect(iosResult.hierarchySufficient).toBe(true);

		// B: Android legacy (no refs) live verification
		const androidLegacyElements: ScreenElement[] = [
			{ type: "android.widget.TextView", text: "Network & internet", identifier: "android:id/title", rect: { x: 198, y: 360, width: 700, height: 60 } },
			{ type: "android.widget.TextView", text: "Connected devices", identifier: "android:id/title", rect: { x: 198, y: 520, width: 700, height: 60 } },
			{ type: "android.widget.TextView", text: "Apps", identifier: "android:id/title", rect: { x: 198, y: 680, width: 700, height: 60 } },
		];
		const androidCompacted = compactHierarchy(androidLegacyElements, { width: 1080, height: 2400 });
		const androidResult = await analyzeScreenWithKev(androidCompacted, {
			goal: "Open Network settings",
			model: "kev:4b-q4_K_M",
			ollamaUrl: "http://127.0.0.1:11434",
		});

		expect(androidResult.targetMatch?.choice).toBe("@e1");
		expect(androidResult.targetMatch?.element?.tapX).toBe(548);
		expect(androidResult.targetMatch?.element?.tapY).toBe(390);
		expect(androidResult.hierarchySufficient).toBe(true);

		const androidSnapshot = formatKevScreenSnapshot(androidCompacted, androidResult, { width: 1080, height: 2400 });
		expect(androidSnapshot).toContain("tap=(548, 390)");
	});

	test("mapComplexityScore maps System One score values to ordered complexity tiers", () => {
		expect(mapComplexityScore(0.25, { "0": 0.8, "1": 0.15, "2": 0.05 })).toBe("simple");
		expect(mapComplexityScore(0.75, { "0": 0.1, "1": 0.8, "2": 0.1 })).toBe("moderate");
		expect(mapComplexityScore(1.40, { "0": 0.05, "1": 0.15, "2": 0.8 })).toBe("complex");
	});

	test("selectAvailableKevModel selects preferred installed Kev model", () => {
		expect(selectAvailableKevModel(["llama3:8b", "kev:8b-q4_K_M", "kev:4b-q4_K_M"])).toBe("kev:4b-q4_K_M");
		expect(selectAvailableKevModel(["kev:latest"])).toBe("kev:latest");
		expect(selectAvailableKevModel(["kev:custom-4b"])).toBe("kev:custom-4b");
		expect(selectAvailableKevModel(["llama3:8b"])).toBeNull();
	});
});
