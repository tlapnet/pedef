import {Request, Response} from "express";
import {readFile} from "node:fs/promises";
import IRenderer from "../pdf/IRenderer";
import BasicHandler from "./BasicHandler";
import InvalidArgumentError from "./InvalidArgumentError";

const ALLOWED_URL_PROTOCOLS = ["http:", "https:"];

export default class RenderHandler extends BasicHandler {

    constructor(private renderer: IRenderer) {
        super();
    }

    public async renderFromUrl(req: Request, resp: Response): Promise<void> {
        try {
            this.validateUrlRequest(req);
            const pdfStream = await this.renderer.renderFromUrl(req.body.url, req.body.options);

            resp.setHeader("Content-Type", "application/pdf");
            this.sendStream(pdfStream, resp);
        } catch (e) {
            this.handleError(e, resp);
        }
    }

    public async renderFromFile(req: Request, resp: Response): Promise<void> {
        try {
            const {files, options} = await this.validateFilesUpload(req, resp);
            const pdfStream = await this.renderer.renderFromFile(await this.readHtmlFile(files[0].path), options);

            resp.setHeader("Content-Type", "application/pdf");
            this.sendStream(pdfStream, resp);
        } catch (e) {
            this.handleError(e, resp);
        }
    }

    private validateUrlRequest(req: Request): void {
        if (!req.body || !req.body.url) {
            throw new InvalidArgumentError("Missing 'url' in request");
        }

        if (!req.body || !req.body.options) {
            throw new InvalidArgumentError("Missing 'options' in request");
        }

        // Chromium would happily open file:// (or chrome://, view-source:, ...) and return local files
        if (!URL.canParse(req.body.url) || !ALLOWED_URL_PROTOCOLS.includes(new URL(req.body.url).protocol)) {
            throw new InvalidArgumentError("Only http and https URLs are allowed");
        }
    }

    private async readHtmlFile(path: string): Promise<string> {
        return readFile(path, "utf-8");
    }

}
