import {Readable} from "node:stream";

export default interface IRenderer {

    renderFromUrl(url: string, options: unknown): Promise<Readable>;

    renderFromFile(file: string, options: unknown): Promise<Readable>;

}
