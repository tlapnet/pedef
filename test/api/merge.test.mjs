// POST /v1/pdf/merge  (multipart PDFs -> merged PDF, Content-Disposition: attachment; filename=merged.pdf;)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    HAVE_PDFINFO, dataFile, isPdf, makePdf, parseErrorBody, pdfInfo, pdfObjectsText, pdfText, postMultipart, request,
} from "./helpers.mjs";

const SINGLE = dataFile("single-page.pdf"); // 1 page, A4
const MULTI = dataFile("multi-page.pdf"); // 6 pages, A4

// Small fixtures, all 300x200 pt pages with Helvetica text:
// - outline.pdf, form.pdf: hand-written uncompressed PDFs (readable in a text editor) with a correct xref.
//   outline.pdf: 2 pages "Outline page 1/2", outline "Chapter 1" -> p1, "Chapter 2" -> p2.
//   form.pdf: 1 page "Form page", AcroForm text field "name" = "Pedef" with an appearance stream.
// - encrypted-*.pdf: outline.pdf encrypted with qpdf 12.2 (--static-id --static-aes-iv keep it reproducible):
//   qpdf --static-id --static-aes-iv --encrypt --user-password= --owner-password=owner --bits=128 --use-aes=y \
//        --modify=none --extract=n -- outline.pdf encrypted-owner.pdf
//   qpdf --static-id --static-aes-iv --encrypt --user-password=user --owner-password=owner --bits=128 --use-aes=y \
//        -- outline.pdf encrypted-user.pdf
//   qpdf --static-id --static-aes-iv --encrypt --user-password= --owner-password=owner --bits=256 \
//        --modify=none -- outline.pdf encrypted-owner-aes256.pdf
// - damaged-xref.pdf: outline.pdf with the startxref offset replaced by 999 (readers rebuild the xref).
const OUTLINE = dataFile("outline.pdf"); // 2 pages, 300x200, outlines
const FORM = dataFile("form.pdf"); // 1 page, 300x200, AcroForm field name=Pedef

function assertMergedPdf({ status, headers, body }) {
    assert.equal(status, 200, `expected 200, got ${status}: ${body.toString("utf8").slice(0, 300)}`);
    assert.match(headers.get("content-type") ?? "", /^application\/pdf\b/);
    // legacy sends exactly: attachment; filename=merged.pdf;
    assert.match(headers.get("content-disposition") ?? "", /^attachment;\s*filename="?merged\.pdf"?;?$/);
    assert.ok(isPdf(body), "body starts with %PDF-");
    return pdfInfo(body);
}

describe("POST /v1/pdf/merge - happy path", () => {
    test("single-page + multi-page -> 7 pages, attachment merged.pdf", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "file1", file: SINGLE },
            { name: "file2", file: MULTI },
        ]);
        assert.equal(assertMergedPdf(r).pages, 7);
    });

    test("trailing slash /v1/pdf/merge/ behaves the same", async () => {
        const r = await postMultipart("/v1/pdf/merge/", [
            { name: "file1", file: MULTI },
            { name: "file2", file: SINGLE },
        ]);
        assert.equal(assertMergedPdf(r).pages, 7);
    });

    test("three files, same field name repeated -> page count is the sum (1+6+2)", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "files", file: SINGLE },
            { name: "files", file: MULTI },
            { name: "files", file: makePdf({ width: 300, height: 200, pages: 2 }), filename: "gen.pdf" },
        ]);
        assert.equal(assertMergedPdf(r).pages, 9);
    });

    // needs pdfinfo: the JS fallback reports the first MediaBox in file order, not page 1
    test("upload order is preserved (first page comes from the first file)", { skip: !HAVE_PDFINFO && "pdfinfo not available" }, async () => {
        const land = makePdf({ width: 842, height: 595, pages: 2 });
        const r1 = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: land, filename: "land.pdf" },
            { name: "b", file: SINGLE },
        ]);
        const i1 = assertMergedPdf(r1);
        assert.equal(i1.pages, 3);
        assert.ok(Math.abs(i1.width - 842) < 1 && Math.abs(i1.height - 595) < 1,
            `page 1 should be the 842x595 landscape page, got ${i1.width}x${i1.height}`);

        const r2 = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: SINGLE },
            { name: "b", file: land, filename: "land.pdf" },
        ]);
        const i2 = assertMergedPdf(r2);
        assert.equal(i2.pages, 3);
        assert.ok(Math.abs(i2.width - 594.96) < 2 && Math.abs(i2.height - 841.92) < 2,
            `page 1 should be the A4 portrait page, got ${i2.width}x${i2.height}`);
    });

    // LEGACY QUIRK (contract as deployed): README says "At least 2 files are required" and
    // MergeHandler intends to throw "Please upload at least 2 files to merge.", but the check
    // is `files.len < 2` (undefined < 2 === false), so it never fires. A single file is
    // accepted and returned as a 1-page "merged" PDF with HTTP 200. Asserted as-is, because
    // existing clients may rely on it; changing it is an API change.
    test("a single file is accepted: 200, 1-page merged.pdf (legacy quirk)", async () => {
        const r = await postMultipart("/v1/pdf/merge", [{ name: "file1", file: SINGLE }]);
        assert.equal(assertMergedPdf(r).pages, 1);
    });
});

