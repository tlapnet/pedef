import {Readable} from "node:stream";

export default interface IMerger {

    merge(pdfs: string[]): Promise<Readable>;

}
