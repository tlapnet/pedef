import MergeHandler from "./model/handler/MergeHandler";
import RenderHandler from "./model/handler/RenderHandler";
import ThumbnailHandler from "./model/handler/ThumbnailHandler";
import logger from "./model/logger/Logger";
import Merger from "./model/pdf/Merger";
import Renderer from "./model/pdf/Renderer";
import Thumbnailer from "./model/pdf/Thumbnailer";
import HttpServer from "./model/server/HttpServer";
import Router from "./model/server/Router";

async function main() {
    const pdfRenderer = new Renderer();
    const renderHandler = new RenderHandler(pdfRenderer);

    const thumbnailer = new Thumbnailer();
    const thumbnailHandler = new ThumbnailHandler(thumbnailer);

    const merger = new Merger();
    const mergerHandler = new MergeHandler(merger);

    const router = new Router(renderHandler, thumbnailHandler, mergerHandler);
    const server = new HttpServer(parseInt(process.env.PORT, 10) || 8081, router);

    server.start();

    process.on("SIGINT", async () => {
        logger.info("SIGINT received.");
        server.stop();
    });

    process.on("SIGTERM", async () => {
        logger.info("SIGTERM received.");
        process.exit(0);
    });
}

main().catch(logger.error);
