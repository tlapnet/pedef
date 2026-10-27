import {execFile} from "node:child_process";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import {promisify} from "node:util";
import logger from "../logger/Logger";
import IThumbnailer from "./IThumbnailer";

const execFileAsync = promisify(execFile);

export default class Thumbnailer implements IThumbnailer {

    // 72 dpi = 1 px per PDF point, the ImageMagick default the service used before (A4 -> 595x842 px)
    private static readonly RESOLUTION = 72;

    constructor(private pdftoppm: string = "pdftoppm") {
    }

    public async create(pdfPath: string): Promise<Readable> {
        const dir = await mkdtemp(join(tmpdir(), "pedef-thumb-"));
        try {
            const img = await this.generate(pdfPath, dir);

            return Readable.from([img]);
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    }

    /**
     * Renders the first page of the pdf as png and returns its content
     */
    private async generate(pdfPath: string, dir: string): Promise<Buffer> {
        const outBase = join(dir, "thumb");
        const res = String(Thumbnailer.RESOLUTION);
        try {
            await execFileAsync(
                this.pdftoppm,
                ["-png", "-r", res, "-f", "1", "-l", "1", "-singlefile", pdfPath, outBase],
                {timeout: 60_000},
            );
        } catch (e) {
            const err = e as Error & {stderr?: string};
            logger.error(`pdftoppm failed: ${err.message} ${err.stderr ?? ""}`);
            throw new Error("Failed to convert page to image", {cause: e});
        }

        return readFile(`${outBase}.png`);
    }

}
