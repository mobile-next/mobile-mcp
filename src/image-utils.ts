import { execFileSync, spawnSync } from "child_process";
import os from "node:os";

const DEFAULT_JPEG_QUALITY = 75;

export class ImageTransformer {

	private newWidth: number = 0;
	private newFormat: "jpg" | "png" = "png";
	private jpegOptions: { quality: number } = { quality: DEFAULT_JPEG_QUALITY };

	constructor(private buffer: Buffer) {}

	public resize(width: number): ImageTransformer {
		this.newWidth = width;
		return this;
	}

	public jpeg(options: { quality: number }): ImageTransformer {
		this.newFormat = "jpg";
		this.jpegOptions = options;
		return this;
	}

	public png(): ImageTransformer {
		this.newFormat = "png";
		return this;
	}

	public toBuffer(): Buffer {
		if (os.platform() === "darwin" && isSipsInstalled()) {
			try {
				return this.toBufferWithSips();
			} catch (error) {
				// Fall back to ImageMagick
			}
		}

		return this.toBufferWithImageMagick();
	}

	private toBufferWithSips(): Buffer {
		const proc = spawnSync("/usr/bin/sips", ["-s", "format", this.newFormat === "jpg" ? "jpeg" : "png", "-Z", `${this.newWidth}`, "--out", "-", "-"], {
			maxBuffer: 8 * 1024 * 1024,
			input: this.buffer
		});

		if (proc.status !== 0) {
			throw new Error(`SIPS failed with status ${proc.status}`);
		}

		return proc.stdout;
	}

	private toBufferWithImageMagick(): Buffer {
		const proc = spawnSync("magick", ["-", "-resize", `${this.newWidth}x`, "-quality", `${this.jpegOptions.quality}`, `${this.newFormat}:-`], {
			maxBuffer: 8 * 1024 * 1024,
			input: this.buffer
		});

		return proc.stdout;
	}
}

export class Image {
	constructor(private buffer: Buffer) {}

	public static fromBuffer(buffer: Buffer): Image {
		return new Image(buffer);
	}

	public resize(width: number): ImageTransformer {
		return new ImageTransformer(this.buffer).resize(width);
	}

	public jpeg(options: { quality: number }): ImageTransformer {
		return new ImageTransformer(this.buffer).jpeg(options);
	}
}

export const isSipsInstalled = (): boolean => {
	try {
		execFileSync("/usr/bin/sips", ["--version"]);
		return true;
	} catch (error) {
		return false;
	}
};

export const isImageMagickInstalled = (): boolean => {
	try {
		return execFileSync("magick", ["--version"])
			.toString()
			.split("\n")
			.filter(line => line.includes("Version: ImageMagick"))
			.length > 0;
	} catch (error) {
		return false;
	}
};
