import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import ts from "typescript";

import {
	DeviceLeaseStore,
	LeaseCandidate,
	LeaseError,
	LeaseUnavailableError,
	DEFAULT_LEASE_TTL_SECONDS,
	MAX_LEASE_TTL_SECONDS,
	clampTtlSeconds,
	redactLeaseHandles,
} from "../src/device-leases";

// These tests exercise the lease store on its own, so they need no device.

const pixel: LeaseCandidate = { id: "emulator-5554", name: "Pixel 9", platform: "android", type: "emulator" };
const iphone: LeaseCandidate = { id: "A1B2C3", name: "iPhone 17", platform: "ios", type: "simulator" };

const temporaryStateDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "mobile-mcp-leases-test-"));

// a clock the test moves by hand, so expiry needs no sleeping
const fakeClock = (start = Date.UTC(2026, 9, 27, 12, 0, 0)) => {
	let now = start;
	return {
		now: () => now,
		advance: (seconds: number) => {
			now += seconds * 1000;
		},
	};
};

const deadPid = (): number => {
	const child = spawnSync(process.execPath, ["-e", ""]);
	return child.pid!;
};

test.describe("device leases", () => {

	test("leases a free device and resolves its handle to the device id", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		const { handle, lease } = await store.acquire([pixel], "agent-a");

		expect(handle).toMatch(/^lease:[A-Za-z0-9_-]{32}$/);
		expect(lease).toMatchObject({ device: "emulator-5554", deviceName: "Pixel 9", platform: "android", type: "emulator", holder: "agent-a", ttlSeconds: DEFAULT_LEASE_TTL_SECONDS });
		expect(await store.resolve(handle)).toBe("emulator-5554");
	});

	test("never writes the token to disk and keeps the file private", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		const { handle } = await store.acquire([pixel], "agent-a");
		const contents = fs.readFileSync(store.leaseFilePath, "utf8");

		expect(contents).toContain("emulator-5554");
		expect(contents).not.toContain(handle.slice("lease:".length));
		if (process.platform !== "win32") {
			expect(fs.statSync(store.leaseFilePath).mode & 0o777).toBe(0o600);
		}
	});

	test("lets an unleased device through untouched, without creating any file", async () => {
		const dir = temporaryStateDir();
		const store = new DeviceLeaseStore({ dir });

		expect(await store.resolve("emulator-5554")).toBe("emulator-5554");
		expect(fs.readdirSync(dir)).toEqual([]);
	});

	test("refuses the raw id of a leased device, naming the holder and expiry", async () => {
		const clock = fakeClock();
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), now: clock.now });
		await store.acquire([pixel], "agent-a", 120);

		const refusal = store.resolve("emulator-5554");
		await expect(refusal).rejects.toThrow(LeaseError);
		await expect(refusal).rejects.toThrow(/leased by "agent-a" until 2026-10-27T12:02:00.000Z \(expires in 120s\)/);
		expect(await store.resolve("A1B2C3")).toBe("A1B2C3");
	});

	test("refuses a second lease on the same device", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		await store.acquire([pixel], "agent-a");

		const conflict = store.acquire([pixel], "agent-b");
		await expect(conflict).rejects.toThrow(LeaseUnavailableError);
		await expect(conflict).rejects.toThrow(/"emulator-5554" leased by "agent-a"/);
	});

	test("hands out the next free candidate", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		const first = await store.acquire([pixel, iphone], "agent-a");
		const second = await store.acquire([pixel, iphone], "agent-b");

		expect(first.lease.device).toBe("emulator-5554");
		expect(second.lease.device).toBe("A1B2C3");
		expect((await store.list()).map(lease => lease.holder).sort()).toEqual(["agent-a", "agent-b"]);
	});

	test("does not accept another agent's handle for a different device, or a made-up one", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		await store.acquire([pixel], "agent-a");

		await expect(store.resolve("lease:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).rejects.toThrow(/unknown, released or expired/);
		await expect(store.resolve("lease:short")).rejects.toThrow(/not a lease handle/);
	});

	test("frees a lease that goes unused past its ttl", async () => {
		const clock = fakeClock();
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), now: clock.now });
		const { handle } = await store.acquire([pixel], "agent-a", 60);

		clock.advance(61);

		expect(await store.list()).toEqual([]);
		expect(await store.resolve("emulator-5554")).toBe("emulator-5554");
		await expect(store.resolve(handle)).rejects.toThrow(/unknown, released or expired/);
		const next = await store.acquire([pixel], "agent-b");
		expect(next.lease.holder).toBe("agent-b");
	});

	test("renews the lease every time its handle is used", async () => {
		const clock = fakeClock();
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), now: clock.now });
		const { handle } = await store.acquire([pixel], "agent-a", 60);

		clock.advance(45);
		await store.resolve(handle);
		clock.advance(45);

		expect(await store.resolve(handle)).toBe("emulator-5554");
		expect((await store.list())[0].expiresAt).toBe(clock.now() + 60_000);
	});

	test("renews explicitly, optionally with a new ttl", async () => {
		const clock = fakeClock();
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), now: clock.now });
		const { handle } = await store.acquire([pixel], "agent-a", 60);

		clock.advance(30);
		const renewed = await store.renew(handle);
		expect(renewed.expiresAt).toBe(clock.now() + 60_000);

		const longer = await store.renew(handle, 900);
		expect(longer.ttlSeconds).toBe(900);
		expect(longer.expiresAt).toBe(clock.now() + 900_000);
	});

	test("releases a lease and removes the file once no lease is left", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		const { handle } = await store.acquire([pixel], "agent-a");

		const released = await store.release(handle);

		expect(released.device).toBe("emulator-5554");
		expect(fs.existsSync(store.leaseFilePath)).toBe(false);
		expect(await store.resolve("emulator-5554")).toBe("emulator-5554");
		await expect(store.release(handle)).rejects.toThrow(/unknown, released or expired/);
	});

	test("keeps the ttl between one second and the maximum", () => {
		expect(clampTtlSeconds(undefined)).toBe(DEFAULT_LEASE_TTL_SECONDS);
		expect(clampTtlSeconds(0)).toBe(1);
		expect(clampTtlSeconds(10 * MAX_LEASE_TTL_SECONDS)).toBe(MAX_LEASE_TTL_SECONDS);
	});

	test("redacts lease handles in log lines", () => {
		const line = redactLeaseHandles(`Invoking mobile_list_apps with args: {"device":"lease:AbCdEfGhIjKlMnOpQrStUvWxYz012345"}`);

		expect(line).toBe(`Invoking mobile_list_apps with args: {"device":"lease:AbCd…"}`);
	});

	test("ignores a damaged lease file", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir() });
		fs.writeFileSync(store.leaseFilePath, "{ not json");

		expect(await store.list()).toEqual([]);
		const { lease } = await store.acquire([pixel], "agent-a");
		expect(lease.device).toBe("emulator-5554");
	});
});

