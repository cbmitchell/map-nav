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

export async function getPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}

export async function renderPdfPage(
  file: File,
  pageNum: number = 1,
  scale: number = 2,
): Promise<RenderedPage> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
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
