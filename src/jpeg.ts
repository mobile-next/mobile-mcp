import { ActionableError, Dimensions } from "./robot";

const JPEG_SOI = 0xffd8;
const MARKER_PREFIX = 0xff;

// SOFn markers carry the frame header with the image dimensions. 0xc4 (DHT),
// 0xc8 (JPG) and 0xcc (DAC) sit in the same range but are not frame headers.
const isStartOfFrameMarker = (marker: number): boolean =>
	marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

export const getJpegDimensions = (buffer: Buffer): Dimensions => {
	if (buffer.length < 4 || buffer.readUInt16BE(0) !== JPEG_SOI) {
		throw new ActionableError("Invalid JPEG");
	}

	let offset = 2;
	while (offset + 4 <= buffer.length) {
		if (buffer[offset] !== MARKER_PREFIX) {
			throw new ActionableError("Invalid JPEG");
		}

		const marker = buffer[offset + 1];
		const segmentLength = buffer.readUInt16BE(offset + 2);

		if (isStartOfFrameMarker(marker)) {
			// segment: length(2) precision(1) height(2) width(2) ...
			if (offset + 9 > buffer.length) {
				throw new ActionableError("Invalid JPEG");
			}

			return {
				height: buffer.readUInt16BE(offset + 5),
				width: buffer.readUInt16BE(offset + 7),
			};
		}

		offset += 2 + segmentLength;
	}

	throw new ActionableError("Invalid JPEG");
};
