export interface PngDimensions {
	width: number;
	height: number;
}

export class PNG {
	public constructor(private readonly buffer: Buffer) {
	}

	public getDimensions(): PngDimensions {
		// Validate buffer exists and has minimum length
		if (!this.buffer || !Buffer.isBuffer(this.buffer)) {
			throw new Error("Not a valid PNG file: Invalid buffer");
		}

		if (this.buffer.length < 24) {
			throw new Error("Not a valid PNG file: Buffer too short");
		}

		// Validate PNG signature
		const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
		try {
			if (!this.buffer.subarray(0, 8).equals(pngSignature)) {
				throw new Error("Not a valid PNG file: Invalid PNG signature");
			}
		} catch (err: any) {
			throw new Error("Not a valid PNG file: Cannot read buffer");
		}

		// Read dimensions from IHDR chunk
		try {
			const width = this.buffer.readUInt32BE(16);
			const height = this.buffer.readUInt32BE(20);
			
			if (width <= 0 || height <= 0) {
				throw new Error("Not a valid PNG file: Invalid dimensions");
			}
			
			return { width, height };
		} catch (err: any) {
			throw new Error("Not a valid PNG file: Cannot read dimensions");
		}
	}
}
