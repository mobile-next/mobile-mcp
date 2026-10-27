import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Local device leasing lets several agents (several stdio mobile-mcp processes,
// or many clients of one --listen server) share the devices plugged into one
// machine without driving the same device at once. Leases live in a small JSON
// file guarded by an O_EXCL lock file, so every process on the machine sees the
// same state. The server is stateless, so a lease is identified by a random
// token that the agent passes back as the device argument ("lease:<token>").

export const LEASE_HANDLE_PREFIX = "lease:";
export const DEFAULT_LEASE_TTL_SECONDS = 600;
export const MAX_LEASE_TTL_SECONDS = 3600;

const LEASE_FILE = "leases.json";
const LOCK_FILE = "leases.lock";
const DEFAULT_STALE_LOCK_MS = 10_000;
const DEFAULT_LOCK_TIMEOUT_MS = 15_000;

export interface LeaseCandidate {
	id: string;
	name: string;
	platform: string;
	type: string;
}

export interface LeaseInfo {
	// public id, safe to show to other agents. it can not be used to act on the device.
	leaseId: string;
	device: string;
	deviceName: string;
	platform: string;
	type: string;
	holder: string;
	ttlSeconds: number;
	acquiredAt: number;
	expiresAt: number;
}

interface StoredLease extends LeaseInfo {
	// sha256 of the token, the token itself is never written to disk
	tokenHash: string;
}

interface LeaseFileContents {
	version: 1;
	leases: StoredLease[];
}

interface LockOwner {
	pid: number;
	hostname: string;
	nonce: string;
	createdAt: number;
}

export interface AcquiredLease {
	handle: string;
	lease: LeaseInfo;
}

export class LeaseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LeaseError";
	}
}

// thrown when every matching device is leased by someone else
export class LeaseUnavailableError extends LeaseError {
	constructor(message: string, public readonly holders: LeaseInfo[]) {
		super(message);
		this.name = "LeaseUnavailableError";
	}
}

export interface DeviceLeaseStoreOptions {
	dir?: string;
	now?: () => number;
	staleLockMs?: number;
	lockTimeoutMs?: number;
}

export const defaultLeaseStateDir = (): string => {
	if (process.env.MOBILEMCP_STATE_DIR) {
		return process.env.MOBILEMCP_STATE_DIR;
	}

	if (process.platform === "win32" && process.env.LOCALAPPDATA) {
		return path.join(process.env.LOCALAPPDATA, "mobile-mcp");
	}

	const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
	return path.join(stateHome, "mobile-mcp");
};

export const isLeaseHandle = (device: string): boolean => device.startsWith(LEASE_HANDLE_PREFIX);

// keeps the first characters of a token so logs stay readable, never the whole secret
export const redactLeaseHandles = (text: string): string =>
	text.replace(/lease:([A-Za-z0-9_-]{4})[A-Za-z0-9_-]*/g, "lease:$1…");

const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

const tokenFromHandle = (handle: string): string => {
	const token = isLeaseHandle(handle) ? handle.slice(LEASE_HANDLE_PREFIX.length) : handle;
	if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) {
		throw new LeaseError(`"${redactLeaseHandles(handle)}" is not a lease handle. Pass the handle returned by mobile_lease_device, e.g. "lease:..."`);
	}

	return token;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: any) {
		// EPERM means the process exists but belongs to someone else
		return err.code === "EPERM";
	}
};

export const clampTtlSeconds = (ttlSeconds?: number): number => {
	if (ttlSeconds === undefined) {
		return DEFAULT_LEASE_TTL_SECONDS;
	}

	return Math.min(Math.max(Math.round(ttlSeconds), 1), MAX_LEASE_TTL_SECONDS);
};

export const describeLease = (lease: LeaseInfo, now: number): string => {
	const seconds = Math.max(0, Math.ceil((lease.expiresAt - now) / 1000));
	return `leased by "${lease.holder}" until ${new Date(lease.expiresAt).toISOString()} (expires in ${seconds}s)`;
};

const publicInfo = (lease: StoredLease): LeaseInfo => ({
	leaseId: lease.leaseId,
	device: lease.device,
	deviceName: lease.deviceName,
	platform: lease.platform,
	type: lease.type,
	holder: lease.holder,
	ttlSeconds: lease.ttlSeconds,
	acquiredAt: lease.acquiredAt,
	expiresAt: lease.expiresAt,
});

export class DeviceLeaseStore {
	private readonly dir: string;
	private readonly now: () => number;
	private readonly staleLockMs: number;
	private readonly lockTimeoutMs: number;

