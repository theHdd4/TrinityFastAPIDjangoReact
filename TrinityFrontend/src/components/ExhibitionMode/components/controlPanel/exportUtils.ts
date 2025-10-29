import pptxgen, { type PptxGenJS } from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import { toPng, toSvg } from 'html-to-image';
import 'svg2pdf.js';
import type { LayoutCard, SlideObject } from '../../store/exhibitionStore';
import { extractTextBoxFormatting } from '../operationsPalette/textBox/constants';
import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  normaliseTableData,
  normaliseTableHeaders,
  type TableCellData,
} from '../operationsPalette/tables/constants';

export interface SlideExportData {
  id: string;
  card: LayoutCard;
  objects: SlideObject[];
}

const DEFAULT_PPT_SLIDE_WIDTH_IN = 13.33;
const MINIMUM_SLIDE_INCHES = 1;
const EXPORT_BACKGROUND = '#ffffff';
const FALLBACK_SLIDE_WIDTH = 960;
const FALLBACK_SLIDE_HEIGHT = 540;

const ensureClientEnvironment = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Exports are only available in a browser environment.');
  }
};

const createDownloadLink = (fileName: string, dataUrl: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const pxToInches = (value: number, totalPx: number, totalInches: number) => {
  if (!Number.isFinite(value) || !totalPx || !totalInches) {
    return 0;
  }
  return (value / totalPx) * totalInches;
};

const resolveObjectElement = (
  slideElement: HTMLElement | null,
  objectId: string,
): HTMLElement | null => {
  if (!slideElement) {
    return null;
  }
  return slideElement.querySelector(`[data-exhibition-object-id="${objectId}"]`) as HTMLElement | null;
};

const resolveObjectDimensions = (
  object: SlideObject,
  fallbackElement: HTMLElement | null,
): { width: number; height: number } => {
  const fallbackRect = fallbackElement?.getBoundingClientRect();
  const width =
    typeof object.width === 'number' && object.width > 0 ? object.width : fallbackRect?.width ?? 0;
  const height =
    typeof object.height === 'number' && object.height > 0 ? object.height : fallbackRect?.height ?? 0;

  return { width, height };
};

const htmlToPlainText = (html: string): string => {
  if (!html) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body.textContent?.replace(/\u00a0/g, ' ') ?? '';
};

const exportNodeFilter = (node: Element): boolean => {
  if (!(node instanceof HTMLElement)) {
    return true;
  }
  return node.dataset.exhibitionExportIgnore !== 'true';
};

const getSlideElement = (slideId: string): HTMLElement | null => {
  return document.querySelector(`[data-exhibition-slide-id="${slideId}"]`) as HTMLElement | null;
};

const getElementDimensions = (element: HTMLElement | null) => {
  if (!element) {
    return { width: FALLBACK_SLIDE_WIDTH, height: FALLBACK_SLIDE_HEIGHT };
  }
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width || FALLBACK_SLIDE_WIDTH,
    height: rect.height || FALLBACK_SLIDE_HEIGHT,
  };
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const captureElementAsPng = async (element: HTMLElement, width: number, height: number): Promise<string | null> => {
  try {
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    return await toPng(element, {
      pixelRatio: 2,
      width: targetWidth,
      height: targetHeight,
      backgroundColor: EXPORT_BACKGROUND,
      filter: exportNodeFilter,
      style: {
        width: `${targetWidth}px`,
        height: `${targetHeight}px`,
      },
    });
  } catch (error) {
    console.error('Failed to capture element as PNG', error);
    return null;
  }
};

const normaliseImageData = async (src: string | undefined): Promise<string | null> => {
  if (!src) {
    return null;
  }

  if (src.startsWith('data:')) {
    return src;
  }

  try {
    const response = await fetch(src, { mode: 'cors' });
    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image data'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to resolve image source for export', error);
    return null;
  }
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  return fallback;
};

