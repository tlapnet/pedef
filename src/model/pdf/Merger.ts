import {execFile} from "node:child_process";
import {mkdtemp, open, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import {promisify} from "node:util";
import logger from "../logger/Logger";
import IMerger from "./IMerger";

const execFileAsync = promisify(execFile);

export default class Merger implements IMerger {

    private static readonly ERROR = "Failed to merge pdf files";

    constructor(private qpdf: string = "qpdf") {
    }

    public async merge(pdfs: string[]): Promise<Readable> {
        if (pdfs.length === 0) {
            throw new Error("No files were submitted for merging.");
        }

        // A single file is returned unchanged (byte for byte), as the former pdf-merge library did.
        if (pdfs.length === 1) {
            return Readable.from([await readFile(pdfs[0])]);
        }

        const dir = await mkdtemp(join(tmpdir(), "pedef-merge-"));
        try {
            const out = join(dir, "merged.pdf");
            await this.run(pdfs, out);
            // The open file stays readable after its directory is removed, so the result is streamed
            // from disk instead of being loaded into memory; the stream closes the file when it ends.
            const file = await open(out);

            return file.createReadStream();
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    }

    /**
     * qpdf --empty --pages a.pdf b.pdf ... -- out.pdf
     *
     * --empty             the pages of all files are copied the same way; no document-level data (outlines,
     *                     metadata, encryption) is taken over from the first file
     * --warning-exit-0    exit 0 instead of 3 when qpdf had to repair a damaged but readable input
     *
     * Files encrypted with an owner password only are opened (the user password is empty) and the output
     * is not encrypted; files that need a user password to open fail with "invalid password".
     */
    private async run(pdfs: string[], out: string): Promise<void> {
        try {
            const {stderr} = await execFileAsync(
                this.qpdf,
                ["--warning-exit-0", "--empty", "--pages", ...pdfs, "--", out],
                {timeout: 120_000, maxBuffer: 16 * 1024 * 1024},
            );
            if (stderr) {
                logger.warn(`qpdf: ${stderr}`);
            }
        } catch (e) {
            const err = e as Error & {stderr?: string};
            logger.error(`qpdf failed: ${err.message} ${err.stderr ?? ""}`);
            const reason = /invalid password/.test(err.stderr ?? "") ? ": a file is protected by a password" : "";
            throw new Error(`${Merger.ERROR}${reason}`, {cause: e});
        }
    }

}
