import * as fs from "fs";
import * as puppeteer from "puppeteer";
import {Page, PDFOptions} from "puppeteer";
import * as stream from "stream";
import logger from "../logger/Logger";
import IRenderer from "./IRenderer";

export default class Renderer implements IRenderer {

    public async renderFromUrl(url: string, options: any): Promise<fs.ReadStream> {
        const pageCallback = async (page: Page) => {
            await page.goto(url, {waitUntil: "networkidle0"});
        };

        return this.render(pageCallback, options);
    }

    public async renderFromFile(fileContent: string, options: any): Promise<fs.ReadStream> {
        const pageCallback = async (page: Page) => {
            await page.setContent(fileContent);
        };

        return this.render(pageCallback, options);
    }

    private async render(pageCallback: any, options: any): Promise<fs.ReadStream> {
        const browser = await puppeteer.launch({args: ["--no-sandbox", "--disable-setuid-sandbox"]});
        const page = await browser.newPage();
        await pageCallback(page);

        const opts = this.mergeOptions(options);
        logger.info(`Generating pdf with options: ${JSON.stringify(opts)}`);

        await page.emulateMedia("print"); // set 'screen' to display page in non-print view
        const img = await page.pdf(opts);
        await browser.close();

        return this.bufferToStream(img);
    }

    /**
     * Available opts to be found at: https://pptr.dev/#?product=Puppeteer&version=v1.6.1&show=api-pagepdfoptions
     */
    private mergeOptions(custom: any): PDFOptions {
        const defaults = {
            // if path is used - the file will be stored to disk (and should be deleted afterwards manually)
            // path: "./tmp/example.pdf",
            format: "A4",
            printBackground: false,
        };

        return Object.assign(defaults, custom);
    }

    private bufferToStream(buffer: Buffer): any {
        const str = new stream.Duplex();
        str.push(buffer);
        str.push(null);

        return str;
    }

}