const convertTableCell = (cell: TableCellData): PptxGenJS.TableCell => {
  const text = htmlToPlainText(cell.content);
  return {
    text,
    options: {
      bold: cell.formatting.bold,
      italic: cell.formatting.italic,
      underline: cell.formatting.underline,
      strike: cell.formatting.strikethrough,
      fontFace: cell.formatting.fontFamily,
      fontSize: cell.formatting.fontSize,
      color: cell.formatting.color,
      align: cell.formatting.align as 'left' | 'center' | 'right',
    },
    colSpan: cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined,
    rowSpan: cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined,
  };
};

const buildTableRows = (object: SlideObject): PptxGenJS.TableCell[][] => {
  const props = (object.props ?? {}) as Record<string, unknown>;
  const fallbackRows = parsePositiveInt(props.rows, DEFAULT_TABLE_ROWS);
  const fallbackCols = parsePositiveInt(props.cols, DEFAULT_TABLE_COLS);
  const rows = normaliseTableData(props.data, fallbackRows, fallbackCols);
  const columnCount = rows[0]?.length ?? fallbackCols;
  const headers = normaliseTableHeaders(props.headers, columnCount);

  const tableRows: PptxGenJS.TableCell[][] = [];
  if (headers.length > 0) {
    tableRows.push(headers.map(convertTableCell));
  }
  rows.forEach(row => {
    tableRows.push(row.map(convertTableCell));
  });

  return tableRows;
};

const addObjectImageFallback = async (
  slide: PptxGenJS.Slide,
  slideElement: HTMLElement | null,
  object: SlideObject,
  slideWidth: number,
  slideHeight: number,
  slideWidthInches: number,
  slideHeightInches: number,
) => {
  if (!slideElement) {
    return;
  }
  const element = resolveObjectElement(slideElement, object.id);
  if (!element) {
    return;
  }
  const { width, height } = resolveObjectDimensions(object, element);
  if (width <= 0 || height <= 0) {
    return;
  }

  const dataUrl = await captureElementAsPng(element, width, height);
  if (!dataUrl) {
    return;
  }

  slide.addImage({
    data: dataUrl,
    x: pxToInches(object.x, slideWidth, slideWidthInches),
    y: pxToInches(object.y, slideHeight, slideHeightInches),
    w: pxToInches(width, slideWidth, slideWidthInches),
    h: pxToInches(height, slideHeight, slideHeightInches),
    rotate: typeof object.rotation === 'number' ? object.rotation : 0,
  });
};

const sortObjectsByZIndex = (objects: SlideObject[]) => {
  return [...objects].sort((a, b) => {
    const aIndex = typeof a.zIndex === 'number' ? a.zIndex : 0;
    const bIndex = typeof b.zIndex === 'number' ? b.zIndex : 0;
    return aIndex - bIndex;
  });
};

