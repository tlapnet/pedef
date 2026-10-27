import {assert} from "chai";
import {execFileSync} from "node:child_process";
import {readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import Thumbnailer from "../../../src/model/pdf/Thumbnailer";
import {fixture, pngSize, requireTool, streamToBuffer} from "../../helpers";

function hasPdftoppm(): boolean {
    try {
        execFileSync("pdftoppm", ["-v"], {stdio: "ignore"});
        return true;
    } catch {
        return false;
    }
}

const thumbDirs = () => readdirSync(tmpdir()).filter((f) => f.startsWith("pedef-thumb-"));

describe("Thumbnailer", function() {

    before(function() {
        requireTool(this, hasPdftoppm(), "pdftoppm (poppler-utils) not installed");
    });

    for (const name of ["single-page.pdf", "multi-page.pdf"]) {
        it(`create should return a 72 dpi png of the first page of ${name}`, async () => {
            const before = thumbDirs().length;
            const thumb = new Thumbnailer();

            const img = await streamToBuffer(await thumb.create(fixture(name)));

            // A4 at 72 dpi, the same size ImageMagick produced before
            assert.deepEqual(pngSize(img), {width: 595, height: 842});
            assert.equal(thumbDirs().length, before, "temporary directory removed");
        });
    }

    it("create fails with the same message as before for a file that is not a pdf", async () => {
        const notPdf = fixture("not-a-pdf.txt");

        try {
            await new Thumbnailer().create(notPdf);
            assert.fail("create should throw");
        } catch (e) {
            assert.equal((e as Error).message, "Failed to convert page to image");
        }
    });

});
