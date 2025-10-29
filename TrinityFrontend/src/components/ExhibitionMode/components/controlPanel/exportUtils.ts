import pptxgen, { type PptxGenJS } from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import { toPng, toSvg } from 'html-to-image';
import 'svg2pdf.js';
import type { LayoutCard, SlideObject } from '../../store/exhibitionStore';
import { extractTextBoxFormatting } from '../operationsPalette/textBox/constants';
import type { TextBoxFormatting } from '../operationsPalette/textBox/types';
import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  normaliseTableData,
  normaliseTableHeaders,
  type TableCellData,
} from '../operationsPalette/tables/constants';
import {
  getColorSchemeColors,
  isEditableChartType,
  parseChartObjectProps,
} from '../operationsPalette/charts/utils';
import type { EditableChartType } from '../operationsPalette/charts/types';

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
const DEFAULT_CHART_SERIES_NAME = 'Series 1';

const PPT_CHART_TYPE_MAP: Record<EditableChartType, PptxGenJS.ChartType> = {
  column: 'col' as PptxGenJS.ChartType,
  bar: 'bar' as PptxGenJS.ChartType,
  line: 'line' as PptxGenJS.ChartType,
  pie: 'pie' as PptxGenJS.ChartType,
  donut: 'doughnut' as PptxGenJS.ChartType,
};

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
  const measuredWidth = fallbackRect?.width ?? 0;
  const measuredHeight = fallbackRect?.height ?? 0;
  const width = Math.max(typeof object.width === 'number' && object.width > 0 ? object.width : 0, measuredWidth);
  const height = Math.max(
    typeof object.height === 'number' && object.height > 0 ? object.height : 0,
    measuredHeight,
  );

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

const normaliseColorValue = (value: string | undefined | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return trimmed;
  }

  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch.slice(1, 4).map(component => {
      const numeric = Number(component);
      const clamped = Math.max(0, Math.min(255, Number.isFinite(numeric) ? numeric : 0));
      return clamped.toString(16).padStart(2, '0');
    });
    return `#${r}${g}${b}`;
  }

  return trimmed;
};

const parseStyleDeclarations = (style: string | null | undefined): Record<string, string> => {
  if (!style) {
    return {};
  }

  return style
    .split(';')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
    .reduce<Record<string, string>>((accumulator, declaration) => {
      const [property, rawValue] = declaration.split(':');
      if (!property || !rawValue) {
        return accumulator;
      }
      const key = property.trim().toLowerCase();
      const value = rawValue.trim();
      if (key.length === 0 || value.length === 0) {
        return accumulator;
      }
      accumulator[key] = value;
      return accumulator;
    }, {});
};

const applyElementFormatting = (
  element: Element,
  baseOptions: PptxGenJS.TextPropsOptions,
): PptxGenJS.TextPropsOptions => {
  const next: PptxGenJS.TextPropsOptions = { ...baseOptions };
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'strong' || tagName === 'b') {
    next.bold = true;
  }
  if (tagName === 'em' || tagName === 'i') {
    next.italic = true;
  }
  if (tagName === 'u') {
    next.underline = true;
  }
  if (tagName === 's' || tagName === 'strike') {
    next.strike = true;
  }

  const styles = parseStyleDeclarations(element.getAttribute('style'));
  const fontWeight = styles['font-weight'];
  if (fontWeight) {
    if (fontWeight.includes('bold') || Number(fontWeight) >= 600) {
      next.bold = true;
    }
    if (fontWeight.includes('normal')) {
      next.bold = false;
    }
  }

  const fontStyle = styles['font-style'];
  if (fontStyle) {
    if (fontStyle.includes('italic')) {
      next.italic = true;
    }
    if (fontStyle.includes('normal')) {
      next.italic = false;
    }
  }

  const textDecoration = styles['text-decoration'] ?? styles['text-decoration-line'];
  if (textDecoration) {
    const lower = textDecoration.toLowerCase();
    if (lower.includes('underline')) {
      next.underline = true;
    }
    if (lower.includes('line-through')) {
      next.strike = true;
    }
    if (lower.includes('none')) {
      next.underline = false;
      next.strike = false;
    }
  }

  const fontFamily = styles['font-family'];
  if (fontFamily) {
    const firstFamily = fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    if (firstFamily) {
      next.fontFace = firstFamily;
    }
  }

  const fontSize = styles['font-size'];
  if (fontSize) {
    const numeric = Number.parseFloat(fontSize);
    if (Number.isFinite(numeric) && numeric > 0) {
      next.fontSize = numeric;
    }
  }

  const color = styles.color ?? styles['font-color'];
  const normalisedColor = normaliseColorValue(color);
  if (normalisedColor) {
    next.color = normalisedColor;
  }

  if (element.hasAttribute('data-font-weight') && element.getAttribute('data-font-weight') === 'bold') {
    next.bold = true;
  }
  if (element.hasAttribute('data-underline') && element.getAttribute('data-underline') === 'true') {
    next.underline = true;
  }

  return next;
};

const createBaseTextOptions = (formatting: TextBoxFormatting): PptxGenJS.TextPropsOptions => ({
  fontFace: formatting.fontFamily,
  fontSize: formatting.fontSize,
  bold: formatting.bold,
  italic: formatting.italic,
  underline: formatting.underline,
  strike: formatting.strikethrough,
  color: formatting.color,
});

