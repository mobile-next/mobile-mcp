"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScalingAvailable = exports.isImageMagickInstalled = exports.isSipsInstalled = exports.Image = exports.ImageTransformer = void 0;
const child_process_1 = require("child_process");
const node_os_1 = __importDefault(require("node:os"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const logger_1 = require("./logger");
const DEFAULT_JPEG_QUALITY = 75;
class ImageTransformer {
    buffer;
    newWidth = 0;
    newFormat = "png";
    jpegOptions = { quality: DEFAULT_JPEG_QUALITY };
    constructor(buffer) {
        this.buffer = buffer;
    }
    resize(width) {
        this.newWidth = width;
        return this;
    }
    jpeg(options) {
        this.newFormat = "jpg";
        this.jpegOptions = options;
        return this;
    }
    png() {
        this.newFormat = "png";
        return this;
    }
    toBuffer() {
        if ((0, exports.isSipsInstalled)()) {
            try {
                return this.toBufferWithSips();
            }
            catch (error) {
                (0, logger_1.trace)(`Sips failed, falling back to ImageMagick: ${error}`);
            }
        }
        try {
            return this.toBufferWithImageMagick();
        }
        catch (error) {
            (0, logger_1.trace)(`ImageMagick failed: ${error}`);
            throw new Error("Image scaling unavailable (requires Sips or ImageMagick).");
        }
    }
    qualityToSips(q) {
        if (q >= 90) {
            return "best";
        }
        if (q >= 75) {
            return "high";
        }
        if (q >= 50) {
            return "normal";
        }
        return "low";
    }
    toBufferWithSips() {
        const tempDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "image-"));
        const inputFile = node_path_1.default.join(tempDir, "input");
        const outputFile = node_path_1.default.join(tempDir, `output.${this.newFormat === "jpg" ? "jpg" : "png"}`);
        try {
            node_fs_1.default.writeFileSync(inputFile, this.buffer);
            const args = ["-s", "format", this.newFormat === "jpg" ? "jpeg" : "png"];
            if (this.newFormat === "jpg") {
                args.push("-s", "formatOptions", this.qualityToSips(this.jpegOptions.quality));
            }
            args.push("-Z", `${this.newWidth}`);
            args.push("--out", outputFile);
            args.push(inputFile);
            (0, logger_1.trace)(`Running sips command: /usr/bin/sips ${args.join(" ")}`);
            const proc = (0, child_process_1.spawnSync)("/usr/bin/sips", args, {
                maxBuffer: 8 * 1024 * 1024
            });
            if (proc.status !== 0) {
                throw new Error(`Sips failed with status ${proc.status}`);
            }
            const outputBuffer = node_fs_1.default.readFileSync(outputFile);
            (0, logger_1.trace)("Sips returned buffer of size: " + outputBuffer.length);
            return outputBuffer;
        }
        finally {
            try {
                node_fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
            catch (error) {
                // Ignore cleanup errors
            }
        }
    }
    toBufferWithImageMagick() {
        const magickArgs = ["-", "-resize", `${this.newWidth}x`, "-quality", `${this.jpegOptions.quality}`, `${this.newFormat}:-`];
        (0, logger_1.trace)(`Running magick command: magick ${magickArgs.join(" ")}`);
        const proc = (0, child_process_1.spawnSync)("magick", magickArgs, {
            maxBuffer: 8 * 1024 * 1024,
            input: this.buffer
        });
        return proc.stdout;
    }
}
exports.ImageTransformer = ImageTransformer;
class Image {
    buffer;
    constructor(buffer) {
        this.buffer = buffer;
    }
    static fromBuffer(buffer) {
        return new Image(buffer);
    }
    resize(width) {
        return new ImageTransformer(this.buffer).resize(width);
    }
    jpeg(options) {
        return new ImageTransformer(this.buffer).jpeg(options);
    }
}
exports.Image = Image;
const isDarwin = () => {
    return node_os_1.default.platform() === "darwin";
};
const isSipsInstalled = () => {
    if (!isDarwin()) {
        return false;
    }
    try {
        (0, child_process_1.execFileSync)("/usr/bin/sips", ["--version"]);
        return true;
    }
    catch (error) {
        return false;
    }
};
exports.isSipsInstalled = isSipsInstalled;
const isImageMagickInstalled = () => {
    try {
        return (0, child_process_1.execFileSync)("magick", ["--version"])
            .toString()
            .split("\n")
            .filter(line => line.includes("Version: ImageMagick"))
            .length > 0;
    }
    catch (error) {
        return false;
    }
};
exports.isImageMagickInstalled = isImageMagickInstalled;
const isScalingAvailable = () => {
    return (0, exports.isImageMagickInstalled)() || (0, exports.isSipsInstalled)();
};
exports.isScalingAvailable = isScalingAvailable;
