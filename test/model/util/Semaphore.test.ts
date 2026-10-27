import {assert} from "chai";
import Semaphore from "../../../src/model/util/Semaphore";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Semaphore", () => {

    it("runs at most max tasks at once and all of them in FIFO order", async () => {
        const semaphore = new Semaphore(2);
        let running = 0;
        let maxRunning = 0;
        const started: number[] = [];

        const results = await Promise.all([0, 1, 2, 3, 4].map((i) => semaphore.run(async () => {
            started.push(i);
            running++;
            maxRunning = Math.max(maxRunning, running);
            await sleep(10);
            running--;
            return i * 10;
        })));

        assert.deepEqual(results, [0, 10, 20, 30, 40]);
        assert.equal(maxRunning, 2);
        assert.deepEqual(started, [0, 1, 2, 3, 4]);
    });

    it("frees the slot when a task fails", async () => {
        const semaphore = new Semaphore(1);

        try {
            await semaphore.run(() => Promise.reject(new Error("boom")));
            assert.fail("run should throw");
        } catch (e) {
            assert.equal((e as Error).message, "boom");
        }

        assert.equal(await semaphore.run(async () => "next"), "next");
    });

    it("rejects a non-positive limit", () => {
        assert.throws(() => new Semaphore(0), /positive integer/);
    });

});