	constructor(options: DeviceLeaseStoreOptions = {}) {
		this.dir = options.dir ?? defaultLeaseStateDir();
		this.now = options.now ?? Date.now;
		this.staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
		this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
	}

	get leaseFilePath(): string {
		return path.join(this.dir, LEASE_FILE);
	}

	get lockFilePath(): string {
		return path.join(this.dir, LOCK_FILE);
	}

	// active leases, read without the lock: the file is only ever replaced by rename, so a read is never torn
	async list(): Promise<LeaseInfo[]> {
		const contents = await this.read();
		const now = this.now();
		return contents.leases.filter(lease => lease.expiresAt > now).map(publicInfo);
	}

	// leases the first candidate nobody else holds. candidates are tried in order.
	async acquire(candidates: LeaseCandidate[], holder: string, ttlSeconds?: number): Promise<AcquiredLease> {
		const ttl = clampTtlSeconds(ttlSeconds);
		return this.update(leases => {
			const now = this.now();
			const busy = new Map(leases.map(lease => [lease.device, lease]));
			const free = candidates.find(candidate => !busy.has(candidate.id));
			if (!free) {
				const holders = candidates.map(candidate => busy.get(candidate.id)!).map(publicInfo);
				throw new LeaseUnavailableError(
					`Every matching device is leased: ${holders.map(lease => `"${lease.device}" ${describeLease(lease, now)}`).join("; ")}`,
					holders);
			}

			const token = crypto.randomBytes(24).toString("base64url");
			const lease: StoredLease = {
				leaseId: crypto.randomBytes(4).toString("hex"),
				device: free.id,
				deviceName: free.name,
				platform: free.platform,
				type: free.type,
				holder,
				ttlSeconds: ttl,
				acquiredAt: now,
				expiresAt: now + ttl * 1000,
				tokenHash: hashToken(token),
			};

			leases.push(lease);
			return { result: { handle: LEASE_HANDLE_PREFIX + token, lease: publicInfo(lease) }, changed: true };
		});
	}

	// extends the lease by its ttl (or a new one) from now
	async renew(handle: string, ttlSeconds?: number): Promise<LeaseInfo> {
		const tokenHash = hashToken(tokenFromHandle(handle));
		return this.update(leases => {
			const lease = this.findOwned(leases, tokenHash);
			if (ttlSeconds !== undefined) {
				lease.ttlSeconds = clampTtlSeconds(ttlSeconds);
			}

			lease.expiresAt = this.now() + lease.ttlSeconds * 1000;
			return { result: publicInfo(lease), changed: true };
		});
	}

	async release(handle: string): Promise<LeaseInfo> {
		const tokenHash = hashToken(tokenFromHandle(handle));
		return this.update(leases => {
			const lease = this.findOwned(leases, tokenHash);
			leases.splice(leases.indexOf(lease), 1);
			return { result: publicInfo(lease), changed: true };
		});
	}

	// maps the device argument of a tool call to a device id.
	// a lease handle resolves to its device and renews the lease; a raw id passes
	// through unless someone holds a lease on that device.
	async resolve(device: string): Promise<string> {
		if (!isLeaseHandle(device)) {
			// fast path, no lock: unleased devices behave exactly as without leasing
			const now = this.now();
			const lease = (await this.read()).leases.find(candidate => candidate.device === device && candidate.expiresAt > now);
			if (lease) {
				throw new LeaseError(
					`Device "${device}" is ${describeLease(lease, now)}. ` +
					`Pass your own lease handle from mobile_lease_device as the device, wait until the lease is released or expires, or pick another device from mobile_list_available_devices`);
			}

			return device;
		}

		const tokenHash = hashToken(tokenFromHandle(device));
		return this.update(leases => {
			const lease = this.findOwned(leases, tokenHash);
			const expiresAt = this.now() + lease.ttlSeconds * 1000;
			// renew on use, but skip the write when it would extend by less than a second
			const changed = expiresAt - lease.expiresAt >= 1000;
			if (changed) {
				lease.expiresAt = expiresAt;
			}

			return { result: lease.device, changed };
		});
	}

	private findOwned(leases: StoredLease[], tokenHash: string): StoredLease {
		const lease = leases.find(candidate => candidate.tokenHash === tokenHash);
		if (!lease) {
			throw new LeaseError("This lease is unknown, released or expired. Call mobile_lease_device to lease a device again");
		}

		return lease;
	}

