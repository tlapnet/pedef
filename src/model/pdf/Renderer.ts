import puppeteer, {Browser, Page, PDFOptions} from "puppeteer-core";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import {chromiumPath, maxConcurrentRenders} from "../../config";
import logger from "../logger/Logger";
import Semaphore from "../util/Semaphore";
import IRenderer from "./IRenderer";

type PageCallback = (page: Page) => Promise<void>;

export default class Renderer implements IRenderer {

    // every render starts its own Chromium (100-200 MB), the rest of the requests wait for a slot
    private slots: Semaphore;

    constructor(private executablePath: string = chromiumPath, maxConcurrent: number = maxConcurrentRenders) {
        this.slots = new Semaphore(maxConcurrent);
    }

    public async renderFromUrl(url: string, options: unknown): Promise<Readable> {
        const pageCallback = async (page: Page) => {
            await page.goto(url, {waitUntil: "networkidle0"});
        };

        return this.render(pageCallback, options);
    }

    public async renderFromFile(fileContent: string, options: unknown): Promise<Readable> {
        const pageCallback = async (page: Page) => {
            await page.setContent(fileContent);
        };

        return this.render(pageCallback, options);
    }

    private render(pageCallback: PageCallback, options: unknown): Promise<Readable> {
        return this.slots.run(() => this.renderInBrowser(pageCallback, options));
    }

    private async renderInBrowser(pageCallback: PageCallback, options: unknown): Promise<Readable> {
        // Chromium leaves some temp directories behind, give it its own TMPDIR and remove it afterwards
        const tmp = await mkdtemp(join(tmpdir(), "pedef-chromium-"));
        let browser: Browser;
        try {
            browser = await this.launch(tmp);
        } catch (e) {
            await rm(tmp, {recursive: true, force: true});
            throw e;
        }

        try {
            const page = await browser.newPage();
            await pageCallback(page);

            const opts = this.mergeOptions(options);
            logger.info(`Generating pdf with options: ${JSON.stringify(opts)}`);

            await page.emulateMediaType("print"); // set 'screen' to display page in non-print view
            const pdf = await page.pdf(opts);

            return Readable.from([Buffer.from(pdf)]);
        } finally {
            // always close the browser, otherwise a failed render leaks a Chromium process
            await browser.close().catch((e: Error) => logger.error(`Failed to close browser: ${e.message}`));
            await rm(tmp, {recursive: true, force: true});
        }
    }

    private launch(tmp: string): Promise<Browser> {
        return puppeteer.launch({
            executablePath: this.executablePath,
            env: {...process.env, TMPDIR: tmp},
            headless: true,
            // shutdown is handled in index.ts; the browser is closed after every render and killed on exit
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                // Docker limits /dev/shm to 64 MB, which is not enough for bigger pages
                "--disable-dev-shm-usage",
            ],
        });
    }

    /**
     * Available opts to be found at: https://pptr.dev/api/puppeteer.pdfoptions
     */
    private mergeOptions(custom: unknown): PDFOptions {
        const defaults: PDFOptions = {
            // if path is used - the file will be stored to disk (and should be deleted afterwards manually)
            // path: "./tmp/example.pdf",
            format: "A4",
            printBackground: false,
        };

        const opts: PDFOptions = Object.assign(defaults, custom);
        // the pdf is always returned in the response; never let a client write files on the server
        delete opts.path;
        // the render timeout is ours (puppeteer's default); a client could switch it off with 0
        delete opts.timeout;

        return opts;
    }

}
