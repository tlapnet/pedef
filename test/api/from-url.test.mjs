// POST /v1/pdf/from-url  (JSON body {url, options})
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
    A4, A5, SIZE_TOLERANCE_PT, assertClose, isPdf, parseErrorBody, pdfInfo, pdfText, postJson, request,
    startFixtureServer,
} from "./helpers.mjs";

const MARKER = "PEDEF-FIXTURE-OK";

const PAGES = {
    "/simple.html": `<!DOCTYPE html><html><head><meta charset="utf-8"><title>pedef fixture</title></head>
<body><h1>${MARKER}</h1><p>Simple one page document.</p></body></html>`,
    "/three-pages.html": `<!DOCTYPE html><html><head><meta charset="utf-8"><title>pedef fixture 3</title></head>
<body>
<div style="page-break-after: always">${MARKER} page one</div>
<div style="page-break-after: always">page two</div>
<div>page three</div>
</body></html>`,
};

let fixture;

before(async () => {
    fixture = await startFixtureServer(PAGES);
});

after(async () => {
    await fixture?.close();
});

function assertPdfResponse({ status, headers, body }) {
    assert.equal(status, 200, `expected 200, got ${status}: ${body.toString("utf8").slice(0, 300)}`);
    assert.match(headers.get("content-type") ?? "", /^application\/pdf\b/);
    assert.ok(isPdf(body), "body starts with %PDF-");
    return pdfInfo(body);
}

function assertPageSize(info, expected, what) {
    assertClose(assert, info.width, expected.width, SIZE_TOLERANCE_PT, `${what} width`);
    assertClose(assert, info.height, expected.height, SIZE_TOLERANCE_PT, `${what} height`);
}

const LANDSCAPE = (s) => ({ width: s.height, height: s.width });

describe("POST /v1/pdf/from-url - happy path", () => {
    test("renders a page with empty options: 200, application/pdf, 1 A4 page, fixture text", async () => {
        const r = await postJson("/v1/pdf/from-url", { url: `${fixture.baseUrl}/simple.html`, options: {} });
        const info = assertPdfResponse(r);
        assert.equal(info.pages, 1);
        assertPageSize(info, A4, "default page (A4 portrait)");
        const text = pdfText(r.body);
        if (text !== null) assert.ok(text.includes(MARKER), "PDF contains the fixture text");
    });

    test("trailing slash /v1/pdf/from-url/ behaves the same", async () => {
        const r = await postJson("/v1/pdf/from-url/", { url: `${fixture.baseUrl}/simple.html`, options: {} });
        const info = assertPdfResponse(r);
        assert.equal(info.pages, 1);
    });

    test("CSS page breaks produce the expected page count (3)", async () => {
        const r = await postJson("/v1/pdf/from-url", { url: `${fixture.baseUrl}/three-pages.html`, options: {} });
        const info = assertPdfResponse(r);
        assert.equal(info.pages, 3);
    });
});

describe("POST /v1/pdf/from-url - options", () => {
    test("landscape: true swaps A4 width/height", async () => {
        const r = await postJson("/v1/pdf/from-url", {
            url: `${fixture.baseUrl}/simple.html`,
            options: { landscape: true },
        });
        assertPageSize(assertPdfResponse(r), LANDSCAPE(A4), "A4 landscape");
    });

    test("format: A5 produces A5 portrait pages", async () => {
        const r = await postJson("/v1/pdf/from-url", {
            url: `${fixture.baseUrl}/three-pages.html`,
            options: { format: "A5" },
        });
        const info = assertPdfResponse(r);
        assert.equal(info.pages, 3);
        assertPageSize(info, A5, "A5 portrait");
    });

    test("format: A5 + landscape produces A5 landscape pages", async () => {
        const r = await postJson("/v1/pdf/from-url", {
            url: `${fixture.baseUrl}/simple.html`,
            options: { format: "A5", landscape: true },
        });
        assertPageSize(assertPdfResponse(r), LANDSCAPE(A5), "A5 landscape");
    });

    test("pageRanges: '1-2' limits output to 2 pages", async () => {
        const r = await postJson("/v1/pdf/from-url", {
            url: `${fixture.baseUrl}/three-pages.html`,
            options: { pageRanges: "1-2" },
        });
        assert.equal(assertPdfResponse(r).pages, 2);
    });

    test("header/footer templates with margins render without error", async () => {
        const r = await postJson("/v1/pdf/from-url", {
            url: `${fixture.baseUrl}/three-pages.html`,
            options: {
                format: "A4",
                landscape: false,
                printBackground: true,
                displayHeaderFooter: true,
                margin: { top: "2cm", bottom: "2cm", left: "1cm", right: "1cm" },
                headerTemplate: "<span style='font-size:10px'>HDR-MARK <span class='date'></span></span>",
                footerTemplate: "<span style='font-size:10px'>FTR <span class='pageNumber'></span>/<span class='totalPages'></span></span>",
            },
        });
        const info = assertPdfResponse(r);
        assert.equal(info.pages, 3);
        const text = pdfText(r.body);
        if (text !== null) {
            assert.ok(text.includes("HDR-MARK"), "header template rendered");
            assert.match(text, /FTR\s+1\/3/, "footer template with page placeholders rendered");
        }
    });
});

