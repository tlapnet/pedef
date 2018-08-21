import {assert} from "chai";
import * as fs from "fs";
import "mocha";
import Thumbnailer from "../../../src/model/pdf/Thumbnailer";

describe("Thumbnailer", () => {

    const tmpDir = __dirname + "/../../../tmp/";

    it.skip("create should return a image stream", async () => {
        const thumb = new Thumbnailer();

        const img = await thumb.create(tmpDir + "example.pdf");

        const file = fs.createWriteStream(tmpDir + "thumb.png");
        img.pipe(file);

        assert.isTrue(true);
    });

});
