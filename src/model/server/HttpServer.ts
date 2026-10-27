import express from "express";
import * as http from "node:http";
import {AddressInfo} from "node:net";
import logger from "../logger/Logger";
import Router from "./Router";

export default class HttpServer {

    private server: http.Server | null = null;

    constructor(private port: number = 8081, private router: Router) {
    }

    /**
     * Starts the Http server
     */
    public start(): Promise<void> {
        const app = express();
        this.router.setUp(app);

        return new Promise((resolve, reject) => {
            const server = app.listen(this.port, (err?: Error) => {
                if (err) {
                    return reject(err);
                }
                logger.info(`HttpServer is listening info on port: ${this.getPort()}`);
                resolve();
            });
            // Node >= 18 aborts requests after 300 s; long renders/merges must not be cut (Node 13 had no
            // limit), the timeout belongs to the reverse proxy and the client
            server.requestTimeout = 0;
            this.server = server;
        });
    }

    /**
     * Stops the http server gracefully: stops accepting connections and waits for running requests
     */
    public stop(): Promise<void> {
        const server = this.server;
        if (server === null) {
            return Promise.resolve();
        }
        this.server = null;

        return new Promise((resolve, reject) => {
            server.close((err?: Error) => {
                if (err) {
                    return reject(err);
                }
                logger.info("HttpServer stopped");
                resolve();
            });
            server.closeIdleConnections();
        });
    }

    /**
     * The port the server is listening on (useful when started on port 0)
     */
    public getPort(): number {
        const address = this.server?.address();

        return address && typeof address === "object" ? (address as AddressInfo).port : this.port;
    }

}
