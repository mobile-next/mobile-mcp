/**
 * Hides passive system overlays from a ui dump so the element list carries
 * what the agent can act on in the foreground app.
 *
 * Android reports every visible window as its own root: the app, but also
 * the status bar, the navigation bar, gesture handles and launcher edge
 * triggers. Those roots are never what a task is about, yet on a Samsung
 * phone they are close to half of the lines returned. A root is dropped only
 * when it is owned by a known overlay package, contains one of that
 * package's known passive resource ids, and is small. The same packages
 * also draw windows that matter (the notification shade and the volume
 * dialog are com.android.systemui, the home screen is the launcher, the One
 * Hand Operation + settings are sidegesturepad), so neither the package nor
 * the size alone is enough. Anything not recognised stays, so keyboards,
 * permission dialogs and iOS dumps (whose identifiers carry no package) are
 * untouched. The "raw" format bypasses this entirely.
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
	// resource ids (the part after ":id/") that mark a passive window of this
	// package; all were read from a real dump, a window with none of them stays
	passiveIds: string[];
	// and the window must be at most this fraction of the largest window's area
	maxAreaFraction: number;
	// resource ids of controls that make the window worth keeping after all,
	// such as the ongoing-call chip that the status bar can carry
	actionableIds?: string[];
}

const OVERLAY_RULES: Record<string, OverlayRule> = {
	// the status bar strip; the pulled-down shade carries status bar ids too
	// but is tall, and dialogs such as volume carry none of these ids
	"com.android.systemui": {
		passiveIds: ["status_bar_launch_animation_container", "status_bar_container", "status_bar"],
		maxAreaFraction: 0.10,
		// tappable status bar chips, from aosp SystemUI status_bar.xml: the call chip
		// up to android 14, the activity chips after it, and the user switcher chip
		actionableIds: ["ongoing_call_chip", "ongoing_activity_chip_primary", "ongoing_activity_chip_secondary", "user_switcher_container"],
	},
	// samsung "one hand operation+" draws two invisible full-height handles;
	// its own settings screen has none of these ids
	"com.samsung.android.sidegesturepad": {
		passiveIds: ["visible_handler", "visible_area"],
		maxAreaFraction: 1,
	},
	// samsung edge panel trigger is a sliver on the screen edge; the home
	// screen is a full-size window of the same package
	"com.sec.android.app.launcher": {
		passiveIds: ["trigger_container", "trigger_view", "default_trigger"],
		maxAreaFraction: 0.05,
	},
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

const containsAnyId = (root: UINode, pkg: string, ids: string[]): boolean => {
	const wanted = new Set(ids.map(id => `${pkg}:id/${id}`));
	let found = false;
	walk(root, node => {
		if (node.identifier && wanted.has(node.identifier)) {
			found = true;
		}
	});
	return found;
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
		if (!pkg || !rule) {
			return true;
		}

		const passive = containsAnyId(root, pkg, rule.passiveIds)
			&& area(root) / screenArea <= rule.maxAreaFraction
			&& !containsAnyId(root, pkg, rule.actionableIds ?? []);
		return !passive;
	});

	// a dump made only of overlays (nothing else is on screen) is better shown than hidden
	return kept.length > 0 ? kept : roots;
};
