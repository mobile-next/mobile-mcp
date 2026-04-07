"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpServer = exports.getAgentVersion = void 0;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const zod_1 = require("zod");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const logger_1 = require("./logger");
const android_1 = require("./android");
const robot_1 = require("./robot");
const ios_1 = require("./ios");
const png_1 = require("./png");
const image_utils_1 = require("./image-utils");
const mobilecli_1 = require("./mobilecli");
const mobile_device_1 = require("./mobile-device");
const utils_1 = require("./utils");
const ALLOWED_SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const ALLOWED_RECORDING_EXTENSIONS = [".mp4"];
const getAgentVersion = () => {
    const json = require("../package.json");
    return json.version;
};
exports.getAgentVersion = getAgentVersion;
const createMcpServer = () => {
    const server = new mcp_js_1.McpServer({
        name: "mobile-mcp",
        version: (0, exports.getAgentVersion)(),
    });
    const getClientName = () => {
        try {
            const clientInfo = server.server.getClientVersion();
            const clientName = clientInfo?.name || "unknown";
            return clientName;
        }
        catch (error) {
            return "unknown";
        }
    };
    const tool = (name, title, description, paramsSchema, annotations, cb) => {
        server.registerTool(name, {
            title,
            description,
            inputSchema: paramsSchema,
            annotations,
        }, (async (args, _extra) => {
            try {
                (0, logger_1.trace)(`Invoking ${name} with args: ${JSON.stringify(args)}`);
                const start = +new Date();
                const response = await cb(args);
                const duration = +new Date() - start;
                (0, logger_1.trace)(`=> ${response}`);
                posthog("tool_invoked", { "ToolName": name, "Duration": duration }).then();
                return {
                    content: [{ type: "text", text: response }],
                };
            }
            catch (error) {
                posthog("tool_failed", { "ToolName": name }).then();
                if (error instanceof robot_1.ActionableError) {
                    return {
                        content: [{ type: "text", text: `${error.message}. Please fix the issue and try again.` }],
                    };
                }
                else {
                    // a real exception
                    (0, logger_1.trace)(`Tool '${description}' failed: ${error.message} stack: ${error.stack}`);
                    return {
                        content: [{ type: "text", text: `Error: ${error.message}` }],
                        isError: true,
                    };
                }
            }
        }));
    };
    const posthog = async (event, properties) => {
        if (process.env.MOBILEMCP_DISABLE_TELEMETRY) {
            return;
        }
        try {
            const url = "https://us.i.posthog.com/i/v0/e/";
            const api_key = "phc_KHRTZmkDsU7A8EbydEK8s4lJpPoTDyyBhSlwer694cS";
            const name = node_os_1.default.hostname() + process.execPath;
            const distinct_id = node_crypto_1.default.createHash("sha256").update(name).digest("hex");
            const systemProps = {
                Platform: node_os_1.default.platform(),
                Product: "mobile-mcp",
                Version: (0, exports.getAgentVersion)(),
                NodeVersion: process.version,
            };
            const clientName = getClientName();
            if (clientName !== "unknown") {
                systemProps.AgentName = clientName;
            }
            await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    api_key,
                    event,
                    properties: {
                        ...systemProps,
                        ...properties,
                    },
                    distinct_id,
                })
            });
        }
        catch (err) {
            // ignore
        }
    };
    const mobilecli = new mobilecli_1.Mobilecli();
    const activeRecordings = new Map();
    posthog("launch", {}).then();
    const ensureMobilecliAvailable = () => {
        try {
            const version = mobilecli.getVersion();
            if (version.startsWith("failed")) {
                throw new Error("mobilecli version check failed");
            }
        }
        catch (error) {
            throw new robot_1.ActionableError(`mobilecli is not available or not working properly. Please review the documentation at https://github.com/mobile-next/mobile-mcp/wiki for installation instructions`);
        }
    };
    const getRobotFromDevice = (deviceId) => {
        // from now on, we must have mobilecli working
        ensureMobilecliAvailable();
        // Check if it's an iOS device
        const iosManager = new ios_1.IosManager();
        const iosDevices = iosManager.listDevices();
        const iosDevice = iosDevices.find(d => d.deviceId === deviceId);
        if (iosDevice) {
            return new ios_1.IosRobot(deviceId);
        }
        // Check if it's an Android device
        const androidManager = new android_1.AndroidDeviceManager();
        const androidDevices = androidManager.getConnectedDevices();
        const androidDevice = androidDevices.find(d => d.deviceId === deviceId);
        if (androidDevice) {
            return new android_1.AndroidRobot(deviceId);
        }
        // Check if it's a simulator (will later replace all other device types as well)
        const response = mobilecli.getDevices({
            platform: "ios",
            type: "simulator",
            includeOffline: false,
        });
        if (response.status === "ok" && response.data && response.data.devices) {
            for (const device of response.data.devices) {
                if (device.id === deviceId) {
                    return new mobile_device_1.MobileDevice(deviceId);
                }
            }
        }
        throw new robot_1.ActionableError(`Device "${deviceId}" not found. Use the mobile_list_available_devices tool to see available devices.`);
    };
    tool("mobile_list_available_devices", "List Devices", "List all available devices. This includes both physical mobile devices and mobile simulators and emulators. It returns both Android and iOS devices.", {}, { readOnlyHint: true }, async ({}) => {
        // from today onward, we must have mobilecli working
        ensureMobilecliAvailable();
        const iosManager = new ios_1.IosManager();
        const androidManager = new android_1.AndroidDeviceManager();
        const devices = [];
        // Get Android devices with details
        const androidDevices = androidManager.getConnectedDevicesWithDetails();
        for (const device of androidDevices) {
            devices.push({
                id: device.deviceId,
                name: device.name,
                platform: "android",
                type: "emulator",
                version: device.version,
                state: "online",
            });
        }
        // Get iOS physical devices with details
        try {
            const iosDevices = iosManager.listDevicesWithDetails();
            for (const device of iosDevices) {
                devices.push({
                    id: device.deviceId,
                    name: device.deviceName,
                    platform: "ios",
                    type: "real",
                    version: device.version,
                    state: "online",
                });
            }
        }
        catch (error) {
            // If go-ios is not available, silently skip
        }
        // Get iOS simulators from mobilecli (excluding offline devices)
        const response = mobilecli.getDevices({
            platform: "ios",
            type: "simulator",
            includeOffline: false,
        });
        if (response.status === "ok" && response.data && response.data.devices) {
            for (const device of response.data.devices) {
                devices.push({
                    id: device.id,
                    name: device.name,
                    platform: device.platform,
                    type: device.type,
                    version: device.version,
                    state: "online",
                });
            }
        }
        const out = { devices };
        return JSON.stringify(out);
    });
    if (process.env.MOBILEFLEET_ENABLE === "1") {
        tool("mobile_list_fleet_devices", "List Fleet Devices", "List devices available in the remote fleet", {}, { readOnlyHint: true }, async ({}) => {
            ensureMobilecliAvailable();
            const result = mobilecli.fleetListDevices();
            return result;
        });
        tool("mobile_allocate_fleet_device", "Allocate Fleet Device", "Reserve a device from the remote fleet", {
            platform: zod_1.z.enum(["ios", "android"]).describe("The platform to allocate a device for"),
        }, { destructiveHint: true }, async ({ platform }) => {
            ensureMobilecliAvailable();
            const result = mobilecli.fleetAllocate(platform);
            return result;
        });
        tool("mobile_release_fleet_device", "Release Fleet Device", "Release a device back to the remote fleet", {
            device: zod_1.z.string().describe("The device identifier to release back to the fleet"),
        }, { destructiveHint: true }, async ({ device }) => {
            ensureMobilecliAvailable();
            const result = mobilecli.fleetRelease(device);
            return result;
        });
    }
    tool("mobile_list_apps", "List Apps", "List all the installed apps on the device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
    }, { readOnlyHint: true }, async ({ device }) => {
        const robot = getRobotFromDevice(device);
        const result = await robot.listApps();
        return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
    });
    tool("mobile_launch_app", "Launch App", "Launch an app on mobile device. Use this to open a specific app. You can find the package name of the app by calling list_apps_on_device.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        packageName: zod_1.z.string().describe("The package name of the app to launch"),
        locale: zod_1.z.string().optional().describe("Comma-separated BCP 47 locale tags to launch the app with (e.g., fr-FR,en-GB)"),
    }, { destructiveHint: true }, async ({ device, packageName, locale }) => {
        const robot = getRobotFromDevice(device);
        await robot.launchApp(packageName, locale);
        return `Launched app ${packageName}`;
    });
    tool("mobile_terminate_app", "Terminate App", "Stop and terminate an app on mobile device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        packageName: zod_1.z.string().describe("The package name of the app to terminate"),
    }, { destructiveHint: true }, async ({ device, packageName }) => {
        const robot = getRobotFromDevice(device);
        await robot.terminateApp(packageName);
        return `Terminated app ${packageName}`;
    });
    tool("mobile_install_app", "Install App", "Install an app on mobile device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        path: zod_1.z.string().describe("The path to the app file to install. For iOS simulators, provide a .zip file or a .app directory. For Android provide an .apk file. For iOS real devices provide an .ipa file"),
    }, { destructiveHint: true }, async ({ device, path }) => {
        const robot = getRobotFromDevice(device);
        await robot.installApp(path);
        return `Installed app from ${path}`;
    });
    tool("mobile_uninstall_app", "Uninstall App", "Uninstall an app from mobile device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        bundle_id: zod_1.z.string().describe("Bundle identifier (iOS) or package name (Android) of the app to be uninstalled"),
    }, { destructiveHint: true }, async ({ device, bundle_id }) => {
        const robot = getRobotFromDevice(device);
        await robot.uninstallApp(bundle_id);
        return `Uninstalled app ${bundle_id}`;
    });
    tool("mobile_get_screen_size", "Get Screen Size", "Get the screen size of the mobile device in pixels", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
    }, { readOnlyHint: true }, async ({ device }) => {
        const robot = getRobotFromDevice(device);
        const screenSize = await robot.getScreenSize();
        return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
    });
    tool("mobile_click_on_screen_at_coordinates", "Click Screen", "Click on the screen at given x,y coordinates. If clicking on an element, use the list_elements_on_screen tool to find the coordinates.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        x: zod_1.z.coerce.number().describe("The x coordinate to click on the screen, in pixels"),
        y: zod_1.z.coerce.number().describe("The y coordinate to click on the screen, in pixels"),
    }, { destructiveHint: true }, async ({ device, x, y }) => {
        const robot = getRobotFromDevice(device);
        await robot.tap(x, y);
        return `Clicked on screen at coordinates: ${x}, ${y}`;
    });
    tool("mobile_batch_actions", "Batch Actions", "Execute multiple actions in rapid sequence. Much faster than individual tool calls. Each action has a type and parameters. Supported types: tap (x, y), type (text), press (button: BACK/HOME/ENTER/etc), swipe (direction, optional x/y/distance), wait (ms). Default 200ms delay between actions unless overridden with a wait action.", {
        device: zod_1.z.string().describe("The device identifier to use."),
        actions: zod_1.z.string().describe('JSON array of actions. Examples: [{"action":"tap","x":180,"y":1743},{"action":"type","text":"hello"},{"action":"wait","ms":1000},{"action":"press","button":"BACK"},{"action":"swipe","direction":"up"}]'),
    }, { destructiveHint: true }, async ({ device, actions }) => {
        const robot = getRobotFromDevice(device);
        const actionList = JSON.parse(actions);
        const results = [];
        for (let i = 0; i < actionList.length; i++) {
            const a = actionList[i];
            switch (a.action) {
                case "tap":
                    await robot.tap(a.x, a.y);
                    results.push(`tap(${a.x},${a.y})`);
                    break;
                case "type":
                    await robot.sendKeys(a.text);
                    results.push(`type("${a.text}")`);
                    break;
                case "press":
                    await robot.pressButton(a.button);
                    results.push(`press(${a.button})`);
                    break;
                case "swipe":
                    if (a.x !== undefined && a.y !== undefined) {
                        await robot.swipeFromCoordinate(a.x, a.y, a.direction, a.distance);
                    }
                    else {
                        await robot.swipe(a.direction);
                    }
                    results.push(`swipe(${a.direction})`);
                    break;
                case "wait":
                    await new Promise(r => setTimeout(r, a.ms));
                    results.push(`wait(${a.ms}ms)`);
                    continue; // skip default delay after wait
                default:
                    results.push(`unknown(${a.action})`);
                    continue;
            }
            // Default 200ms delay between actions (unless next is a wait)
            if (i < actionList.length - 1 && actionList[i + 1]?.action !== "wait") {
                await new Promise(r => setTimeout(r, 200));
            }
        }
        return `Executed ${actionList.length} actions: ${results.join(" → ")}`;
    });
    tool("mobile_double_tap_on_screen", "Double Tap Screen", "Double-tap on the screen at given x,y coordinates.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        x: zod_1.z.coerce.number().describe("The x coordinate to double-tap, in pixels"),
        y: zod_1.z.coerce.number().describe("The y coordinate to double-tap, in pixels"),
    }, { destructiveHint: true }, async ({ device, x, y }) => {
        const robot = getRobotFromDevice(device);
        await robot.doubleTap(x, y);
        return `Double-tapped on screen at coordinates: ${x}, ${y}`;
    });
    tool("mobile_long_press_on_screen_at_coordinates", "Long Press Screen", "Long press on the screen at given x,y coordinates. If long pressing on an element, use the list_elements_on_screen tool to find the coordinates.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        x: zod_1.z.coerce.number().describe("The x coordinate to long press on the screen, in pixels"),
        y: zod_1.z.coerce.number().describe("The y coordinate to long press on the screen, in pixels"),
        duration: zod_1.z.coerce.number().min(1).max(10000).optional().describe("Duration of the long press in milliseconds. Defaults to 500ms."),
    }, { destructiveHint: true }, async ({ device, x, y, duration }) => {
        const robot = getRobotFromDevice(device);
        const pressDuration = duration ?? 500;
        await robot.longPress(x, y, pressDuration);
        return `Long pressed on screen at coordinates: ${x}, ${y} for ${pressDuration}ms`;
    });
    tool("mobile_list_elements_on_screen", "List Screen Elements", "List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
    }, { readOnlyHint: true }, async ({ device }) => {
        const robot = getRobotFromDevice(device);
        const elements = await robot.getElementsOnScreen();
        // Categorize elements for LLM-friendly structured output
        const texts = [];
        const buttons = [];
        const inputs = [];
        const scrollables = [];
        let idx_t = 0, idx_b = 0, idx_i = 0, idx_s = 0;
        elements.forEach(element => {
            const cx = Math.round(element.rect.x + element.rect.width / 2);
            const cy = Math.round(element.rect.y + element.rect.height / 2);
            const w = element.rect.width;
            const h = element.rect.height;
            const displayText = element.text || element.label || element.name || "";
            const type = (element.type || "").toLowerCase();
            const isInput = type.includes("edittext") || type.includes("textfield") || type.includes("input") || element.password || element.editable;
            const isScrollable = type.includes("scroll") || type.includes("recycler") || type.includes("listview") || element.scrollable;
            const isButton = type.includes("button") || type.includes("imageview") || element.clickable;
            if (isInput) {
                idx_i++;
                const pwdTag = element.password ? " [PASSWORD]" : "";
                const focusTag = element.focused ? " ** FOCUSED" : "";
                inputs.push(`  ${idx_i}. Value: "${element.value || "Empty"}" | Hint: "${displayText}" at center (${cx}, ${cy}) [size ${w}x${h}]${pwdTag}${focusTag}${element.identifier ? "\n     ID: " + element.identifier : ""}`);
            }
            else if (isScrollable) {
                idx_s++;
                scrollables.push(`  ${idx_s}. "${displayText || "Scrollable area"}" at center (${cx}, ${cy}) [size ${w}x${h}]`);
            }
            else if (isButton && !isInput && !isScrollable) {
                idx_b++;
                buttons.push(`  ${idx_b}. "${displayText || "Unlabeled button"}" at center (${cx}, ${cy}) [size ${w}x${h}]${element.identifier ? "\n     ID: " + element.identifier : ""}\n     CLASS: ${element.type || "unknown"}${element.focused ? "\n     ** FOCUSED" : ""}`);
            }
            else if (displayText) {
                idx_t++;
                texts.push(`  ${idx_t}. "${displayText}" at center (${cx}, ${cy}) [size ${w}x${h}]${element.identifier ? "\n     ID: " + element.identifier : ""}`);
            }
        });
        let output = "=== UI ELEMENTS ANALYSIS ===\n\n";
        output += `TEXTS:\n${texts.length ? texts.join("\n") : "  (none)"}\n\n`;
        output += `BUTTONS/CLICKABLES:\n${buttons.length ? buttons.join("\n") : "  (none)"}\n\n`;
        output += `INPUT FIELDS:\n${inputs.length ? inputs.join("\n") : "  (none)"}\n\n`;
        output += `SCROLLABLE AREAS:\n${scrollables.length ? scrollables.join("\n") : "  (none)"}\n\n`;
        output += `SUMMARY: ${elements.length} total elements (${idx_t} texts, ${idx_b} buttons, ${idx_i} inputs, ${idx_s} scrollables)`;
        return output;
    });
    tool("mobile_press_button", "Press Button", "Press a button on device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        button: zod_1.z.string().describe("The button to press. Supported buttons: BACK (android only), HOME, VOLUME_UP, VOLUME_DOWN, ENTER, DPAD_CENTER (android tv only), DPAD_UP (android tv only), DPAD_DOWN (android tv only), DPAD_LEFT (android tv only), DPAD_RIGHT (android tv only)"),
    }, { destructiveHint: true }, async ({ device, button }) => {
        const robot = getRobotFromDevice(device);
        await robot.pressButton(button);
        return `Pressed the button: ${button}`;
    });
    tool("mobile_open_url", "Open URL", "Open a URL in browser on device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        url: zod_1.z.string().describe("The URL to open"),
    }, { destructiveHint: true }, async ({ device, url }) => {
        const allowUnsafeUrls = process.env.MOBILEMCP_ALLOW_UNSAFE_URLS === "1";
        if (!allowUnsafeUrls && !url.startsWith("http://") && !url.startsWith("https://")) {
            throw new robot_1.ActionableError("Only http:// and https:// URLs are allowed. Set MOBILEMCP_ALLOW_UNSAFE_URLS=1 to allow other URL schemes.");
        }
        const robot = getRobotFromDevice(device);
        await robot.openUrl(url);
        return `Opened URL: ${url}`;
    });
    tool("mobile_swipe_on_screen", "Swipe Screen", "Swipe on the screen", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        direction: zod_1.z.enum(["up", "down", "left", "right"]).describe("The direction to swipe"),
        x: zod_1.z.coerce.number().optional().describe("The x coordinate to start the swipe from, in pixels. If not provided, uses center of screen"),
        y: zod_1.z.coerce.number().optional().describe("The y coordinate to start the swipe from, in pixels. If not provided, uses center of screen"),
        distance: zod_1.z.coerce.number().optional().describe("The distance to swipe in pixels. Defaults to 400 pixels for iOS or 30% of screen dimension for Android"),
    }, { destructiveHint: true }, async ({ device, direction, x, y, distance }) => {
        const robot = getRobotFromDevice(device);
        if (x !== undefined && y !== undefined) {
            // Use coordinate-based swipe
            await robot.swipeFromCoordinate(x, y, direction, distance);
            const distanceText = distance ? ` ${distance} pixels` : "";
            return `Swiped ${direction}${distanceText} from coordinates: ${x}, ${y}`;
        }
        else {
            // Use center-based swipe
            await robot.swipe(direction);
            return `Swiped ${direction} on screen`;
        }
    });
    tool("mobile_type_keys", "Type Text", "Type text into the focused element", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        text: zod_1.z.string().describe("The text to type"),
        submit: zod_1.z.boolean().describe("Whether to submit the text. If true, the text will be submitted as if the user pressed the enter key."),
    }, { destructiveHint: true }, async ({ device, text, submit }) => {
        const robot = getRobotFromDevice(device);
        await robot.sendKeys(text);
        if (submit) {
            await robot.pressButton("ENTER");
        }
        return `Typed text: ${text}`;
    });
    tool("mobile_save_screenshot", "Save Screenshot", "Save a screenshot of the mobile device to a file", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        saveTo: zod_1.z.string().describe("The path to save the screenshot to. Filename must end with .png, .jpg, or .jpeg"),
    }, { destructiveHint: true }, async ({ device, saveTo }) => {
        (0, utils_1.validateFileExtension)(saveTo, ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot");
        (0, utils_1.validateOutputPath)(saveTo);
        const robot = getRobotFromDevice(device);
        const screenshot = await robot.getScreenshot();
        node_fs_1.default.writeFileSync(saveTo, screenshot);
        return `Screenshot saved to: ${saveTo}`;
    });
    server.registerTool("mobile_take_screenshot", {
        title: "Take Screenshot",
        description: "Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
        inputSchema: {
            device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
        },
        annotations: {
            readOnlyHint: true,
        },
    }, async ({ device }) => {
        try {
            const robot = getRobotFromDevice(device);
            const screenSize = await robot.getScreenSize();
            let screenshot = await robot.getScreenshot();
            let mimeType = "image/png";
            // validate we received a png, will throw exception otherwise
            const image = new png_1.PNG(screenshot);
            const pngSize = image.getDimensions();
            if (pngSize.width <= 0 || pngSize.height <= 0) {
                throw new robot_1.ActionableError("Screenshot is invalid. Please try again.");
            }
            if ((0, image_utils_1.isScalingAvailable)()) {
                (0, logger_1.trace)("Image scaling is available, resizing screenshot");
                const image = image_utils_1.Image.fromBuffer(screenshot);
                const beforeSize = screenshot.length;
                screenshot = image.resize(Math.floor(pngSize.width / screenSize.scale))
                    .jpeg({ quality: 75 })
                    .toBuffer();
                const afterSize = screenshot.length;
                (0, logger_1.trace)(`Screenshot resized from ${beforeSize} bytes to ${afterSize} bytes`);
                mimeType = "image/jpeg";
            }
            const screenshot64 = screenshot.toString("base64");
            (0, logger_1.trace)(`Screenshot taken: ${screenshot.length} bytes`);
            posthog("tool_invoked", {
                "ToolName": "mobile_take_screenshot",
                "ScreenshotFilesize": screenshot64.length,
                "ScreenshotMimeType": mimeType,
                "ScreenshotWidth": pngSize.width,
                "ScreenshotHeight": pngSize.height,
            }).then();
            return {
                content: [{ type: "image", data: screenshot64, mimeType }]
            };
        }
        catch (err) {
            (0, logger_1.error)(`Error taking screenshot: ${err.message} ${err.stack}`);
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    });
    tool("mobile_set_orientation", "Set Orientation", "Change the screen orientation of the device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        orientation: zod_1.z.enum(["portrait", "landscape"]).describe("The desired orientation"),
    }, { destructiveHint: true }, async ({ device, orientation }) => {
        const robot = getRobotFromDevice(device);
        await robot.setOrientation(orientation);
        return `Changed device orientation to ${orientation}`;
    });
    tool("mobile_get_orientation", "Get Orientation", "Get the current screen orientation of the device", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
    }, { readOnlyHint: true }, async ({ device }) => {
        const robot = getRobotFromDevice(device);
        const orientation = await robot.getOrientation();
        return `Current device orientation is ${orientation}`;
    });
    tool("mobile_start_screen_recording", "Start Screen Recording", "Start recording the screen of a mobile device. The recording runs in the background until stopped with mobile_stop_screen_recording. Returns the path where the recording will be saved.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
        output: zod_1.z.string().optional().describe("The file path to save the recording to. Filename must end with .mp4. If not provided, a temporary path will be used."),
        timeLimit: zod_1.z.coerce.number().optional().describe("Maximum recording duration in seconds. The recording will stop automatically after this time."),
    }, { destructiveHint: true }, async ({ device, output, timeLimit }) => {
        if (output) {
            (0, utils_1.validateFileExtension)(output, ALLOWED_RECORDING_EXTENSIONS, "start_screen_recording");
            (0, utils_1.validateOutputPath)(output);
        }
        getRobotFromDevice(device);
        if (activeRecordings.has(device)) {
            throw new robot_1.ActionableError(`Device "${device}" is already being recorded. Stop the current recording first with mobile_stop_screen_recording.`);
        }
        const outputPath = output || node_path_1.default.join(node_os_1.default.tmpdir(), `screen-recording-${Date.now()}.mp4`);
        const args = ["screenrecord", "--device", device, "--output", outputPath, "--silent"];
        if (timeLimit !== undefined) {
            args.push("--time-limit", String(timeLimit));
        }
        const child = mobilecli.spawnCommand(args);
        const cleanup = () => {
            activeRecordings.delete(device);
        };
        child.on("error", cleanup);
        child.on("exit", cleanup);
        activeRecordings.set(device, {
            process: child,
            outputPath,
            startedAt: Date.now(),
        });
        return `Screen recording started. Output will be saved to: ${outputPath}`;
    });
    tool("mobile_stop_screen_recording", "Stop Screen Recording", "Stop an active screen recording on a mobile device. Returns the file path, size, and approximate duration of the recording.", {
        device: zod_1.z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
    }, { destructiveHint: true }, async ({ device }) => {
        const recording = activeRecordings.get(device);
        if (!recording) {
            throw new robot_1.ActionableError(`No active recording found for device "${device}". Start a recording first with mobile_start_screen_recording.`);
        }
        const { process: child, outputPath, startedAt } = recording;
        activeRecordings.delete(device);
        child.kill("SIGINT");
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                child.kill("SIGKILL");
                resolve();
            }, 5 * 60 * 1000);
            child.on("close", () => {
                clearTimeout(timeout);
                resolve();
            });
        });
        const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
        if (!node_fs_1.default.existsSync(outputPath)) {
            return `Recording stopped after ~${durationSeconds}s but the output file was not found at: ${outputPath}`;
        }
        const stats = node_fs_1.default.statSync(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        return `Recording stopped. File: ${outputPath} (${fileSizeMB} MB, ~${durationSeconds}s)`;
    });
    return server;
};
exports.createMcpServer = createMcpServer;
