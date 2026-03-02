import { ActionableError } from "./robot";

export function validatePackageName(packageName: string): void {
	if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
}