export const exportToPowerPoint = async (slides: SlideExportData[], title: string = 'Presentation') => {
  ensureClientEnvironment();

  const pptx = new pptxgen();
  pptx.author = 'Exhibition Mode';
  pptx.title = title;
  pptx.subject = 'Exported Presentation';

  let layoutConfigured = false;

  for (const slideData of slides) {
    const slideElement = getSlideElement(slideData.id);
    const { width: slideWidth, height: slideHeight } = getElementDimensions(slideElement);
    if (slideWidth <= 0 || slideHeight <= 0) {
      continue;
    }

    const slideWidthInches = Math.max(DEFAULT_PPT_SLIDE_WIDTH_IN, MINIMUM_SLIDE_INCHES);
    const slideHeightInches = Math.max((slideHeight / slideWidth) * slideWidthInches, MINIMUM_SLIDE_INCHES);

    if (!layoutConfigured) {
      pptx.defineLayout({ name: 'TRINITY_LAYOUT', width: slideWidthInches, height: slideHeightInches });
      pptx.layout = 'TRINITY_LAYOUT';
      layoutConfigured = true;
    }

    const pptSlide = pptx.addSlide();
    const objects = sortObjectsByZIndex(slideData.objects);

    for (const object of objects) {
      const element = resolveObjectElement(slideElement, object.id);
      const { width: objectWidth, height: objectHeight } = resolveObjectDimensions(object, element);
      if (objectWidth <= 0 || objectHeight <= 0) {
        continue;
      }

      const x = pxToInches(object.x, slideWidth, slideWidthInches);
      const y = pxToInches(object.y, slideHeight, slideHeightInches);
      const w = pxToInches(objectWidth, slideWidth, slideWidthInches);
      const h = pxToInches(objectHeight, slideHeight, slideHeightInches);
      const rotation = typeof object.rotation === 'number' ? object.rotation : 0;

      if (object.type === 'text-box' || object.type === 'title') {
        const formatting = extractTextBoxFormatting(object.props as Record<string, unknown> | undefined);
        const textContent = htmlToPlainText(formatting.text);

        pptSlide.addText(textContent || ' ', {
          x,
          y,
          w,
          h,
          fontSize: formatting.fontSize,
          fontFace: formatting.fontFamily,
          bold: formatting.bold,
          italic: formatting.italic,
          underline: formatting.underline,
          color: formatting.color,
          align: formatting.align as 'left' | 'center' | 'right',
          valign: 'top',
          rotate: rotation,
        });
        continue;
      }

      if (object.type === 'image' || object.type === 'accent-image') {
        const dataUrl = await normaliseImageData(
          typeof (object.props as Record<string, unknown>)?.src === 'string'
            ? ((object.props as Record<string, unknown>).src as string)
            : undefined,
        );

        if (dataUrl) {
          pptSlide.addImage({
            data: dataUrl,
            x,
            y,
            w,
            h,
            rotate: rotation,
          });
          continue;
        }

        await addObjectImageFallback(
          pptSlide,
          slideElement,
          object,
          slideWidth,
          slideHeight,
          slideWidthInches,
          slideHeightInches,
        );
        continue;
      }

      if (object.type === 'table') {
        const rows = buildTableRows(object);
        if (rows.length > 0) {
          pptSlide.addTable(rows, {
            x,
            y,
            w,
            h,
          });
        }
        continue;
      }

      await addObjectImageFallback(
        pptSlide,
        slideElement,
        object,
        slideWidth,
        slideHeight,
        slideWidthInches,
        slideHeightInches,
      );
    }
  }

  await pptx.writeFile({ fileName: `${title}.pptx` });
};

export const exportToPDF = async (slides: SlideExportData[], title: string = 'Presentation') => {
  ensureClientEnvironment();

  let pdf: jsPDF | null = null;

  for (let index = 0; index < slides.length; index += 1) {
    const slideData = slides[index];
    const slideElement = getSlideElement(slideData.id);
    if (!slideElement) {
      continue;
    }

    const { width, height } = getElementDimensions(slideElement);
    const orientation = width >= height ? 'landscape' : 'portrait';

    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [width, height],
      });
    } else {
      pdf.addPage([width, height], orientation);
    }

    const svgMarkup = await toSvg(slideElement, {
      backgroundColor: EXPORT_BACKGROUND,
      width: Math.round(width),
      height: Math.round(height),
      filter: exportNodeFilter,
      style: {
        width: `${Math.round(width)}px`,
        height: `${Math.round(height)}px`,
      },
    });

    const parser = new DOMParser();
    const svg = parser.parseFromString(svgMarkup, 'image/svg+xml').documentElement;
    svg.setAttribute('width', `${width}`);
    svg.setAttribute('height', `${height}`);
    if (!svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const serialisedSvg = new XMLSerializer().serializeToString(svg);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, width, height, 'F');
    pdf.addImage(serialisedSvg, 'SVG', 0, 0, width, height, undefined, 'FAST');
  }

  if (!pdf) {
    throw new Error('No slides available to export.');
  }

  pdf.save(`${title}.pdf`);
};

export const exportAsImages = async (slides: SlideExportData[], title: string = 'Presentation') => {
  ensureClientEnvironment();

  for (let index = 0; index < slides.length; index += 1) {
    const slideData = slides[index];
    const slideElement = getSlideElement(slideData.id);
    if (!slideElement) {
      continue;
    }

    const { width, height } = getElementDimensions(slideElement);

    const dataUrl = await captureElementAsPng(slideElement, width, height);
    if (dataUrl) {
      createDownloadLink(`${title}-slide-${index + 1}.png`, dataUrl);
      await delay(120);
    }
  }
};
