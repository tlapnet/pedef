// POST /v1/pdf/thumbnail  (multipart PDF -> PNG of page 1)
// Legacy renders page 1 at 72 dpi, i.e. PNG size in px == page size in pt (rounded):
//   data/single-page.pdf (594.96 x 841.92 pt) -> 595 x 842 px
//   data/multi-page.pdf  (594.96 x 841.92 pt) -> 595 x 842 px
//   842 x 595 pt landscape                   -> 842 x 595 px
//   300 x 200 pt                             -> 300 x 200 px
// (pixel format varies with content: RGBA for the photo-ish fixtures, palette for flat ones - not asserted)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dataFile, makePdf, parseErrorBody, pngInfo, postMultipart, request } from "./helpers.mjs";

const PX_TOLERANCE = 2;

function assertPngResponse({ status, headers, body }, expected) {
    assert.equal(status, 200, `expected 200, got ${status}: ${body.toString("utf8").slice(0, 300)}`);
    assert.match(headers.get("content-type") ?? "", /^image\/png\b/);
    const info = pngInfo(body); // throws unless the PNG signature + IHDR are there
    assert.ok(Math.abs(info.width - expected.width) <= PX_TOLERANCE,
        `width: expected ${expected.width} +-${PX_TOLERANCE}, got ${info.width}`);
    assert.ok(Math.abs(info.height - expected.height) <= PX_TOLERANCE,
        `height: expected ${expected.height} +-${PX_TOLERANCE}, got ${info.height}`);
    return info;
}

describe("POST /v1/pdf/thumbnail - happy path", () => {
    test("single-page.pdf -> 200 image/png 595x842", async () => {
        const r = await postMultipart("/v1/pdf/thumbnail", [{ name: "file", file: dataFile("single-page.pdf") }]);
        assertPngResponse(r, { width: 595, height: 842 });
        assert.ok(r.body.length > 10_000, "thumbnail of a content-rich page is not trivially small");
    });

    test("multi-page.pdf -> 200 image/png 595x842 (first page only)", async () => {
        const r = await postMultipart("/v1/pdf/thumbnail", [{ name: "file", file: dataFile("multi-page.pdf") }]);
        assertPngResponse(r, { width: 595, height: 842 });
    });

    test("trailing slash /v1/pdf/thumbnail/ behaves the same", async () => {
        const r = await postMultipart("/v1/pdf/thumbnail/", [{ name: "file", file: dataFile("single-page.pdf") }]);
        assertPngResponse(r, { width: 595, height: 842 });
    });

    test("landscape page -> landscape thumbnail (842x595)", async () => {
        const pdf = makePdf({ width: 842, height: 595, pages: 2 });
        const r = await postMultipart("/v1/pdf/thumbnail", [{ name: "pdf", file: pdf, filename: "land.pdf" }]);
        assertPngResponse(r, { width: 842, height: 595 });
    });

    test("thumbnail size follows the page size at 72 dpi (300x200 pt -> 300x200 px)", async () => {
        const pdf = makePdf({ width: 300, height: 200 });
        const r = await postMultipart("/v1/pdf/thumbnail", [{ name: "file", file: pdf, filename: "small.pdf" }]);
        assertPngResponse(r, { width: 300, height: 200 });
    });

    test("only the first uploaded file is used", async () => {
        const r = await postMultipart("/v1/pdf/thumbnail", [
            { name: "a", file: makePdf({ width: 300, height: 200 }), filename: "small.pdf" },
            { name: "b", file: dataFile("single-page.pdf") },
        ]);
        assertPngResponse(r, { width: 300, height: 200 });
    });
});

describe("POST /v1/pdf/thumbnail - errors (HTTP 500 + {error})", () => {
    test("no file uploaded -> 'No files given'", async () => {
        const r = await postMultipart("/v1/pdf/thumbnail", [{ name: "options", value: "{}" }]);
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    test("POST without any body -> 'No files given' (trailing slash)", async () => {
        const r = await request("/v1/pdf/thumbnail/", { method: "POST" });
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    // legacy message: "Failed to convert page to image" (comes from the pdf-image lib; shape only)
    test("non-PDF upload -> 500 with an error message", async () => {
        const r = await postMultipart("/v1/pdf/thumbnail", [{ name: "file", file: dataFile("file.html") }]);
        assert.equal(r.status, 500);
        const err = parseErrorBody(r.body);
        assert.equal(typeof err.error, "string");
        assert.ok(err.error.length > 0);
    });
});
