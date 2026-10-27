// GET /ping, unknown routes, wrong methods.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { request } from "./helpers.mjs";

describe("GET /ping", () => {
    test("returns 200 with body 'pong'", async () => {
        const { status, body } = await request("/ping");
        assert.equal(status, 200);
        assert.equal(body.toString("utf8"), "pong");
    });

    test("trailing slash variant /ping/ also returns 'pong'", async () => {
        const { status, body } = await request("/ping/");
        assert.equal(status, 200);
        assert.equal(body.toString("utf8"), "pong");
    });
});

describe("unknown routes", () => {
    test("GET of an unknown path returns 404", async () => {
        const { status } = await request("/definitely-not-a-route");
        assert.equal(status, 404);
    });

    test("POST of an unknown path returns 404", async () => {
        const { status } = await request("/v1/pdf/nope", { method: "POST" });
        assert.equal(status, 404);
    });

    test("old /v1/pdf prefix without action returns 404", async () => {
        const { status } = await request("/v1/pdf", { method: "POST" });
        assert.equal(status, 404);
    });

    for (const path of ["/v1/pdf/from-url", "/v1/pdf/from-file", "/v1/pdf/thumbnail", "/v1/pdf/merge"]) {
        test(`GET ${path} (POST-only route) returns 404`, async () => {
            const { status } = await request(path);
            assert.equal(status, 404);
        });
    }
});
