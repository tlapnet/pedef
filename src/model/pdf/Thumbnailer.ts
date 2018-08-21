import * as fs from "fs";
import IThumbnailer from "./IThumbnailer";

export default class Thumbnailer implements IThumbnailer {

    public async create(pdfPath: string): Promise<fs.ReadStream> {
        const imgPath = await this.generate(pdfPath, 0);

        return fs.createReadStream(imgPath);
    }

    private generate(pdfPath: string, page: number): Promise<string> {
        const PDFImage = require("pdf-image").PDFImage;
        const pdfImage = new PDFImage(pdfPath);

        return pdfImage.convertPage(page);
    }

}
