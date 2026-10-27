import {port} from "./config";
import MergeHandler from "./model/handler/MergeHandler";
import RenderHandler from "./model/handler/RenderHandler";
import ThumbnailHandler from "./model/handler/ThumbnailHandler";
import logger from "./model/logger/Logger";
import Merger from "./model/pdf/Merger";
import Renderer from "./model/pdf/Renderer";
import Thumbnailer from "./model/pdf/Thumbnailer";
import HttpServer from "./model/server/HttpServer";
import Router from "./model/server/Router";

// How long running requests may take to finish after SIGTERM/SIGINT (below docker stop's default 10 s)
const SHUTDOWN_TIMEOUT_MS = 8_000;

async function main() {
    const pdfRenderer = new Renderer();
    const renderHandler = new RenderHandler(pdfRenderer);

    const thumbnailer = new Thumbnailer();
    const thumbnailHandler = new ThumbnailHandler(thumbnailer);

    const merger = new Merger();
    const mergerHandler = new MergeHandler(merger);

    const router = new Router(renderHandler, thumbnailHandler, mergerHandler);
    const server = new HttpServer(port, router);

    let stopping = false;
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received.`);
        if (stopping) {
            return;
        }
        stopping = true;

        setTimeout(() => {
            logger.error("Graceful shutdown timed out, exiting.");
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS).unref();

        try {
            await server.stop();
            process.exit(0);
        } catch (e) {
            logger.error(e);
            process.exit(1);
        }
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));

    await server.start();
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