	private async read(): Promise<LeaseFileContents> {
		let raw: string;
		try {
			raw = await fs.promises.readFile(this.leaseFilePath, "utf8");
		} catch (err: any) {
			if (err.code === "ENOENT") {
				return { version: 1, leases: [] };
			}

			throw err;
		}

		try {
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.leases)) {
				return { version: 1, leases: parsed.leases };
			}
		} catch (err: any) {
			// a damaged file holds no usable lease, the next write replaces it
		}

		return { version: 1, leases: [] };
	}

	private async write(leases: StoredLease[]): Promise<void> {
		if (leases.length === 0) {
			// no file means no leases, which keeps the unleased path a single failed read
			await fs.promises.rm(this.leaseFilePath, { force: true });
			return;
		}

		const contents: LeaseFileContents = { version: 1, leases };
		const temporary = `${this.leaseFilePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
		await fs.promises.writeFile(temporary, JSON.stringify(contents, null, "\t") + "\n", { mode: 0o600, flag: "wx" });
		try {
			await fs.promises.rename(temporary, this.leaseFilePath);
		} catch (err: any) {
			await fs.promises.rm(temporary, { force: true });
			throw err;
		}
	}

	// read-modify-write under the lock. expired leases are dropped on every update.
	private async update<T>(mutate: (leases: StoredLease[]) => { result: T; changed: boolean }): Promise<T> {
		const nonce = await this.lock();
		try {
			const now = this.now();
			const contents = await this.read();
			const leases = contents.leases.filter(lease => lease.expiresAt > now);
			const pruned = leases.length !== contents.leases.length;
			const { result, changed } = mutate(leases);
			if (changed || pruned) {
				await this.write(leases);
			}

			return result;
		} finally {
			await this.unlock(nonce);
		}
	}

	private async lock(): Promise<string> {
		await fs.promises.mkdir(this.dir, { recursive: true, mode: 0o700 });
		const owner: LockOwner = {
			pid: process.pid,
			hostname: os.hostname(),
			nonce: crypto.randomBytes(8).toString("hex"),
			// lock ages use the real clock, lease expiry uses the injectable one
			createdAt: Date.now(),
		};

		const deadline = Date.now() + this.lockTimeoutMs;
		for (;;) {
			try {
				const handle = await fs.promises.open(this.lockFilePath, "wx", 0o600);
				try {
					await handle.writeFile(JSON.stringify(owner));
				} finally {
					await handle.close();
				}

				return owner.nonce;
			} catch (err: any) {
				if (err.code !== "EEXIST") {
					throw err;
				}
			}

			await this.breakLockIfStale();
			if (Date.now() > deadline) {
				throw new LeaseError(`Timed out waiting for the device lease lock ${this.lockFilePath}. If no other mobile-mcp is running, delete that file`);
			}

			await sleep(5 + Math.random() * 20);
		}
	}

	private async unlock(nonce: string): Promise<void> {
		// only remove our own lock: if ours was taken as stale, the file now belongs to someone else
		const owner = await this.readLockOwner(this.lockFilePath);
		if (owner?.nonce === nonce) {
			await fs.promises.rm(this.lockFilePath, { force: true });
		}
	}

	private async readLockOwner(file: string): Promise<LockOwner | undefined> {
		try {
			return JSON.parse(await fs.promises.readFile(file, "utf8"));
		} catch (err: any) {
			return undefined;
		}
	}

	private async isLockStale(owner: LockOwner | undefined): Promise<boolean> {
		if (owner && typeof owner.createdAt === "number") {
			if (owner.hostname === os.hostname() && !isProcessAlive(owner.pid)) {
				return true;
			}

			return Date.now() - owner.createdAt > this.staleLockMs;
		}

		// unreadable or still being written: judge by age
		try {
			const stat = await fs.promises.stat(this.lockFilePath);
			return Date.now() - stat.mtimeMs > this.staleLockMs;
		} catch (err: any) {
			return false;
		}
	}

	// a holder that crashed leaves its lock file behind. take it aside with an atomic
	// rename, and put it back if it turns out another process replaced it meanwhile.
	private async breakLockIfStale(): Promise<void> {
		const observed = await this.readLockOwner(this.lockFilePath);
		if (!await this.isLockStale(observed)) {
			return;
		}

		const aside = `${this.lockFilePath}.stale-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
		try {
			await fs.promises.rename(this.lockFilePath, aside);
		} catch (err: any) {
			// someone else got there first
			return;
		}

		const taken = await this.readLockOwner(aside);
		if (observed && taken?.nonce !== observed.nonce) {
			// not the lock we judged stale, restore it unless a new lock already exists
			await fs.promises.link(aside, this.lockFilePath).catch(() => {});
		}

		await fs.promises.rm(aside, { force: true });
	}
}
