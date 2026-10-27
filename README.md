# PeDeF

A microservice that generates PDF files from HTML (headless Chromium), merges PDF files
and renders PDF thumbnails.

## API

All paths also work with a trailing slash (`/v1/pdf/from-url/`).

### `GET /ping`

Returns `200` with the body `pong` when the service is running.

### `POST /v1/pdf/from-url`

Renders a web page to PDF. JSON body; both `url` and `options` are required (use `{}` for defaults):

```json
{
  "url": "https://www.example.com",
  "options": {}
}
```

```sh
curl -X POST -H 'Content-Type: application/json' \
  -d '{"url": "https://www.example.com", "options": {"format": "A5"}}' \
  http://localhost:8081/v1/pdf/from-url -o page.pdf
```

Only `http` and `https` URLs are accepted. The page is loaded with print media emulation and
rendered once the network is idle.

### `POST /v1/pdf/from-file`

Renders an uploaded HTML file to PDF. `multipart/form-data` upload; the field name of the file does
not matter, only the first file is used. The optional form field `options` holds the
[renderer options](#renderer-options) as a JSON string.

```sh
curl -F file=@page.html -F 'options={"format": "A5", "landscape": true}' \
  http://localhost:8081/v1/pdf/from-file -o page.pdf
```

### `POST /v1/pdf/thumbnail`

Returns a PNG image (`image/png`) of the first page of the uploaded PDF file, at 72 dpi
(1 px per PDF point, an A4 page gives 595×842 px). Only the first uploaded file is used.

```sh
curl -F file=@document.pdf http://localhost:8081/v1/pdf/thumbnail -o thumbnail.png
```

### `POST /v1/pdf/merge`

Merges all uploaded PDF files into one, in upload order. The response has
`Content-Disposition: attachment; filename=merged.pdf;`. A single uploaded file is returned unchanged.

- Files protected only by an owner password (restrictions on printing, copying, …) are merged and the
  result is not encrypted. Files that need a password to be opened are rejected
  (`Failed to merge pdf files: a file is protected by a password`).
- Slightly damaged files are repaired when possible.
- Form fields are kept; bookmarks (outlines) are not.

```sh
curl -F file1=@a.pdf -F file2=@b.pdf http://localhost:8081/v1/pdf/merge -o merged.pdf
```

### Errors

Every error is returned as HTTP `500` with a JSON body:

```json
{"error": "No files given"}
```

| Message | Cause |
|---|---|
| `Missing 'url' in request` | `from-url` without `url` |
| `Missing 'options' in request` | `from-url` without `options` |
| `Only http and https URLs are allowed` | `from-url` with another scheme (`file:`, …) or an invalid URL |
| `Invalid options provided. It must be valid JSON string.` | the `options` form field is not valid JSON |
| `No files given` | an upload endpoint received no file (or a non-multipart body) |

Other messages come from Chromium or the PDF tools (unreachable URL, invalid PDF, upload too big, …).
A malformed JSON body sent to `from-url` gets `400 Bad Request`.

### Renderer options

`options` are passed to Puppeteer's
[`page.pdf()`](https://pptr.dev/api/puppeteer.pdfoptions). PeDeF sets the defaults
`"format": "A4"` and `"printBackground": false`; everything else uses Puppeteer's defaults.
The options `path` (the PDF is always returned in the response) and `timeout` are ignored.

Commonly used options:

```json
{
    "format": "A4",
    "landscape": false,
    "printBackground": false,
    "displayHeaderFooter": false,
    "margin": {"top": "0cm", "bottom": "0cm", "left": "0cm", "right": "0cm"},
    "headerTemplate": "",
    "footerTemplate": "",
    "pageRanges": ""
}
```

To use a header or footer, set `displayHeaderFooter: true` and margins big enough to hold the
templates. Templates can use the placeholders `pageNumber`, `totalPages`, `date`, `title` and `url`
as CSS classes:

```json
{
    "pageRanges": "1-2",
    "format": "A4",
    "displayHeaderFooter": true,
    "margin": {"top": "3cm", "bottom": "3cm"},
    "headerTemplate": "<p style='font-size: 20px;'>Printed on: <span class='date'></span></p>",
    "footerTemplate": "<p style='font-size: 20px;'>Page <span class='pageNumber'></span>/<span class='totalPages'></span></p>"
}
```

## Running with Docker

```sh
docker run -d -p 8081:8081 pedef:<tag>
```

The image contains everything the service needs (Node.js, Chromium, poppler-utils, qpdf, fonts incl.
Czech, CJK, Thai and Arabic) and downloads nothing at start; only `from-url` needs network access to the
rendered page. It runs as the unprivileged user `node` and has a healthcheck on `/ping`.

| Environment variable | Default | Meaning |
|---|---|---|
| `PORT` | `8081` | HTTP port |
| `NODE_ENV` | `production` | `debug` enables debug logging |
| `MAX_CONCURRENT_RENDERS` | `2` | PDFs rendered at once (each runs its own Chromium, 100–200 MB); further requests wait |
| `UPLOAD_MAX_MB` | `200` | maximum total size of the files in one upload |
| `UPLOAD_MAX_FILES` | `100` | maximum number of files in one upload |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | Chromium binary |

The service logs one line per request to stdout. It has no request timeout of its own; set one in the
reverse proxy or client. On `SIGTERM` it stops accepting connections and lets running requests finish
(up to 8 s).

Memory: plan for about 200 MB per concurrent render on top of ~50 MB idle.

### Security

- The service has no authentication. `from-url` loads any http(s) URL the caller sends, from the
  network the container runs in. Don't expose it publicly without access control (IP allowlist, auth
  in the reverse proxy).
- Chromium runs with `--no-sandbox` (its sandbox doesn't work in a default Docker container). It
  renders untrusted HTML, so a Chromium exploit would control the container – keep the container
  unprivileged and isolated.

### Upgrading from the 2019 image (1.x)

The HTTP API is unchanged. What is different for operators:

- The container runs as user `node` (uid 1000), not root. Mounted volumes must be accessible to it.
- There is no `entrypoint.sh` and no `npm`/TypeScript build in the image; the command is
  `node dist/src/index.js`. Overriding the command with `npm start` and mounted sources no longer works.
- Nothing is downloaded at start, so the container starts in seconds and works without internet
  access (except `from-url`, which needs the target page).
- Chromium 79 → 156: page layout and page breaks of existing HTML templates may shift. Compare the
  output of your real templates before switching production.
- `from-url` accepts only http(s) URLs; the `timeout` render option is ignored.
- Merge uses qpdf instead of pdftk: bookmarks of the merged files are no longer kept, PDFs encrypted
  with AES-256 owner passwords now merge, error messages differ.
- Renders are queued (`MAX_CONCURRENT_RENDERS`) and uploads are limited (`UPLOAD_MAX_MB`, `UPLOAD_MAX_FILES`).
- Log lines are no longer coloured (unless on a terminal).
- Makefile: there is no default registry and the image tag is `git describe`, not `master`
  (see [Docker image](#docker-image)). The `docker-dev` target is gone; develop with `npm` directly.

## Development

Requirements: Node.js 22.12+ (the image uses Node.js 24). Some unit tests need a Chromium/Chrome
binary, poppler-utils and qpdf; they are skipped when the tools are missing, or fail with
`PEDEF_REQUIRE_TOOLS=1` (the Docker build sets it).

```sh
npm ci
npm run build                 # TypeScript -> dist/
npm run lint                  # ESLint
npm test                      # unit tests (mocha)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome npm start
```

### Docker image

```sh
make docker-build             # builds pedef:<git describe>; runs lint + unit tests
make docker-test              # black-box API tests against that image
make docker-start             # runs it on http://localhost:8081
make docker-push DOCKER_REGISTRY=registry.example.com/team
```

Override the tag with `DOCKER_TAG=2.0.0`. With `DOCKER_REGISTRY` set, all targets use
`<registry>/pedef:<tag>`.

### API tests

`test/api/` contains black-box HTTP tests of the whole API (no npm dependencies, Node.js built-in test
runner). Against an image (started with `--network host`, removed afterwards):

```sh
test/api/run-against-image.sh pedef:2.0.0
```

Against a running instance:

```sh
PEDEF_URL=http://127.0.0.1:8081 node --test test/api/*.test.mjs
```

The `from-url` tests start a local HTTP server; if the service can't reach the test machine on
`127.0.0.1`, set `PEDEF_FIXTURE_HOST` to an address it can reach. Text and page-order checks need
`pdfinfo`/`pdftotext` (poppler-utils) and are skipped without them.

`PEDEF_LEGACY=1` skips the tests of behaviour fixed after the 2019 image, so the suite can be run
against it as a reference. GitHub Actions builds the image and runs the suite on every push and pull
request.
