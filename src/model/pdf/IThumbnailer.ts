import * as fs from "fs";

export default interface IThumbnailer {

    create(pdfPath: string): Promise<fs.ReadStream>;

}
