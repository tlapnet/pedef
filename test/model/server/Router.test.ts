import {assert} from "chai";
import {existsSync, readFileSync} from "node:fs";
import {setTimeout as sleep} from "node:timers/promises";
import {Readable} from "node:stream";
import MergeHandler from "../../../src/model/handler/MergeHandler";
import RenderHandler from "../../../src/model/handler/RenderHandler";
import ThumbnailHandler from "../../../src/model/handler/ThumbnailHandler";
import IMerger from "../../../src/model/pdf/IMerger";
import IRenderer from "../../../src/model/pdf/IRenderer";
import IThumbnailer from "../../../src/model/pdf/IThumbnailer";
import HttpServer from "../../../src/model/server/HttpServer";
import Router from "../../../src/model/server/Router";

class FakeRenderer implements IRenderer {
    public calls: Array<{source: string, options: unknown}> = [];
    public error: Error | null = null;

    public async renderFromUrl(url: string, options: unknown): Promise<Readable> {
        return this.render(url, options);
    }

    public async renderFromFile(file: string, options: unknown): Promise<Readable> {
        return this.render(file, options);
    }

    private render(source: string, options: unknown): Readable {
        this.calls.push({source, options});
        if (this.error) {
            throw this.error;
        }
        return Readable.from([Buffer.from("%PDF-fake")]);
    }
}

class FakeThumbnailer implements IThumbnailer {
    public paths: string[] = [];

    public async create(pdfPath: string): Promise<Readable> {
        this.paths.push(pdfPath);
        return Readable.from([Buffer.from("PNG")]);
    }
}

class FakeMerger implements IMerger {
    public calls: Array<{paths: string[], contents: string[]}> = [];

    public async merge(pdfs: string[]): Promise<Readable> {
        this.calls.push({paths: pdfs, contents: pdfs.map((p) => readFileSync(p, "utf-8"))});
        return Readable.from([Buffer.from("%PDF-merged")]);
    }
}

