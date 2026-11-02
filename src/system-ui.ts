/**
 * Hides passive system overlays from a ui dump so the element list carries
 * what the agent can act on in the foreground app.
 *
 * Android reports every visible window as its own root: the app, but also
 * the status bar, the navigation bar, gesture handles and launcher edge
 * triggers. Those roots are never what a task is about, yet on a Samsung
 * phone they are close to half of the lines returned. A root is dropped only
 * when its package is a known overlay package and, for packages that also
 * draw real screens (the notification shade is com.android.systemui, the
 * home screen is the launcher), only when the window is small. Anything not
 * recognised stays, so keyboards, permission dialogs and iOS dumps (whose
 * identifiers carry no package) are untouched. The "raw" format bypasses
 * this entirely.
 */

export interface UINode {
	identifier?: string;
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	children?: UINode[];
}

interface OverlayRule {
	// the window is dropped when its area is at most this fraction of the
	// largest window's area; 1 drops it regardless of size
	maxAreaFraction: number;
}

const OVERLAY_RULES: Record<string, OverlayRule> = {
	// status bar and navigation bar are thin strips; the pulled-down shade,
	// the keyguard and system dialogs come from the same package but are tall
	"com.android.systemui": { maxAreaFraction: 0.10 },
	// samsung "one hand operation+" draws two invisible full-height handles
	"com.samsung.android.sidegesturepad": { maxAreaFraction: 1 },
	// samsung edge panel trigger is a sliver on the screen edge; the home
	// screen itself is a full-size window of the same package
	"com.sec.android.app.launcher": { maxAreaFraction: 0.05 },
};

// android resource ids look like "com.example.app:id/button"; "android:id/..."
// are framework ids that appear in every window and say nothing about its owner
const packageOfIdentifier = (identifier: string): string | undefined => {
	const separator = identifier.indexOf(":id/");
	if (separator <= 0) {
		return undefined;
	}

	const pkg = identifier.substring(0, separator);
	return pkg === "android" ? undefined : pkg;
};

const walk = (node: UINode, visit: (node: UINode) => void): void => {
	visit(node);
	for (const child of node.children ?? []) {
		walk(child, visit);
	}
};

/**
 * The package that owns a window, taken as the most common package among the
 * resource ids inside it. Undefined when no node carries a package.
 */
export const inferWindowPackage = (root: UINode): string | undefined => {
	const counts = new Map<string, number>();
	walk(root, node => {
		const pkg = node.identifier ? packageOfIdentifier(node.identifier) : undefined;
		if (pkg) {
			counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
		}
	});

	let best: string | undefined;
	let bestCount = 0;
	for (const [pkg, count] of counts) {
		if (count > bestCount) {
			best = pkg;
			bestCount = count;
		}
	}

	return best;
};

const area = (node: UINode): number => Math.max(0, node.rect.width) * Math.max(0, node.rect.height);

/**
 * Returns the roots worth showing: every window except recognised passive
 * overlays. The largest window stands in for the screen when judging size.
 */
export const dropPassiveOverlays = <T extends UINode>(roots: T[]): T[] => {
	const screenArea = Math.max(0, ...roots.map(area));
	if (screenArea === 0) {
		return roots;
	}

	const kept = roots.filter(root => {
		const pkg = inferWindowPackage(root);
		const rule = pkg ? OVERLAY_RULES[pkg] : undefined;
		if (!rule) {
			return true;
		}

		return area(root) / screenArea > rule.maxAreaFraction;
	});

	// a dump made only of overlays (nothing else is on screen) is better shown than hidden
	return kept.length > 0 ? kept : roots;
};
