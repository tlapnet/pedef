import {Request, Response} from "express";
import formidable from "formidable";
import {unlink} from "node:fs";
import {Readable} from "node:stream";
import {uploadMaxFiles, uploadMaxMb} from "../../config";
import logger from "../logger/Logger";
import InvalidArgumentError from "./InvalidArgumentError";

export interface IUploadedFile {
    path: string;
    name: string | null;
}

export interface IUpload {
    files: IUploadedFile[];
    options: unknown;
}

// Content types the upload parser understands (same set and order as formidable 1 had)
const SUPPORTED_CONTENT_TYPES = [/octet-stream/i, /urlencoded/i, /multipart/i, /json/i];

export default class BasicHandler {

    protected handleError(e: unknown, res: Response) {
        const message = e instanceof Error ? e.message : String((e as {message?: unknown})?.message ?? e);
        const detail = e instanceof Error && e.stack ? e.stack : message;
        logger.error(`${res.req.method} ${res.req.originalUrl} failed: ${detail}`);

        if (res.headersSent) {
            res.destroy();
            return;
        }

        res.status(500);
        res.send(JSON.stringify({error: message}));
    }

    /**
     * Parses the uploaded form. The uploaded temp files are deleted once the response is finished.
     */
    protected async validateFilesUpload(req: Request, res: Response): Promise<IUpload> {
        const upload = await this.parseUpload(req);
        res.on("close", () => this.removeFiles(upload.files));

        return upload;
    }

    /**
     * Sends the stream as response body; failures while streaming are logged.
     */
    protected sendStream(stream: NodeJS.ReadableStream, res: Response): void {
        stream.on("error", (e: Error) => this.handleError(e, res));
        // pipe() leaves the source open when the client goes away early; a file stream would keep its fd
        res.on("close", () => {
            if (stream instanceof Readable && !stream.readableEnded) {
                stream.destroy();
            }
        });
        stream.pipe(res);
    }

    private parseUpload(req: Request): Promise<IUpload> {
        return new Promise((resolve, reject) => {
            let options: unknown = {};
            let optionsError: Error | null = null;
            const files: IUploadedFile[] = [];

            // A JSON body has already been consumed by express.json(), there is nothing left to parse
            // (formidable 1 used to wait for it forever).
            if (req.readableEnded) {
                return reject(new InvalidArgumentError("No files given"));
            }

            const contentType = req.headers["content-type"];
            const hasBody = req.headers["content-length"] !== undefined
                ? parseInt(req.headers["content-length"], 10) !== 0
                : req.headers["transfer-encoding"] !== undefined;
            if (contentType && hasBody && !SUPPORTED_CONTENT_TYPES.some((re) => re.test(contentType))) {
                req.resume(); // drain the body
                return reject(new Error(`bad content-type header, unknown content-type: ${contentType}`));
            }

            const form = formidable({
                // formidable 1 accepted empty files
                allowEmptyFiles: true,
                minFileSize: 0,
                maxFiles: uploadMaxFiles,
                maxFileSize: uploadMaxMb * 1024 * 1024,
                maxTotalFileSize: uploadMaxMb * 1024 * 1024,
            });

            // "fileBegin" comes in upload order, "file" only once a file is written to disk, which can be
            // out of order (merge must keep the upload order). "end" waits until all files are written.
            form.on("fileBegin", (field: string, file: formidable.File) => {
                files.push({path: file.filepath, name: file.originalFilename});
            });

            form.on("field", (field: string, data: string) => {
                if (field === "options") {
                    try {
                        options = JSON.parse(data);
                    } catch {
                        optionsError ??= new Error("Invalid options provided. It must be valid JSON string.");
                    }
                }
            });

            form.on("error", (e: Error) => {
                this.removeFiles(files);
                reject(optionsError ?? e);
            });

            form.on("end", () => {
                if (optionsError) {
                    this.removeFiles(files);
                    return reject(optionsError);
                }

                if (files.length < 1) {
                    return reject(new InvalidArgumentError("No files given"));
                }

                return resolve({files, options});
            });

            form.parse(req).catch((e: Error) => {
                // usually already delivered through the "error" event above (then this is a no-op)
                this.removeFiles(files);
                reject(optionsError ?? e);
            });
        });
    }

    private removeFiles(files: IUploadedFile[]): void {
        files.forEach((f) => unlink(f.path, (e) => {
            if (e && e.code !== "ENOENT") {
                logger.error(`Failed to remove uploaded file ${f.path}: ${e.message}`);
            }
        }));
    }

}
