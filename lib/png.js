"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PNG = void 0;
class PNG {
    buffer;
    constructor(buffer) {
        this.buffer = buffer;
    }
    getDimensions() {
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (!this.buffer.subarray(0, 8).equals(pngSignature)) {
            throw new Error("Not a valid PNG file");
        }
        const width = this.buffer.readUInt32BE(16);
        const height = this.buffer.readUInt32BE(20);
        return { width, height };
    }
}
exports.PNG = PNG;
