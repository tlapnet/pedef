# PeDeF
#### A microservice for generation and pdf manipulation

## USAGE

__[GET] /ping__
Will return "pong" response if app runs

__[POST] /v1/pdf/from-url/__

Will generate a pdf file for existing web page. Pass the web url in json request.
See Renderer options to view all possible options.
```json
{
  "url": "http://www.google.com",
  "options": {}
}
```

__[POST] /v1/pdf/from-file/__

Will generate a pdf file for uploaded html page. Upload the .html file as the form upload file.
Only the first uploaded file will be taken into consideration during the generate process.
You can also add field "options" to uploaded form.
This "options" field must contain valid options JSON string e.g.: "{"format": "A5", "landscape": true}"
See Renderer options to view all possible options.

__[POST] /v1/pdf/thumbnail/__

Generates a png image of the first page of uploaded pdf file.

__[POST] /v1/pdf/merge/__

Merges multiple uploaded pdf files into one. At least 2 files are required.

### Renderer options:
You can provide additional options for puppeteer renderer.
Full description of option params is on https://pptr.dev/#?product=Puppeteer&version=v1.6.1&show=api-pagepdfoptions

Bellow are listed possible options with default values.
All option fields are optional.  
```json
{
    "format": "A4",
    "landscape": false,
    "printBackground": false,
    "displayHeaderFooter": true,
    "margin": {"top":"0cm", "bottom": "0cm", "left": "0cm", "right": "0cm"},
    "headerTemplate": "",
    "footerTemplate": "",
    "pageRanges": ""
}
```

Note: If you want to use header and/or footer template you must set margins to place the templates into and
you must set displayHeaderFooter: true. You can use placeholders like `pageNumber, totalPages, date, title, url` in templates.

Example of valid options:
```json
{
    "pageRanges": "1-2",
    "format": "A4",
    "landscape": false,
    "displayHeaderFooter": true,
    "margin": {"top":"3cm", "bottom": "3cm"},
    "headerTemplate": "<p style='font-size: 20px;'>Printed on: <span class='date'></span></p>",
    "footerTemplate": "<p style='font-size: 20px;'>Page <span class='pageNumber'></span>/<span class='totalPages'></span></p>"
}
```

## How to run locally using docker

1. clone this repo and cd to its folder
2. `make docker-build`
3. `make docker-start`

## How to run locally on OSX 

- Download and install pdftk library: https://www.pdflabs.com/tools/pdftk-the-pdf-toolkit/pdftk_server-2.02-mac_osx-10.11-setup.pkg
- Download and install libraries for thumbnails: `brew install imagemagick ghostscript poppler`

```
npm install
npm start 
```
