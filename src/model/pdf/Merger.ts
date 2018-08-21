import * as fs from "fs";
import IMerger from "./IMerger";

export default class Merger implements IMerger {

    public merge(pdfs: string[]): Promise<fs.ReadStream> {
        const PDFMerge = require("pdf-merge");

        return PDFMerge(pdfs, {output: "Stream"});
    }

}
