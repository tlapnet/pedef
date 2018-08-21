import * as express from "express";
import * as http from "http";
import logger from "../logger/Logger";
import Router from "./Router";

export default class HttpServer {

    private server: http.Server;

    constructor(private port: number = 8080, private router: Router) {
        this.server = null;
    }

    /**
     * Starts the Http server
     *
     * @return {Promise<void>}
     */
    public start(): Promise<void> {
        const app = express();
        this.router.setUp(app);

        // start the server
        return new Promise((resolve, reject) => {
            this.server = app.listen(this.port, () => {
                logger.info(`HttpServer is listening info on port: ${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the http server gracefully
     *
     * @return {Promise<void>}
     */
    public async stop(): Promise<void> {
        if (this.server !== null) {
            await this.server.close();
            logger.info("HttpServer stopped");
        }

        return;
    }

}
