import {assert} from "chai";
import Renderer from "../../../src/model/pdf/Renderer";
import {findChromium, hasPdfinfo, pdfInfo, readFixture, requireTool, streamToBuffer} from "../../helpers";

describe("Renderer", function() {

    const chromium = findChromium();

    before(function() {
        requireTool(this, chromium !== null, "no Chromium available, set PUPPETEER_EXECUTABLE_PATH");
        requireTool(this, hasPdfinfo(), "pdfinfo (poppler-utils) not installed");
    });

    it("render should generate an A4 pdf by default", async () => {
        const renderer = new Renderer(chromium!);

        const pdf = await streamToBuffer(await renderer.renderFromFile(readFixture("file.html").toString(), {}));

        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
        const page = await pdfInfo(pdf);
        assert.approximately(page.width, 595, 2);
        assert.approximately(page.height, 842, 2);
    });

    it("render should merge custom options over the defaults", async () => {
        const renderer = new Renderer(chromium!);

        const pdf = await streamToBuffer(await renderer.renderFromFile("<p>ahoj</p>", {format: "A5", landscape: true}));

        const page = await pdfInfo(pdf);
        assert.approximately(page.width, 595, 2);
        assert.approximately(page.height, 420, 2);
    });

    it("render should fail on an unknown paper format", async () => {
        const renderer = new Renderer(chromium!);

        try {
            await renderer.renderFromFile("<p>x</p>", {format: "XX"});
            assert.fail("render should throw");
        } catch (e) {
            assert.match((e as Error).message, /Unknown paper format/);
        }
    });

});
