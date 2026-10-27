// POST /v1/pdf/from-file  (multipart: first uploaded file = HTML, optional field "options" = JSON string)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    A4, A5, SIZE_TOLERANCE_PT, assertClose, dataFile, isPdf, parseErrorBody, pdfInfo, pdfText, postMultipart,
    request,
} from "./helpers.mjs";

const HTML = dataFile("file.html");
const HTML_TEXT = "Hi Lotus developers"; // visible text in data/file.html

const THREE_PAGES = Buffer.from(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div style="page-break-after: always">FIRST-UPLOAD page one</div>
<div style="page-break-after: always">page two</div>
<div>page three</div></body></html>`);

function assertPdfResponse({ status, headers, body }) {
    assert.equal(status, 200, `expected 200, got ${status}: ${body.toString("utf8").slice(0, 300)}`);
    assert.match(headers.get("content-type") ?? "", /^application\/pdf\b/);
    assert.ok(isPdf(body), "body starts with %PDF-");
    return pdfInfo(body);
}

describe("POST /v1/pdf/from-file - happy path", () => {
    test("renders data/file.html: 200, application/pdf, 1 A4 page, contains its text", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [{ name: "file", file: HTML }]);
        const info = assertPdfResponse(r);
        assert.equal(info.pages, 1);
        assertClose(assert, info.width, A4.width, SIZE_TOLERANCE_PT, "A4 width");
        assertClose(assert, info.height, A4.height, SIZE_TOLERANCE_PT, "A4 height");
        const text = pdfText(r.body);
        if (text !== null) assert.ok(text.includes(HTML_TEXT), "PDF contains text of the HTML");
    });

    test("trailing slash /v1/pdf/from-file/ behaves the same", async () => {
        const r = await postMultipart("/v1/pdf/from-file/", [{ name: "file", file: HTML }]);
        assert.equal(assertPdfResponse(r).pages, 1);
    });

    test("the file field name is arbitrary", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [{ name: "whatever", file: HTML, filename: "x.html" }]);
        assert.equal(assertPdfResponse(r).pages, 1);
    });

    test("only the first uploaded file is rendered", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [
            { name: "file", file: THREE_PAGES, filename: "first.html", type: "text/html" },
            { name: "file2", file: HTML },
        ]);
        assert.equal(assertPdfResponse(r).pages, 3);
        const text = pdfText(r.body);
        if (text !== null) {
            assert.ok(text.includes("FIRST-UPLOAD"));
            assert.ok(!text.includes(HTML_TEXT));
        }
    });
});

describe("POST /v1/pdf/from-file - options field", () => {
    test("options {format: A5, landscape: true} changes the page size", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [
            { name: "file", file: HTML },
            { name: "options", value: JSON.stringify({ format: "A5", landscape: true }) },
        ]);
        const info = assertPdfResponse(r);
        // legacy: 2 pages (content no longer fits one A5 landscape page)
        assert.ok(info.pages >= 2, `expected >= 2 pages, got ${info.pages}`);
        assertClose(assert, info.width, A5.height, SIZE_TOLERANCE_PT, "A5 landscape width");
        assertClose(assert, info.height, A5.width, SIZE_TOLERANCE_PT, "A5 landscape height");
    });

    test("options field may precede the file part", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [
            { name: "options", value: JSON.stringify({ landscape: true }) },
            { name: "file", file: HTML },
        ]);
        const info = assertPdfResponse(r);
        assertClose(assert, info.width, A4.height, SIZE_TOLERANCE_PT, "A4 landscape width");
        assertClose(assert, info.height, A4.width, SIZE_TOLERANCE_PT, "A4 landscape height");
    });

    test("pageRanges option is honoured", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [
            { name: "file", file: THREE_PAGES, filename: "three.html", type: "text/html" },
            { name: "options", value: JSON.stringify({ pageRanges: "2-3" }) },
        ]);
        assert.equal(assertPdfResponse(r).pages, 2);
    });

    test("header/footer templates (README example) render without error", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [
            { name: "file", file: THREE_PAGES, filename: "three.html", type: "text/html" },
            {
                name: "options",
                value: JSON.stringify({
                    pageRanges: "1-2",
                    format: "A4",
                    landscape: false,
                    displayHeaderFooter: true,
                    margin: { top: "3cm", bottom: "3cm" },
                    headerTemplate: "<p style='font-size: 20px;'>Printed on: <span class='date'></span></p>",
                    footerTemplate: "<p style='font-size: 20px;'>Page <span class='pageNumber'></span>/<span class='totalPages'></span></p>",
                }),
            },
        ]);
        assert.equal(assertPdfResponse(r).pages, 2);
        const text = pdfText(r.body);
        if (text !== null) {
            assert.ok(text.includes("Printed on:"), "header rendered");
            // totalPages counts the whole document, not the printed range (legacy prints "Page 1/3")
            assert.match(text, /Page\s+1\/\d+/, "footer rendered");
        }
    });
});

describe("POST /v1/pdf/from-file - errors (HTTP 500 + {error})", () => {
    test("invalid options JSON -> exact error", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [
            { name: "file", file: HTML },
            { name: "options", value: "{format: A5" },
        ]);
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "Invalid options provided. It must be valid JSON string." });
    });

    test("no file uploaded -> 'No files given'", async () => {
        const r = await postMultipart("/v1/pdf/from-file", [{ name: "options", value: "{}" }]);
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    test("trailing slash variant: no file uploaded -> 'No files given'", async () => {
        const r = await postMultipart("/v1/pdf/from-file/", [{ name: "options", value: "{}" }]);
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    test("POST without any body -> 'No files given'", async () => {
        const r = await request("/v1/pdf/from-file", { method: "POST" });
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    // The 2019 image never answered here: express.json() consumed the body and formidable
    // then waited forever. PEDEF_LEGACY=1 skips it.
    test("JSON body instead of multipart gets a prompt error response", {
        skip: process.env.PEDEF_LEGACY === "1" && "fixed after legacy",
    }, async () => {
        const r = await request("/v1/pdf/from-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: "<html></html>" }),
            timeoutMs: 10_000,
        });
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });
});

describe("POST /v1/pdf/from-file - concurrency", () => {
    test("3 parallel renders all succeed", async () => {
        const results = await Promise.all([0, 1, 2].map((i) => postMultipart(
            i % 2 ? "/v1/pdf/from-file/" : "/v1/pdf/from-file",
            [{ name: "file", file: HTML }],
        )));
        for (const r of results) {
            assert.equal(assertPdfResponse(r).pages, 1);
        }
    });
});