const convertHtmlToTextRuns = (
  html: string,
  formatting: TextBoxFormatting,
): PptxGenJS.TextProps[] => {
  if (typeof DOMParser === 'undefined') {
    return [];
  }

  const baseOptions = createBaseTextOptions(formatting);
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = documentFragment.body;
  const runs: PptxGenJS.TextProps[] = [];
  let pendingBreakLine = false;

  const queueBreakLine = () => {
    if (runs.length === 0) {
      return;
    }
    pendingBreakLine = true;
  };

  const pushRun = (text: string, options: PptxGenJS.TextPropsOptions) => {
    if (text.length === 0) {
      return;
    }
    const runOptions: PptxGenJS.TextPropsOptions = { ...options };
    if (pendingBreakLine) {
      runOptions.breakLine = true;
      pendingBreakLine = false;
    }
    runs.push({ text, options: runOptions });
  };

  const processTextNode = (value: string, options: PptxGenJS.TextPropsOptions) => {
    const normalised = value.replace(/\r/g, '').replace(/\u00a0/g, ' ');
    if (normalised.length === 0) {
      return;
    }
    const segments = normalised.split('\n');
    segments.forEach((segment, index) => {
      if (index > 0) {
        queueBreakLine();
      }
      pushRun(segment, options);
    });
  };

  const processNode = (node: Node, activeOptions: PptxGenJS.TextPropsOptions) => {
    if (node.nodeType === Node.TEXT_NODE) {
      processTextNode(node.nodeValue ?? '', activeOptions);
      return;
    }

    if (!(node instanceof Element)) {
      return;
    }

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      queueBreakLine();
      return;
    }

    const nextOptions = applyElementFormatting(node, activeOptions);

    if (tag === 'div' || tag === 'p' || tag === 'li' || tag === 'section' || tag === 'article') {
      if (runs.length > 0) {
        queueBreakLine();
      }
      Array.from(node.childNodes).forEach(child => {
        processNode(child, nextOptions);
      });
      queueBreakLine();
      return;
    }

    Array.from(node.childNodes).forEach(child => {
      processNode(child, nextOptions);
    });
  };

  Array.from(container.childNodes).forEach(node => {
    processNode(node, { ...baseOptions });
  });

  return runs;
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

const clampChartDimension = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0.1;
  }
  return Math.max(0.1, value);
};

const tryAddEditableChartToSlide = (
  slide: PptxGenJS.Slide,
  object: SlideObject,
  dimensions: { x: number; y: number; w: number; h: number },
): boolean => {
  try {
    const parsed = parseChartObjectProps(object.props as Record<string, unknown> | undefined);
    const { chartData, chartConfig } = parsed;

    if (!isEditableChartType(chartConfig.type)) {
      return false;
    }

    const chartType = PPT_CHART_TYPE_MAP[chartConfig.type];
    const labels = chartData.map(entry => entry.label ?? '');
    const values = chartData.map(entry => (Number.isFinite(entry.value) ? entry.value : 0));
    const safeLabels = labels.length > 0 ? labels : [''];
    const safeValues = values.length > 0 ? values : [0];

    const series: PptxGenJS.ChartData[] = [
      {
        name: DEFAULT_CHART_SERIES_NAME,
        labels: safeLabels,
        values: safeValues,
      },
    ];

    const palette = getColorSchemeColors(chartConfig.colorScheme);
    const showValues = Boolean(chartConfig.showValues);
    const showLabels = Boolean(chartConfig.showLabels);

    const chartOptions: PptxGenJS.IChartOpts = {
      x: dimensions.x,
      y: dimensions.y,
      w: clampChartDimension(dimensions.w),
      h: clampChartDimension(dimensions.h),
      chartColors: palette.length > 0 ? [...palette] : undefined,
      legendPos: chartConfig.legendPosition,
      showLegend: true,
      showCatAxisLabel: showLabels,
      valAxisMinVal: chartConfig.axisIncludesZero ? 0 : undefined,
      dataLabelShowVal: showValues,
    } as PptxGenJS.IChartOpts;

    if (!showLabels) {
      chartOptions.showCatAxisLabel = false;
    }

    if (showValues) {
      chartOptions.dataLabelFontSize = Math.min(Math.max(Math.round(dimensions.h / 14), 8), 24);
      chartOptions.dataLabelColor = '#1f2937';
      if (chartConfig.type === 'pie' || chartConfig.type === 'donut') {
        chartOptions.dataLabelShowPercent = true;
        chartOptions.dataLabelPosition = 'bestFit';
      } else {
        chartOptions.dataLabelShowPercent = false;
        chartOptions.dataLabelPosition = 'outEnd';
      }
    } else {
      chartOptions.dataLabelShowPercent = false;
    }

    slide.addChart(chartType, series, chartOptions);
    return true;
  } catch (error) {
    console.error('Failed to export chart as editable PPT object', error);
    return false;
  }
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
        const baseTextOptions = createBaseTextOptions(formatting);
        const textRuns = convertHtmlToTextRuns(formatting.text, formatting);
        const fallbackText = htmlToPlainText(formatting.text) || ' ';
        const runs: PptxGenJS.TextProps[] =
          textRuns.length > 0
            ? textRuns
            : [
                {
                  text: fallbackText,
                  options: { ...baseTextOptions },
                },
              ];

        pptSlide.addText(runs, {
          x,
          y,
          w,
          h,
          fontSize: baseTextOptions.fontSize,
          fontFace: baseTextOptions.fontFace,
          bold: baseTextOptions.bold,
          italic: baseTextOptions.italic,
          underline: baseTextOptions.underline,
          strike: baseTextOptions.strike,
          color: baseTextOptions.color,
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

      if (object.type === 'chart') {
        const added = tryAddEditableChartToSlide(pptSlide, object, { x, y, w, h });
        if (added) {
          continue;
        }
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
      skipFonts: true,
      fontEmbedCSS: '',
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

    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, width, height, 'F');
    await pdf.svg(svg, {
      x: 0,
      y: 0,
      width,
      height,
    });
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
