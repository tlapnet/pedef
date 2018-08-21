import {Request, Response} from "express";
import * as formidable from "formidable";
import InvalidArgumentError from "./InvalidArgumentError";

export default class BasicHandler {

    protected handleError(e: Error, res: Response) {
        res.status(500);
        res.send(JSON.stringify({error: e.message}));
    }

    protected async validateFilesUpload(req: Request): Promise<any> {
        return new Promise((resolve: any, reject: any) => {
            let options: any = {};
            const files: File[] = [];
            const form = new formidable.IncomingForm();

            form.on("error", (e: any) => {
                return reject(e);
            });

            form.on("file", (field: string, file: File) => {
                files.push(file);
            });

            form.on("field", (field: string, data: any) => {
                if (field === "options") {
                    try {
                        options = JSON.parse(data);
                    } catch (e) {
                        return reject(new Error("Invalid options provided. It must be valid JSON string."));
                    }
                }
            });

            form.on("end", () => {
                if (files.length < 1) {
                    return reject(new InvalidArgumentError("No files given"));
                }

                return resolve({files, options});
            });

            form.parse(req);
        });
    }

}
