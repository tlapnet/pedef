// Shared helpers for the black-box HTTP API tests of the pedef service.
// No npm dependencies: only Node built-ins (Node >= 20) and, if present on the
// host, poppler-utils (pdfinfo, pdftotext). Everything poppler does here also
// has a pure-JS fallback, except text extraction (tests skip that check).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

export const BASE_URL = (process.env.PEDEF_URL || "http://127.0.0.1:8081").replace(/\/+$/, "");
export const FIXTURE_HOST = process.env.PEDEF_FIXTURE_HOST || "127.0.0.1";
export const REQUEST_TIMEOUT_MS = Number(process.env.PEDEF_REQUEST_TIMEOUT_MS || 120_000);

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = join(REPO_ROOT, "data");

// Page sizes in PDF points as Chrome emits them (A4 = 210x297 mm, A5 = 148x210 mm).
export const A4 = { width: 595.28, height: 841.89 };
export const A5 = { width: 419.53, height: 595.28 };
// Chrome rounds page sizes to whole CSS px (594.96 x 841.92 for A4), so allow ~2pt.
export const SIZE_TOLERANCE_PT = 2;

// ---------------------------------------------------------------- HTTP ----

export function url(path) {
    return BASE_URL + path;
}

export async function request(path, init = {}) {
    const res = await fetch(url(path), {
        signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS),
        ...init,
    });
    const body = Buffer.from(await res.arrayBuffer());
    return { res, status: res.status, headers: res.headers, body };
}

export function postJson(path, payload, init = {}) {
    return request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        ...init,
    });
}

/**
 * POST multipart/form-data.
 * parts: array of
 *   { name, file: "<path>" | Buffer, filename?, type? }  - file part
 *   { name, value: "<string>" }                          - plain field
 */
export function postMultipart(path, parts, init = {}) {
    const form = new FormData();
    for (const p of parts) {
        if ("value" in p) {
            form.append(p.name, p.value);
            continue;
        }
        const data = Buffer.isBuffer(p.file) ? p.file : readFileSync(p.file);
        const filename = p.filename ?? (Buffer.isBuffer(p.file) ? "upload.bin" : p.file.split("/").pop());
        form.append(p.name, new Blob([data], { type: p.type ?? guessType(filename) }), filename);
    }
    return request(path, { method: "POST", body: form, ...init });
}

function guessType(name) {
    if (name.endsWith(".pdf")) return "application/pdf";
    if (name.endsWith(".html")) return "text/html";
    return "application/octet-stream";
}

export function dataFile(name) {
    return join(DATA_DIR, name);
}

/** Parse an error response body: legacy returns `{"error": "<message>"}` with HTTP 500. */
export function parseErrorBody(body) {
    const text = body.toString("utf8");
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`error body is not JSON: ${JSON.stringify(text.slice(0, 300))}`);
    }
}

// ---------------------------------------------------------------- PNG -----

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width/height/bitDepth/colorType from the IHDR chunk (always the first chunk). */
export function pngInfo(buf) {
    if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error("not a PNG");
    }
    if (buf.toString("latin1", 12, 16) !== "IHDR") {
        throw new Error("PNG without leading IHDR chunk");
    }
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        bitDepth: buf[24],
        colorType: buf[25],
    };
}

// ---------------------------------------------------------------- PDF -----

