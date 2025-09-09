import { execFileSync, spawnSync } from "child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { trace } from "./logger";

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
			trace("on darwin and sips is available");
			try {
				return this.toBufferWithSips();
			} catch (error) {
				// Fall back to ImageMagick
			}
		}

		return this.toBufferWithImageMagick();
	}

	private toBufferWithSips(): Buffer {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-"));
		const inputFile = path.join(tempDir, "input");
		const outputFile = path.join(tempDir, `output.${this.newFormat === "jpg" ? "jpg" : "png"}`);

		try {
			fs.writeFileSync(inputFile, this.buffer);

			const sipsArgs = ["-s", "format", this.newFormat === "jpg" ? "jpeg" : "png", "-Z", `${this.newWidth}`, "--out", outputFile, inputFile];
			trace(`running sips command: /usr/bin/sips ${sipsArgs.join(" ")}`);

			const proc = spawnSync("/usr/bin/sips", sipsArgs, {
				maxBuffer: 8 * 1024 * 1024
			});

			trace("sips returned status " + proc.status);
			if (proc.status !== 0) {
				throw new Error(`SIPS failed with status ${proc.status}`);
			}

			const outputBuffer = fs.readFileSync(outputFile);
			trace("sips returned buffer of size: " + outputBuffer.length);
			return outputBuffer;
		} finally {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch (error) {
				// Ignore cleanup errors
			}
		}
	}

	private toBufferWithImageMagick(): Buffer {
		const magickArgs = ["-", "-resize", `${this.newWidth}x`, "-quality", `${this.jpegOptions.quality}`, `${this.newFormat}:-`];
		trace(`running magick command: magick ${magickArgs.join(" ")}`);

		const proc = spawnSync("magick", magickArgs, {
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