describe("Router (HTTP API)", () => {

    let renderer: FakeRenderer;
    let thumbnailer: FakeThumbnailer;
    let merger: FakeMerger;
    let server: HttpServer;
    let base: string;

    beforeEach(async () => {
        renderer = new FakeRenderer();
        thumbnailer = new FakeThumbnailer();
        merger = new FakeMerger();
        const router = new Router(
            new RenderHandler(renderer), new ThumbnailHandler(thumbnailer), new MergeHandler(merger),
        );
        server = new HttpServer(0, router);
        await server.start();
        base = `http://127.0.0.1:${server.getPort()}`;
    });

    afterEach(async () => {
        await server.stop();
    });

    const form = (files: Record<string, string>, fields: Record<string, string> = {}): FormData => {
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
        Object.entries(files).forEach(([k, v]) => fd.append(k, new Blob([v], {type: "text/html"}), `${k}.html`));
        return fd;
    };

    const post = (path: string, init: RequestInit) => fetch(base + path, {method: "POST", ...init});

    const assertError = async (resp: Response, message: string) => {
        assert.equal(resp.status, 500);
        assert.equal(resp.headers.get("content-type"), "text/html; charset=utf-8");
        assert.equal(await resp.text(), JSON.stringify({error: message}));
    };

    const json = (body: unknown): RequestInit => ({
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });

    for (const path of ["/ping", "/ping/"]) {
        it(`GET ${path} returns pong`, async () => {
            const resp = await fetch(base + path);
            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get("content-type"), "text/html; charset=utf-8");
            assert.equal(await resp.text(), "pong");
        });
    }

    it("unknown routes and methods return 404", async () => {
        assert.equal((await fetch(base + "/nope")).status, 404);
        assert.equal((await fetch(base + "/v1/pdf/merge")).status, 404);
        assert.equal((await post("/ping", {})).status, 404);
    });

    describe("from-url", () => {

        it("requires url", async () => {
            await assertError(await post("/v1/pdf/from-url", json({options: {}})), "Missing 'url' in request");
            await assertError(await post("/v1/pdf/from-url", {}), "Missing 'url' in request");
        });

        it("requires options", async () => {
            await assertError(await post("/v1/pdf/from-url", json({url: "http://x"})), "Missing 'options' in request");
            await assertError(
                await post("/v1/pdf/from-url", json({url: "http://x", options: false})), "Missing 'options' in request",
            );
        });

        it("renders the url with the given options (trailing slash too)", async () => {
            const resp = await post("/v1/pdf/from-url/", json({url: "http://x", options: {format: "A5"}}));

            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get("content-type"), "application/pdf");
            assert.equal(await resp.text(), "%PDF-fake");
            assert.deepEqual(renderer.calls, [{source: "http://x", options: {format: "A5"}}]);
        });

        it("returns renderer errors as 500 with the error message", async () => {
            renderer.error = new Error("net::ERR_NAME_NOT_RESOLVED at http://x");
            await assertError(
                await post("/v1/pdf/from-url", json({url: "http://x", options: {}})),
                "net::ERR_NAME_NOT_RESOLVED at http://x",
            );
        });

        const forbidden = [
            "file:///etc/passwd", "FILE:///etc/passwd", "view-source:http://x", "chrome://version", "not a url",
        ];
        for (const url of forbidden) {
            it(`allows only http and https urls: ${url}`, async () => {
                await assertError(
                    await post("/v1/pdf/from-url", json({url, options: {}})), "Only http and https URLs are allowed",
                );
                assert.deepEqual(renderer.calls, []);
            });
        }

    });

    describe("from-file", () => {

        it("renders the first uploaded file of any field name with options", async () => {
            const resp = await post("/v1/pdf/from-file/", {
                body: form({whatever: "<p>první</p>", second: "<p>2</p>"}, {options: "{\"landscape\":true}"}),
            });

            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get("content-type"), "application/pdf");
            assert.deepEqual(renderer.calls, [{source: "<p>první</p>", options: {landscape: true}}]);
        });

        it("uses empty options by default", async () => {
            await post("/v1/pdf/from-file", {body: form({f: "<p>x</p>"})});
            assert.deepEqual(renderer.calls[0].options, {});
        });

        it("rejects invalid options", async () => {
            await assertError(
                await post("/v1/pdf/from-file", {body: form({f: "<p>x</p>"}, {options: "{bad"})}),
                "Invalid options provided. It must be valid JSON string.",
            );
        });

        it("requires a file", async () => {
            await assertError(await post("/v1/pdf/from-file", {body: form({}, {options: "{}"})}), "No files given");
            await assertError(await post("/v1/pdf/from-file", {}), "No files given");
            await assertError(await post("/v1/pdf/from-file", json({a: 1})), "No files given");
        });

        it("rejects unknown content types like before", async () => {
            await assertError(
                await post("/v1/pdf/from-file", {headers: {"Content-Type": "text/plain"}, body: "x"}),
                "bad content-type header, unknown content-type: text/plain",
            );
        });

    });

    describe("thumbnail", () => {

        it("returns a png and removes the uploaded file afterwards", async () => {
            const resp = await post("/v1/pdf/thumbnail/", {body: form({pdf: "%PDF"})});

            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get("content-type"), "image/png");
            await resp.arrayBuffer();
            await sleep(50);
            assert.lengthOf(thumbnailer.paths, 1);
            assert.isFalse(existsSync(thumbnailer.paths[0]), "uploaded file deleted");
        });

    });

    describe("merge", () => {

        it("merges all uploaded files in order", async () => {
            const resp = await post("/v1/pdf/merge/", {body: form({a: "A", b: "B", c: "C"})});

            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get("content-type"), "application/pdf");
            assert.equal(resp.headers.get("content-disposition"), "attachment; filename=merged.pdf;");
            assert.equal(await resp.text(), "%PDF-merged");
            assert.deepEqual(merger.calls[0].contents, ["A", "B", "C"]);
        });

        it("still accepts a single file (legacy behaviour)", async () => {
            const resp = await post("/v1/pdf/merge", {body: form({a: "A"})});
            assert.equal(resp.status, 200);
            assert.deepEqual(merger.calls[0].contents, ["A"]);
        });

        it("requires a file", async () => {
            await assertError(await post("/v1/pdf/merge", {body: form({}, {a: "b"})}), "No files given");
        });

    });

});
