import * as fs from "fs";

export default interface IRenderer {

    renderFromUrl(url: string, options: any): Promise<fs.ReadStream>;

    renderFromFile(file: string, options: any): Promise<fs.ReadStream>;

}
