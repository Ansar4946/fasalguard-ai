# Bundled OCR language data

`eng.traineddata` is the **tessdata_fast** English model from
https://github.com/tesseract-ocr/tessdata_fast (downloaded 2026-10-22, 4,113,088 bytes).

Licence: Apache License 2.0 (same as Tesseract). Copyright the Tesseract OCR authors.

It is loaded from this directory by `TesseractLabelReaderProvider` (`langPath` + `cacheMethod: none`),
so the API never downloads language data at runtime. The Dockerfile copies this folder to `/app/assets`.

To enable Urdu text (`LABEL_OCR_LANGS=eng+urd`) add `urd.traineddata` from the same repository here.
Without the file the reader stays on `eng`.
