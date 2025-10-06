import os from "node:os";
import crypto from "node:crypto";

const getAgentVersion = (): string => {
	const json = require("../package.json");
	return json.version;
};

export const posthog = async (event: string, properties: Record<string, string>) => {
	try {
		const url = "https://us.i.posthog.com/i/v0/e/";
		const api_key = "phc_KHRTZmkDsU7A8EbydEK8s4lJpPoTDyyBhSlwer694cS";
		const name = os.hostname() + process.execPath;
		const distinct_id = crypto.createHash("sha256").update(name).digest("hex");
		const systemProps = {
			Platform: os.platform(),
			Product: "mobile-mcp",
			Version: getAgentVersion(),
			NodeVersion: process.version,
		};

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
	} catch (err: any) {
		// ignore
	}
};
