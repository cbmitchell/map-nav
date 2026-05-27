import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href;

export interface RenderedPage {
  imageData: string;
  imageW: number;
  imageH: number;
}

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

export async function loadPdf(file: File): Promise<PdfDocument> {
  const data = await file.arrayBuffer();
  // PDF.js transfers the ArrayBuffer to its worker (detaching it), so we load
  // the document once here and callers reuse the document object.
  return pdfjsLib.getDocument({ data }).promise;
}

export async function renderPdfPage(
  doc: PdfDocument,
  pageNum: number = 1,
  scale: number = 2,
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx as Parameters<typeof page.render>[0]['canvasContext'], canvas, viewport }).promise;

  return {
    imageData: canvas.toDataURL('image/png'),
    imageW: viewport.width,
    imageH: viewport.height,
  };
}
