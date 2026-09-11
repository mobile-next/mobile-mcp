import { Dimensions } from "./robot";

const RATIO_DECIMALS = 3;

const formatRatio = (ratio: number): string => Number(ratio.toFixed(RATIO_DECIMALS)).toString();

const isPositive = (size: Dimensions): boolean => size.width > 0 && size.height > 0;

/**
 * Plain-words instruction for a model that reads pixel positions off a
 * screenshot and taps in screen coordinates. The screenshot is usually
 * downscaled, and on iOS the screen is measured in points while a full-size
 * screenshot is in pixels, so the two spaces rarely agree.
 *
 * Returns null when either size is unknown, in which case no instruction is
 * better than a wrong one.
 */
export const describeCoordinateMapping = (screenshot: Dimensions, screen: Dimensions): string | null => {
	if (!isPositive(screenshot) || !isPositive(screen)) {
		return null;
	}

	if (screenshot.width === screen.width && screenshot.height === screen.height) {
		return `Screenshot is ${screenshot.width}x${screenshot.height} and its coordinates match the screen.`;
	}

	const x = formatRatio(screen.width / screenshot.width);
	const y = formatRatio(screen.height / screenshot.height);
	return `Screenshot is ${screenshot.width}x${screenshot.height}. Screen coordinates are ${screen.width}x${screen.height}. To tap something you see in this screenshot, multiply its x by ${x} and y by ${y}.`;
};
