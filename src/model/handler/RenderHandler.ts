import {Request, Response} from "express";
import * as fs from "fs";
import IRenderer from "../pdf/IRenderer";
import BasicHandler from "./BasicHandler";
import InvalidArgumentError from "./InvalidArgumentError";

export default class RenderHandler extends BasicHandler {

    constructor(private renderer: IRenderer) {
        super();
    }

    public async renderFromUrl(req: Request, resp: Response): Promise<void> {
        try {
            this.validateUrlRequest(req);
            const pdfStream = await this.renderer.renderFromUrl(req.body.url, req.body.options);

            resp.setHeader("Content-Type", "application/pdf");
            pdfStream.pipe(resp);
        } catch (e) {
            this.handleError(e, resp);
        }
    }

    public async renderFromFile(req: Request, resp: Response): Promise<void> {
        try {
            const {files, options} = await this.validateFilesUpload(req);
            const pdfStream = await this.renderer.renderFromFile(await this.readHtmlFile(files[0].path), options);

            resp.setHeader("Content-Type", "application/pdf");
            pdfStream.pipe(resp);
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
    }

    private readHtmlFile(path: string): Promise<any> {
        return new Promise((resolve, reject) => {
            fs.readFile(path, (err: Error, data: Buffer) => {
                if (err) {
                    return reject(err);
                }

                return resolve(data.toString("utf-8"));
            });
        });
    }

}
