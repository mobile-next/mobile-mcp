import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

const createConnectedClient = async () => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "errors-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

// a batch step naming an unknown tool makes the batch tool throw an ActionableError, no device needed
const callToolThatThrowsActionableError = async (client: Client): Promise<any> => {
	return client.callTool({
		name: "mobile_batch_commands",
		arguments: { device: "nope", steps: [{ name: "mobile_does_not_exist", arguments: {} }] },
	});
};

// regression test for #489: a failed tool call must not look like a success to the client
test("reports an ActionableError as a tool error", async () => {
	const client = await createConnectedClient();
	const result = await callToolThatThrowsActionableError(client);

	expect(result.isError).toBe(true);
	expect(result.content[0].text).toBe("Unknown tool in step 1: mobile_does_not_exist. Please fix the issue and try again.");
});
