import * as fs from "fs";

export default interface IMerger {

    merge(pdfs: string[]): Promise<fs.ReadStream>;

}
