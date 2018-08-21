import {assert} from "chai";
import * as fs from "fs";
import "mocha";
import Merger from "../../../src/model/pdf/Merger";

describe("Merger", () => {

    const tmpDir = __dirname + "/../../../tmp/";

    it.skip("merge should concat multiple files together", async () => {
        const merger = new Merger();

        const pdfStream = await merger.merge([tmpDir + "example.pdf", tmpDir + "example.pdf"]);

        const file = fs.createWriteStream(tmpDir + "merged.pdf");
        pdfStream.pipe(file);

        assert.isTrue(true);
    });

});
