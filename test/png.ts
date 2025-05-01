import assert from "assert";
import { PNG } from "../src/png";


describe("png", async () => {
	it("should be able to parse png", () => {
		const buffer = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";
		const png = new PNG(Buffer.from(buffer, "base64"));
		assert.ok(png.getDimensions().width === 1);
		assert.ok(png.getDimensions().height === 1);
	});

	it("should be able to to detect an invalid png", done => {
		try {
			const buffer = btoa("IAMADUCKIAMADUCKIAMADUCKIAMADUCKIAMADUCK");
			const png = new PNG(Buffer.from(buffer, "base64"));
			png.getDimensions();
			done(new Error("should have thrown an error"));
		} catch (error) {
			done();
		}
	});
});
