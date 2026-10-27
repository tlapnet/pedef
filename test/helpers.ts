import {execFile, execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);

// compiled tests live in dist/test/..., the fixtures in <repo>/data
export const dataDir = resolve(__dirname, "../../data");

export function fixture(name: string): string {
    return resolve(dataDir, name);
}

export async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }

    return Buffer.concat(chunks);
}

/**
 * Width and height from the IHDR chunk of a png
 */
export function pngSize(png: Buffer): {width: number, height: number} {
    if (png.subarray(1, 4).toString("ascii") !== "PNG") {
        throw new Error("not a png");
    }

    return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
}

/**
 * Finds a Chromium/Chrome binary to run the renderer tests with (PUPPETEER_EXECUTABLE_PATH wins)
 */
export function findChromium(): string | null {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
    ];

    return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}

/**
 * True when the command runs and exits 0 (e.g. hasTool("qpdf", ["--version"]))
 */
export function hasTool(cmd: string, args: string[]): boolean {
    try {
        execFileSync(cmd, args, {stdio: "ignore"});
        return true;
    } catch {
        return false;
    }
}

export const hasPdfinfo = (): boolean => hasTool("pdfinfo", ["-v"]);

export interface IPdfInfo {
    pages: number;
    // size of the first page in points
    width: number;
    height: number;
    encrypted: boolean;
    // "AcroForm", "XFA" or "none"
    form: string;
}

/**
 * Reads the page count, first page size, encryption and form type of a pdf with pdfinfo (poppler-utils)
 */
export async function pdfInfo(pdf: Buffer): Promise<IPdfInfo> {
    const dir = mkdtempSync(join(tmpdir(), "pedef-test-"));
    try {
        const file = join(dir, "doc.pdf");
        writeFileSync(file, pdf);
        const {stdout} = await execFileAsync("pdfinfo", [file]);
        const field = (name: string): string => new RegExp(`^${name}:\\s+(.*)$`, "m").exec(stdout)?.[1] ?? "";
        const size = /^([\d.]+) x ([\d.]+) pts/.exec(field("Page size"));

        return {
            pages: Number(field("Pages")),
            width: Number(size?.[1]),
            height: Number(size?.[2]),
            encrypted: field("Encrypted").startsWith("yes"),
            form: field("Form"),
        };
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

export function readFixture(name: string): Buffer {
    return readFileSync(fixture(name));
}

/**
 * Skips the suite when an external tool is missing - unless PEDEF_REQUIRE_TOOLS=1 (the Docker build),
 * where a missing tool must fail the build instead of silently skipping the tests.
 */
export function requireTool(ctx: Mocha.Context, available: boolean, reason: string): void {
    if (available) {
        return;
    }
    if (process.env.PEDEF_REQUIRE_TOOLS === "1") {
        throw new Error(`${reason} (PEDEF_REQUIRE_TOOLS=1)`);
    }
    ctx.skip();
}
