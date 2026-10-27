/**
 * Limits how many tasks run at once; the others wait in a FIFO queue
 */
export default class Semaphore {

    private active = 0;
    private waiting: Array<() => void> = [];

    constructor(private readonly max: number) {
        if (!Number.isInteger(max) || max < 1) {
            throw new Error(`Semaphore needs a positive integer, got ${max}`);
        }
    }

    public async run<T>(task: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await task();
        } finally {
            this.release();
        }
    }

    private async acquire(): Promise<void> {
        if (this.active < this.max) {
            this.active++;
            return;
        }

        // the slot is handed over by release(), active stays the same
        await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    private release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
        } else {
            this.active--;
        }
    }

}
