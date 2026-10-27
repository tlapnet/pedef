# syntax=docker/dockerfile:1

# Node.js 24 LTS on Debian 13 (trixie). The digest pins the exact multi-arch image; the image is named
# directly in FROM (not via ARG) so that Dependabot can update it.
FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS node

# ---- base: OS packages the service needs at runtime (the unit tests need them too) -------------------
FROM node AS base

# chromium      - renders the pdfs (driven by puppeteer-core)
# poppler-utils - pdftoppm renders thumbnails (pdfinfo is used by the unit tests)
# qpdf          - merges pdfs
# tini          - PID 1: forwards signals and reaps Chromium zombie processes
# fonts         - Latin incl. Czech diacritics (DejaVu, Liberation, FreeFont) and major non-latin
#                 scripts (Japanese, Chinese, Thai, Arabic)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        poppler-utils \
        qpdf \
        tini \
        fonts-dejavu-core \
        fonts-liberation \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-wqy-zenhei \
        fonts-thai-tlwg \
        fonts-kacst-one \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ---- build: compile TypeScript, lint and run the unit tests ---------------------------------------
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json eslint.config.mjs .mocharc.json ./
COPY src ./src
COPY test ./test
COPY data ./data
# PEDEF_REQUIRE_TOOLS: tests that need Chromium, poppler or qpdf fail instead of being skipped
RUN npm run build && npm run lint && PEDEF_REQUIRE_TOOLS=1 npm test

# ---- production node_modules only ------------------------------------------------------------------
FROM node AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- runtime -----------------------------------------------------------------------------------------
FROM base

ENV NODE_ENV=production \
    PORT=8081

WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist/src ./dist/src

# unprivileged user that comes with the node image (uid 1000)
USER node

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8081) + '/ping').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/index.js"]
