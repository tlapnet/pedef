import {Request, Response} from "express";
import {File} from "formidable";
import IMerger from "../pdf/IMerger";
import BasicHandler from "./BasicHandler";
import InvalidArgumentError from "./InvalidArgumentError";

export default class MergeHandler extends BasicHandler {

    constructor(
        private merger: IMerger,
    ) {
        super();
    }

    public async mergeFiles(req: Request, resp: Response): Promise<void> {
        try {
            const pdfs = await this.getFiles(req);
            const pdfStream = await this.merger.merge(pdfs);

            resp.setHeader("Content-Type", "application/pdf");
            resp.setHeader("Content-Disposition", "attachment; filename=merged.pdf;");
            pdfStream.pipe(resp);
        } catch (e) {
            this.handleError(e, resp);
        }
    }

    private async getFiles(req: Request): Promise<string[]> {
        const { files } = await this.validateFilesUpload(req);
        if (files.len < 2) {
            throw new InvalidArgumentError("Please upload at least 2 files to merge.");
        }

        const paths: string[] = [];
        files.forEach((f: File) => {
            paths.push(f.path);
        });

        return paths;
    }

}