describe("POST /v1/pdf/from-url - errors (HTTP 500 + {error})", () => {
    // Exact messages are part of the contract (clients may display / match them).
    const cases = [
        ["missing url", { options: {} }, "Missing 'url' in request"],
        ["empty url", { url: "", options: {} }, "Missing 'url' in request"],
        ["empty JSON object", {}, "Missing 'url' in request"],
        // Legacy requires 'options' to be present (and truthy) even though all option fields are optional.
        ["missing options", { url: "http://127.0.0.1/" }, "Missing 'options' in request"],
        ["options: null", { url: "http://127.0.0.1/", options: null }, "Missing 'options' in request"],
    ];
    for (const [name, payload, message] of cases) {
        test(`${name} -> 500 ${JSON.stringify({ error: message })}`, async () => {
            const r = await postJson("/v1/pdf/from-url", payload);
            assert.equal(r.status, 500);
            assert.deepEqual(parseErrorBody(r.body), { error: message });
        });
    }

    test("no body at all -> 500 Missing 'url' in request", async () => {
        const r = await request("/v1/pdf/from-url", { method: "POST" });
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "Missing 'url' in request" });
    });

    test("trailing slash variant returns the same validation error", async () => {
        const r = await postJson("/v1/pdf/from-url/", { options: {} });
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "Missing 'url' in request" });
    });

    test("malformed JSON body -> 400 (body parser rejects it)", async () => {
        const r = await request("/v1/pdf/from-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{not json",
        });
        assert.equal(r.status, 400);
    });

    // The messages below come from Chrome/Puppeteer and are not stable across
    // versions; only the shape is asserted. Legacy messages for reference:
    //   unreachable -> "net::ERR_UNSAFE_PORT at http://127.0.0.1:1/" (port 1 is blocked by Chrome)
    //   invalid url -> "Protocol error (Page.navigate): Cannot navigate to invalid URL"
    //   bad range   -> "Protocol error (Page.printToPDF): Page range exceeds page count"
    test("unreachable URL -> 500 with an error message", async () => {
        const r = await postJson("/v1/pdf/from-url", { url: `${fixture.baseUrl.replace(/:\d+$/, ":1")}/`, options: {} });
        assert.equal(r.status, 500);
        const err = parseErrorBody(r.body);
        assert.equal(typeof err.error, "string");
        assert.ok(err.error.length > 0);
    });

    test("invalid URL string -> 500 with an error message", async () => {
        const r = await postJson("/v1/pdf/from-url", { url: "not a url", options: {} });
        assert.equal(r.status, 500);
        const err = parseErrorBody(r.body);
        assert.equal(typeof err.error, "string");
        assert.ok(err.error.length > 0);
    });

    test("pageRanges beyond the page count -> 500 with an error message", async () => {
        const r = await postJson("/v1/pdf/from-url", {
            url: `${fixture.baseUrl}/simple.html`,
            options: { pageRanges: "9" },
        });
        assert.equal(r.status, 500);
        const err = parseErrorBody(r.body);
        assert.equal(typeof err.error, "string");
        assert.ok(err.error.length > 0);
    });
});

// PEDEF_LEGACY=1 skips the tests of behaviour fixed after the 2019 image.
const LEGACY = process.env.PEDEF_LEGACY === "1";

describe("POST /v1/pdf/from-url - security", () => {
    // The 2019 image rendered file:///etc/passwd into the pdf.
    for (const url of ["file:///etc/passwd", "view-source:file:///etc/passwd", "chrome://version"]) {
        test(`${url} -> 500 Only http and https URLs are allowed`, { skip: LEGACY && "fixed after legacy" }, async () => {
            const r = await postJson("/v1/pdf/from-url", { url, options: {} });
            assert.equal(r.status, 500);
            assert.deepEqual(parseErrorBody(r.body), { error: "Only http and https URLs are allowed" });
        });
    }

    test("a client timeout option is ignored (timeout: 1 still renders)", async () => {
        const r = await postJson("/v1/pdf/from-url", { url: `${fixture.baseUrl}/simple.html`, options: { timeout: 1 } });
        assert.equal(assertPdfResponse(r).pages, 1);
    });
});
