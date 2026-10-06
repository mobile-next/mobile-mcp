import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

// no device is attached under this id, so a url that passes the scheme check fails on the device lookup
const MISSING_DEVICE = "no-such-device";

const SCHEME_REJECTION = "Only http:// and https:// URLs are allowed";

const createConnectedClient = async (): Promise<Client> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	delete process.env.MOBILEMCP_ALLOW_UNSAFE_URLS;
	const server = createMcpServer();
	const client = new Client({ name: "open-url-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const openUrl = async (url: string): Promise<string> => {
	const client = await createConnectedClient();
	const result: any = await client.callTool({ name: "mobile_open_url", arguments: { device: MISSING_DEVICE, url } });
	return result.content[0].text;
};

const schemeWasAccepted = (text: string): boolean => !text.includes(SCHEME_REJECTION) && text.includes(`Device "${MISSING_DEVICE}" not found`);

const schemeWasRejected = (text: string): boolean => text.includes(SCHEME_REJECTION);

// url schemes are case-insensitive (RFC 3986 section 3.1)
for (const url of ["https://example.com", "http://example.com", "HTTPS://EXAMPLE.COM", "Http://example.com/Path"]) {
	test(`accepts ${url}`, async () => {
		expect(schemeWasAccepted(await openUrl(url))).toBe(true);
	});
}

for (const url of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "file:///etc/hosts", "httpx://example.com", "example.com", "-h"]) {
	test(`rejects ${url}`, async () => {
		expect(schemeWasRejected(await openUrl(url))).toBe(true);
	});
}