describe("POST /v1/pdf/merge - errors (HTTP 500 + {error})", () => {
    test("no file uploaded -> 'No files given'", async () => {
        const r = await postMultipart("/v1/pdf/merge", [{ name: "options", value: "{}" }]);
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    test("POST without any body -> 'No files given' (trailing slash)", async () => {
        const r = await request("/v1/pdf/merge/", { method: "POST" });
        assert.equal(r.status, 500);
        assert.deepEqual(parseErrorBody(r.body), { error: "No files given" });
    });

    // legacy message is pdftk's raw stderr incl. the internal /tmp/upload_* paths - shape only
    test("non-PDF among the uploads -> 500 with an error message", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: dataFile("file.html") },
            { name: "b", file: SINGLE },
        ]);
        assert.equal(r.status, 500);
        const err = parseErrorBody(r.body);
        assert.equal(typeof err.error, "string");
        assert.ok(err.error.length > 0);
    });
});

describe("POST /v1/pdf/merge - encrypted, damaged and interactive PDFs", () => {
    // owner password only (no user password): opened without a password, restrictions are ignored and the
    // merged file is not encrypted. Legacy (pdftk 2.02) and qpdf behave the same.
    test("owner-password-only encrypted PDF (AES-128, no modify/extract) + normal PDF -> merged, unencrypted", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: dataFile("encrypted-owner.pdf") },
            { name: "b", file: FORM },
        ]);
        const info = assertMergedPdf(r);
        assert.equal(info.pages, 3);
        assert.equal(info.encrypted, false);
        const text = pdfText(r.body);
        if (text !== null) {
            assert.match(text, /Outline page 1[\s\S]*Outline page 2[\s\S]*Form page/);
        }
    });

    // pdftk 2.02 crashes on AES-256 (Java NullPointerException -> 500), qpdf merges it. Only the minimum both
    // satisfy is asserted: a merged PDF or a clean error, never a hang or a broken body.
    test("owner-password-only encrypted PDF (AES-256) -> merged PDF or 500 {error}", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: dataFile("encrypted-owner-aes256.pdf") },
            { name: "b", file: FORM },
        ]);
        if (r.status === 200) {
            const info = assertMergedPdf(r);
            assert.equal(info.pages, 3);
            assert.equal(info.encrypted, false);
        } else {
            assert.equal(r.status, 500);
            assert.equal(typeof parseErrorBody(r.body).error, "string");
        }
    });

    // messages differ: legacy returns pdftk's stderr, the new image a fixed text - shape only
    test("PDF that needs a user password -> 500 with an error message", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: dataFile("encrypted-user.pdf") },
            { name: "b", file: FORM },
        ]);
        assert.equal(r.status, 500);
        const err = parseErrorBody(r.body);
        assert.equal(typeof err.error, "string");
        assert.ok(err.error.length > 0);
    });

    test("damaged PDF (wrong xref offset) is repaired and merged", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: dataFile("damaged-xref.pdf") },
            { name: "b", file: FORM },
        ]);
        assert.equal(assertMergedPdf(r).pages, 3);
    });

    test("form fields are kept, also when two files have a field of the same name", async () => {
        const r1 = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: OUTLINE },
            { name: "b", file: FORM },
        ]);
        const i1 = assertMergedPdf(r1);
        assert.equal(i1.pages, 3);
        assert.equal(i1.form, "AcroForm");

        // pdftk renames the second field to "1.name", qpdf to "name+1"; both keep both values
        const r2 = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: FORM },
            { name: "b", file: FORM },
        ]);
        const i2 = assertMergedPdf(r2);
        assert.equal(i2.pages, 2);
        assert.equal(i2.form, "AcroForm");
        assert.equal(pdfObjectsText(r2.body).match(/\/V\s*\(Pedef\)/g)?.length, 2);
    });

    // Outlines (bookmarks) are NOT asserted: pdftk 2.02 merged the outlines of all files,
    // qpdf --empty --pages drops them (as pdf-lib did). Only the pages are checked.
    test("PDF with outlines -> its pages are merged", async () => {
        const r = await postMultipart("/v1/pdf/merge", [
            { name: "a", file: OUTLINE },
            { name: "b", file: SINGLE },
        ]);
        const info = assertMergedPdf(r);
        assert.equal(info.pages, 3);
        if (HAVE_PDFINFO) {
            assert.deepEqual([info.width, info.height], [300, 200]);
        }
    });
});
