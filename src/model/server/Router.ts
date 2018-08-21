import * as express from "express";
import {NextFunction, Request, Response} from "express";
import MergeHandler from "../handler/MergeHandler";
import RenderHandler from "../handler/RenderHandler";
import ThumbnailHandler from "../handler/ThumbnailHandler";
import logger from "../logger/Logger";

export default class Router {

    constructor(
        private renderHandler: RenderHandler,
        private thumbnailHandler: ThumbnailHandler,
        private mergeHandler: MergeHandler,
    ) {
        // just keep handlers
    }

    public setUp(app: any): void {

        app.use(express.json());
        app.use(this.logCall);

        app.get("/ping", async (req: Request, resp: Response) => {
            resp.status(200);
            resp.send("pong");
        });

        app.post("/v1/pdf/from-file", async (req: Request, resp: Response) => {
            await this.renderHandler.renderFromFile(req, resp);
        });

        app.post("/v1/pdf/from-url", async (req: Request, resp: Response) => {
            await this.renderHandler.renderFromUrl(req, resp);
        });

        app.post("/v1/pdf/thumbnail", async (req: Request, resp: Response) => {
            await this.thumbnailHandler.getThumbnail(req, resp);
        });

        app.post("/v1/pdf/merge", async (req: Request, resp: Response) => {
            await this.mergeHandler.mergeFiles(req, resp);
        });
    }

    public logCall(req: Request, res: Response, next: NextFunction): void {
        const reqData = `${req.method} ${req.originalUrl}`;
        logger.info(reqData);

        res.on("finish", () => {
            const respData = `${res.statusCode} ${res.statusMessage};`;
            logger.info(`${reqData} -> ${respData}`);
        });

        next();
    }

}
