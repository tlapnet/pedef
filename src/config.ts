export const port: number = parseInt(process.env.PORT ?? "", 10) || 8081;

// Chromium binary used by puppeteer-core. The Docker image ships Debian's "chromium" package.
export const chromiumPath: string = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

// How many pdfs are rendered at once (each render runs its own Chromium); further requests wait
export const maxConcurrentRenders: number = parseInt(process.env.MAX_CONCURRENT_RENDERS ?? "", 10) || 2;

// Upload limits of the multipart endpoints (total size of all files in one request, number of files)
export const uploadMaxMb: number = parseInt(process.env.UPLOAD_MAX_MB ?? "", 10) || 200;
export const uploadMaxFiles: number = parseInt(process.env.UPLOAD_MAX_FILES ?? "", 10) || 100;
