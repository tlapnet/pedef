import {Request, Response} from "express";
import IThumbnailer from "../pdf/IThumbnailer";
import BasicHandler from "./BasicHandler";

export default class ThumbnailHandler extends BasicHandler {

    constructor(
        private thumbnailer: IThumbnailer,
    ) {
        super();
    }

    public async getThumbnail(req: Request, resp: Response): Promise<void> {
        try {
            const { files } = await this.validateFilesUpload(req);
            const imgStream = await this.thumbnailer.create(files[0].path);

            resp.setHeader("Content-Type", "image/png");
            imgStream.pipe(resp);
        } catch (e) {
            this.handleError(e, resp);
        }
    }

}
