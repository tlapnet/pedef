import {Readable} from "node:stream";

export default interface IThumbnailer {

    create(pdfPath: string): Promise<Readable>;

}