test.describe("device lease lock", () => {

	test("recovers a lock left behind by a process that died", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), lockTimeoutMs: 2000 });
		fs.writeFileSync(store.lockFilePath, JSON.stringify({ pid: deadPid(), hostname: os.hostname(), nonce: "dead", createdAt: Date.now() }));

		const { lease } = await store.acquire([pixel], "agent-a");

		expect(lease.device).toBe("emulator-5554");
		expect(fs.existsSync(store.lockFilePath)).toBe(false);
	});

	test("recovers a lock older than the stale threshold, even from another host", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), staleLockMs: 1000, lockTimeoutMs: 2000 });
		fs.writeFileSync(store.lockFilePath, JSON.stringify({ pid: 1, hostname: "elsewhere", nonce: "old", createdAt: Date.now() - 5000 }));

		const { lease } = await store.acquire([pixel], "agent-a");

		expect(lease.device).toBe("emulator-5554");
	});

	test("recovers an empty lock file once it is old enough", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), staleLockMs: 1000, lockTimeoutMs: 2000 });
		fs.writeFileSync(store.lockFilePath, "");
		const old = new Date(Date.now() - 5000);
		fs.utimesSync(store.lockFilePath, old, old);

		const { lease } = await store.acquire([pixel], "agent-a");

		expect(lease.device).toBe("emulator-5554");
	});

	test("waits for a live lock and gives up with a clear error", async () => {
		const store = new DeviceLeaseStore({ dir: temporaryStateDir(), lockTimeoutMs: 200 });
		fs.writeFileSync(store.lockFilePath, JSON.stringify({ pid: process.pid, hostname: os.hostname(), nonce: "live", createdAt: Date.now() }));

		await expect(store.acquire([pixel], "agent-a")).rejects.toThrow(/Timed out waiting for the device lease lock/);
		expect(JSON.parse(fs.readFileSync(store.lockFilePath, "utf8")).nonce).toBe("live");
	});

	test("gives a device to exactly one of many concurrent store instances", async () => {
		const dir = temporaryStateDir();
		const attempts = Array.from({ length: 20 }, (_, i) => new DeviceLeaseStore({ dir }).acquire([pixel], `agent-${i}`));

		const results = await Promise.allSettled(attempts);

		expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter(result => result.status === "rejected" && result.reason instanceof LeaseUnavailableError)).toHaveLength(19);
		expect(await new DeviceLeaseStore({ dir }).list()).toHaveLength(1);
	});

	test("gives each device to exactly one of several processes", async () => {
		const dir = temporaryStateDir();

		// the store has no imports outside node, so a transpiled copy runs in a plain node child
		const source = fs.readFileSync(path.join(__dirname, "..", "src", "device-leases.ts"), "utf8");
		const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
		const modulePath = path.join(dir, "device-leases.js");
		fs.writeFileSync(modulePath, compiled.outputText);

		const devices = [pixel, iphone, { id: "R5CT", name: "Galaxy S25", platform: "android", type: "real" }];
		const script = `
			const { DeviceLeaseStore } = require(${JSON.stringify(modulePath)});
			const store = new DeviceLeaseStore({ dir: ${JSON.stringify(dir)} });
			store.acquire(${JSON.stringify(devices)}, "process-" + process.pid)
				.then(result => console.log(JSON.stringify({ device: result.lease.device })))
				.catch(err => console.log(JSON.stringify({ error: err.name })));
		`;

		const runChild = () => new Promise<any>((resolve, reject) => {
			const child = spawn(process.execPath, ["-e", script]);
			let output = "";
			child.stdout.on("data", chunk => {
				output += chunk;
			});
			child.on("error", reject);
			child.on("exit", () => resolve(JSON.parse(output.trim())));
		});

		const results = await Promise.all(Array.from({ length: 8 }, runChild));

		const leased = results.filter(result => result.device).map(result => result.device).sort();
		expect(leased).toEqual(devices.map(device => device.id).sort());
		expect(results.filter(result => result.error === "LeaseUnavailableError")).toHaveLength(5);
		expect(fs.existsSync(path.join(dir, "leases.lock"))).toBe(false);
	});
});
