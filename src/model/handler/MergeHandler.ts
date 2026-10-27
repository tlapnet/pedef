import {Request, Response} from "express";
import IMerger from "../pdf/IMerger";
import BasicHandler from "./BasicHandler";

export default class MergeHandler extends BasicHandler {

    constructor(
        private merger: IMerger,
    ) {
        super();
    }

    public async mergeFiles(req: Request, resp: Response): Promise<void> {
        try {
            const pdfs = await this.getFiles(req, resp);
            const pdfStream = await this.merger.merge(pdfs);

            resp.setHeader("Content-Type", "application/pdf");
            resp.setHeader("Content-Disposition", "attachment; filename=merged.pdf;");
            this.sendStream(pdfStream, resp);
        } catch (e) {
            this.handleError(e, resp);
        }
    }

    private async getFiles(req: Request, resp: Response): Promise<string[]> {
        const {files} = await this.validateFilesUpload(req, resp);
        // A single file is accepted and returned unchanged. The original code meant to require 2 files,
        // but checked the nonexistent "files.len", so the check never fired; clients may rely on that.

        return files.map((f) => f.path);
    }

}