export function isPdf(buf) {
    return buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

function hasTool(name) {
    try {
        execFileSync("which", [name], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

// PEDEF_PDF_TOOL=js forces the pure-JS parser even when poppler is installed.
const forceJs = process.env.PEDEF_PDF_TOOL === "js";
export const HAVE_PDFINFO = !forceJs && hasTool("pdfinfo");
export const HAVE_PDFTOTEXT = !forceJs && hasTool("pdftotext");

function withTempPdf(buf, fn) {
    const dir = mkdtempSync(join(tmpdir(), "pedef-test-"));
    const file = join(dir, "doc.pdf");
    try {
        writeFileSync(file, buf);
        return fn(file);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * { pages, width, height, encrypted, form } of a PDF (size of page 1, in points,
 * rotation ignored; form is "AcroForm", "XFA" or "none").
 * Uses pdfinfo when available, otherwise a minimal JS parser.
 */
export function pdfInfo(buf) {
    if (HAVE_PDFINFO) {
        const out = withTempPdf(buf, (f) => execFileSync("pdfinfo", [f], { encoding: "utf8" }));
        const pages = Number(/^Pages:\s+(\d+)/m.exec(out)?.[1]);
        const size = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(out);
        const encrypted = /^Encrypted:\s+yes/m.test(out);
        const form = /^Form:\s+(\S+)/m.exec(out)?.[1];
        return { pages, width: Number(size?.[1]), height: Number(size?.[2]), encrypted, form };
    }
    return pdfInfoJs(buf);
}

/**
 * The PDF as latin1 text with the content of compressed object streams (/ObjStm)
 * appended, so that object dictionaries can be searched with regular expressions.
 */
export function pdfObjectsText(buf) {
    const raw = buf.toString("latin1");
    let text = raw;
    const streamRe = /<<((?:(?!>>\s*stream)[\s\S])*?)>>\s*stream\r?\n/g;
    let m;
    while ((m = streamRe.exec(raw))) {
        const dict = m[1];
        if (!/\/Type\s*\/ObjStm/.test(dict)) continue;
        const start = m.index + m[0].length;
        const lenMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
        const end = lenMatch ? start + Number(lenMatch[1]) : raw.indexOf("endstream", start);
        try {
            text += "\n" + inflateSync(buf.subarray(start, end)).toString("latin1");
        } catch {
            // not flate or corrupt - ignore, best effort
        }
    }
    return text;
}

/**
 * Pure-JS page count / first MediaBox / encryption / form. Handles classic PDFs
 * (Skia/Chrome, pdftk, qpdf) and PDFs whose objects live in compressed object
 * streams. Not for encrypted input: their object streams cannot be read.
 */
export function pdfInfoJs(buf) {
    const text = pdfObjectsText(buf);
    const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);
    const width = box ? Number(box[3]) - Number(box[1]) : NaN;
    const height = box ? Number(box[4]) - Number(box[2]) : NaN;
    const encrypted = /\/Encrypt\s*(?:<<|\d+\s+\d+\s+R)/.test(text);
    const form = /\/AcroForm\b/.test(text) ? "AcroForm" : "none";
    return { pages, width, height, encrypted, form };
}

/** Extracted text of the PDF, or null when pdftotext is not available. */
export function pdfText(buf) {
    if (!HAVE_PDFTOTEXT) return null;
    return withTempPdf(buf, (f) => execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }));
}

/**
 * Builds a minimal, valid PDF (with a correct xref table) of `pages` pages of
 * width x height points, each with a filled rectangle so it is not blank.
 */
export function makePdf({ width, height, pages = 1 }) {
    const objs = [];
    const pageIds = [];
    // 1 = catalog, 2 = pages, then (page, content) pairs
    for (let i = 0; i < pages; i++) pageIds.push(3 + i * 2);
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
    for (let i = 0; i < pages; i++) {
        const pageId = pageIds[i];
        const content = `0 0 1 rg 10 10 ${width / 2} ${height / 2} re f`;
        objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${pageId + 1} 0 R >>`;
        objs[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    }
    let out = "%PDF-1.4\n";
    const offsets = [];
    for (let id = 1; id < objs.length; id++) {
        offsets[id] = out.length;
        out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
}

export function assertClose(assert, actual, expected, tolerance, what) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${what}: expected ${expected} +-${tolerance}, got ${actual}`,
    );
}

// ------------------------------------------------------ fixture server ----

/**
 * Starts an HTTP server on 0.0.0.0:<random> serving the given { "/path": html } map.
 * Returns { baseUrl, close } where baseUrl uses PEDEF_FIXTURE_HOST, i.e. the
 * address under which the service (container) can reach this process.
 */
export async function startFixtureServer(pages) {
    const server = createServer((req, res) => {
        const html = pages[req.url.split("?")[0]];
        if (html === undefined) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("not found");
            return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "0.0.0.0", resolve);
    });
    const { port } = server.address();
    return {
        baseUrl: `http://${FIXTURE_HOST}:${port}`,
        close: () => new Promise((resolve) => {
            server.closeAllConnections?.();
            server.close(() => resolve());
        }),
    };
}
