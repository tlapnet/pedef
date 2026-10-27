import {assert} from "chai";
import {readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import Merger from "../../../src/model/pdf/Merger";
import {fixture, hasPdfinfo, hasTool, pdfInfo, readFixture, requireTool, streamToBuffer} from "../../helpers";

const FAILED = /^Failed to merge pdf files/;

const mergeDirs = () => readdirSync(tmpdir()).filter((f) => f.startsWith("pedef-merge-"));

async function assertMergeFails(merger: Merger, files: string[], message: RegExp): Promise<void> {
    try {
        await merger.merge(files);
    } catch (e) {
        assert.match((e as Error).message, message);
        return;
    }
    assert.fail("merge should throw");
}

describe("Merger", function() {

    it("merge of a single file returns it unchanged", async () => {
        const merger = new Merger();

        const out = await streamToBuffer(await merger.merge([fixture("multi-page.pdf")]));

        assert.isTrue(out.equals(readFixture("multi-page.pdf")));
    });

    it("merge fails when the qpdf binary is missing", async () => {
        const merger = new Merger("/nonexistent/qpdf");

        await assertMergeFails(merger, [fixture("single-page.pdf"), fixture("multi-page.pdf")], FAILED);
    });

    describe("with qpdf", function() {

        before(function() {
            requireTool(this, hasTool("qpdf", ["--version"]), "qpdf not installed");
            requireTool(this, hasPdfinfo(), "pdfinfo (poppler-utils) not installed");
        });

        it("merge should concat multiple files together", async () => {
            const before = mergeDirs().length;
            const merger = new Merger();

            const pdfStream = await merger.merge([fixture("single-page.pdf"), fixture("multi-page.pdf")]);
            const pdf = await streamToBuffer(pdfStream);

            assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
            assert.equal((await pdfInfo(pdf)).pages, 7);
            assert.equal(mergeDirs().length, before, "temporary directory removed");
        });

        it("merge keeps the order of the files", async () => {
            const merger = new Merger();

            // outline.pdf has 300x200 pages, single-page.pdf is A4
            const pdf = await streamToBuffer(await merger.merge([fixture("outline.pdf"), fixture("single-page.pdf")]));

            const info = await pdfInfo(pdf);
            assert.equal(info.pages, 3);
            assert.deepEqual([info.width, info.height], [300, 200]);
        });

        it("merge fails on a file that is not a pdf", async () => {
            const merger = new Merger();

            await assertMergeFails(merger, [fixture("single-page.pdf"), fixture("not-a-pdf.txt")], FAILED);
        });

        it("merge opens a file encrypted with an owner password only, the result is not encrypted", async () => {
            const merger = new Merger();

            const pdf = await streamToBuffer(await merger.merge([fixture("encrypted-owner.pdf"), fixture("form.pdf")]));

            const info = await pdfInfo(pdf);
            assert.equal(info.pages, 3);
            assert.isFalse(info.encrypted);
        });

        it("merge fails on a file that needs a user password", async () => {
            const before = mergeDirs().length;
            const merger = new Merger();

            await assertMergeFails(
                merger,
                [fixture("encrypted-user.pdf"), fixture("form.pdf")],
                /^Failed to merge pdf files: a file is protected by a password$/,
            );
            assert.equal(mergeDirs().length, before, "temporary directory removed");
        });

        it("merge repairs a damaged file instead of failing on qpdf warnings", async () => {
            const merger = new Merger();

            const pdf = await streamToBuffer(await merger.merge([fixture("damaged-xref.pdf"), fixture("form.pdf")]));

            assert.equal((await pdfInfo(pdf)).pages, 3);
        });

        it("merge keeps form fields", async () => {
            const merger = new Merger();

            const pdf = await streamToBuffer(await merger.merge([fixture("outline.pdf"), fixture("form.pdf")]));

            assert.equal((await pdfInfo(pdf)).form, "AcroForm");
        });

    });

});
