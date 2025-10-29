import pptxgen, { type PptxGenJS } from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import { toPng, toSvg } from 'html-to-image';
import 'svg2pdf.js';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  type CardColor,
  type CardLayout,
  type LayoutCard,
  type PresentationSettings,
  type SlideBackgroundMode,
  type SlideBackgroundPreset,
  type SlideObject,
} from '../../store/exhibitionStore';
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
import type { ShapeObjectProps } from '../operationsPalette/shapes/constants';
import {
  GRADIENT_STYLE_MAP,
  isGradientToken,
  isKnownGradientId,
  isSolidToken,
  solidTokenToHex,
} from '@/templates/color-tray';

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
const DEFAULT_SLIDE_BACKGROUND_COLOR = '#ffffff';
const CANVAS_STAGE_HEIGHT = 520;
const DEFAULT_PRESENTATION_WIDTH = 960;
const TOP_LAYOUT_MIN_HEIGHT = 210;
const BOTTOM_LAYOUT_MIN_HEIGHT = 220;
const SIDE_LAYOUT_MIN_WIDTH = 280;
const SIDE_LAYOUT_RATIO = 0.34;
const TOP_LAYOUT_RATIO = TOP_LAYOUT_MIN_HEIGHT / CANVAS_STAGE_HEIGHT;
const BOTTOM_LAYOUT_RATIO = BOTTOM_LAYOUT_MIN_HEIGHT / CANVAS_STAGE_HEIGHT;
const SIDE_LAYOUT_MIN_RATIO = SIDE_LAYOUT_MIN_WIDTH / DEFAULT_PRESENTATION_WIDTH;

const PPT_CHART_TYPE_MAP: Record<EditableChartType, PptxGenJS.ChartType> = {
  column: 'col' as PptxGenJS.ChartType,
  bar: 'bar' as PptxGenJS.ChartType,
  line: 'line' as PptxGenJS.ChartType,
  pie: 'pie' as PptxGenJS.ChartType,
  donut: 'doughnut' as PptxGenJS.ChartType,
};

const PPT_LEGEND_POSITION_MAP: Record<'top' | 'bottom' | 'left' | 'right', PptxGenJS.ChartLegendPosition> = {
  top: 't',
  bottom: 'b',
  left: 'l',
  right: 'r',
};

const SLIDE_BACKGROUND_PRESET_COLORS: Record<SlideBackgroundPreset, string> = {
  default: DEFAULT_SLIDE_BACKGROUND_COLOR,
  ivory: '#fef3c7',
  slate: '#e2e8f0',
  charcoal: '#d4d4d8',
  indigo: '#e0e7ff',
  emerald: '#d1fae5',
  rose: '#ffe4e6',
};

const PPT_SHAPE_TYPE_MAP: Record<string, PptxGenJS.ShapeType> = {
  rectangle: 'rect',
  'rounded-rectangle': 'roundRect',
  ellipse: 'oval',
  circle: 'oval',
  triangle: 'triangle',
  diamond: 'diamond',
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

const toPptColorHex = (value: string | undefined | null): string | undefined => {
  const normalised = typeof value === 'string' ? normaliseColorValue(value) : undefined;
  if (!normalised) {
    return undefined;
  }
  if (!normalised.startsWith('#')) {
    return undefined;
  }
  return normalised.slice(1).toUpperCase();
};

const normalisePptxImageData = (dataUrl: string | null | undefined): string | null => {
  if (!dataUrl) {
    return null;
  }
  const trimmed = dataUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('data:')) {
    return trimmed.slice(5);
  }
  return trimmed;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalised = normaliseColorValue(hex);
  if (!normalised || !normalised.startsWith('#')) {
    return null;
  }
  const value = normalised.slice(1);
  if (value.length !== 6) {
    return null;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some(component => Number.isNaN(component))) {
    return null;
  }
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
};

const applyOpacityToHexColor = (hex: string, opacity: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const safeOpacity = Math.min(100, Math.max(0, Number.isFinite(opacity) ? opacity : 100));
  if (safeOpacity >= 100) {
    return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g
      .toString(16)
      .padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
  }

  const alpha = safeOpacity / 100;
  const blendedR = rgb.r * alpha + 255 * (1 - alpha);
  const blendedG = rgb.g * alpha + 255 * (1 - alpha);
  const blendedB = rgb.b * alpha + 255 * (1 - alpha);
  return rgbToHex(blendedR, blendedG, blendedB);
};

const directionStringToDegrees = (value: string): number => {
  const normalised = value.trim().toLowerCase();
  switch (normalised) {
    case 'right':
      return 90;
    case 'left':
      return 270;
    case 'top':
      return 0;
    case 'bottom':
      return 180;
    case 'top right':
    case 'right top':
      return 45;
    case 'bottom right':
    case 'right bottom':
      return 135;
    case 'bottom left':
    case 'left bottom':
      return 225;
    case 'top left':
    case 'left top':
      return 315;
    default:
      return 135;
  }
};

interface ParsedGradientDefinition {
  angle: number;
  colors: string[];
}

const parseLinearGradientDefinition = (value: string | undefined | null): ParsedGradientDefinition | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith('linear-gradient')) {
    return null;
  }

  const start = trimmed.indexOf('(');
  const end = trimmed.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start + 1) {
    return null;
  }

  const body = trimmed.slice(start + 1, end);
  const segments = body
    .split(',')
    .map(segment => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  let angle = 135;
  let colorStartIndex = 0;
  const firstSegment = segments[0].toLowerCase();

  if (firstSegment.endsWith('deg')) {
    const numeric = Number.parseFloat(firstSegment.replace('deg', ''));
    if (Number.isFinite(numeric)) {
      angle = numeric;
    }
    colorStartIndex = 1;
  } else if (firstSegment.startsWith('to ')) {
    angle = directionStringToDegrees(firstSegment.slice(3));
    colorStartIndex = 1;
  }

  const colors: string[] = [];
  for (let index = colorStartIndex; index < segments.length; index += 1) {
    const segment = segments[index];
    const [colorValue] = segment.split(/\s+/);
    const normalisedColor = normaliseColorValue(colorValue);
    if (normalisedColor && normalisedColor.startsWith('#')) {
      colors.push(normalisedColor);
    }
  }

  if (colors.length === 0) {
    return null;
  }

  return { angle, colors };
};

const generateLinearGradientDataUrl = (
  width: number,
  height: number,
  definition: string,
  opacity: number,
): string | null => {
  ensureClientEnvironment();

  const parsed = parseLinearGradientDefinition(definition);
  if (!parsed) {
    return null;
  }

  const targetWidth = Math.max(2, Math.round(width));
  const targetHeight = Math.max(2, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const radians = ((parsed.angle % 360) * Math.PI) / 180;
  const halfWidth = targetWidth / 2;
  const halfHeight = targetHeight / 2;
  const x0 = halfWidth - Math.cos(radians) * halfWidth;
  const y0 = halfHeight - Math.sin(radians) * halfHeight;
  const x1 = halfWidth + Math.cos(radians) * halfWidth;
  const y1 = halfHeight + Math.sin(radians) * halfHeight;
  const gradient = context.createLinearGradient(x0, y0, x1, y1);

  const stopCount = parsed.colors.length;
  parsed.colors.forEach((color, index) => {
    const blended = applyOpacityToHexColor(color, opacity);
    gradient.addColorStop(stopCount === 1 ? 0 : index / (stopCount - 1), blended);
  });

  context.fillStyle = gradient;
  context.fillRect(0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/png');
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
  fontFace: formatting.fontFamily || 'Arial',
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

type OverlayFill =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; definition: string };

const resolveCardOverlayFill = (color: CardColor | undefined): OverlayFill => {
  if (color && isSolidToken(color)) {
    return { kind: 'solid', color: solidTokenToHex(color) };
  }

  if (color && typeof color === 'string') {
    if (isGradientToken(color) || isKnownGradientId(color)) {
      const gradient = GRADIENT_STYLE_MAP[color as keyof typeof GRADIENT_STYLE_MAP];
      if (gradient) {
        return { kind: 'gradient', definition: gradient };
      }
    }
  }

  return { kind: 'gradient', definition: GRADIENT_STYLE_MAP.default };
};

const resolvePresentationSettings = (card: LayoutCard): PresentationSettings => {
  return {
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...(card.presentationSettings ?? {}),
  };
};

interface SlideMetrics {
  width: number;
  height: number;
  widthInches: number;
  heightInches: number;
}

interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const computeOverlayRect = (layout: CardLayout, slideWidth: number, slideHeight: number): OverlayRect | null => {
  const width = Math.max(1, slideWidth);
  const height = Math.max(1, slideHeight);

  switch (layout) {
    case 'none':
      return null;
    case 'full':
      return { x: 0, y: 0, width, height };
    case 'top': {
      const overlayHeight = Math.min(height, Math.max(height * TOP_LAYOUT_RATIO, TOP_LAYOUT_MIN_HEIGHT));
      return { x: 0, y: 0, width, height: overlayHeight };
    }
    case 'bottom': {
      const overlayHeight = Math.min(height, Math.max(height * BOTTOM_LAYOUT_RATIO, BOTTOM_LAYOUT_MIN_HEIGHT));
      return { x: 0, y: height - overlayHeight, width, height: overlayHeight };
    }
    case 'left': {
      const overlayWidth = Math.min(width, Math.max(width * SIDE_LAYOUT_RATIO, width * SIDE_LAYOUT_MIN_RATIO, SIDE_LAYOUT_MIN_WIDTH));
      return { x: 0, y: 0, width: overlayWidth, height };
    }
    case 'right': {
      const overlayWidth = Math.min(width, Math.max(width * SIDE_LAYOUT_RATIO, width * SIDE_LAYOUT_MIN_RATIO, SIDE_LAYOUT_MIN_WIDTH));
      return { x: width - overlayWidth, y: 0, width: overlayWidth, height };
    }
    default:
      return null;
  }
};

const addSlideBackground = async (
  slide: PptxGenJS.Slide,
  card: LayoutCard,
  metrics: SlideMetrics,
) => {
  const settings = resolvePresentationSettings(card);
  const opacity = Number.isFinite(settings.backgroundOpacity)
    ? Number(settings.backgroundOpacity)
    : DEFAULT_PRESENTATION_SETTINGS.backgroundOpacity;
  const mode: SlideBackgroundMode = settings.backgroundMode ?? 'preset';
  const fallbackColor = toPptColorHex(DEFAULT_SLIDE_BACKGROUND_COLOR) ?? 'FFFFFF';
  slide.background = { color: fallbackColor };

  const addImageBackground = async (dataUrl: string | null) => {
    const pptData = normalisePptxImageData(dataUrl);
    if (pptData) {
      slide.addImage({
        data: pptData,
        x: 0,
        y: 0,
        w: metrics.widthInches,
        h: metrics.heightInches,
      });
      return true;
    }
    return false;
  };

  const widthPx = Math.max(2, Math.round(metrics.width));
  const heightPx = Math.max(2, Math.round(metrics.height));

  if (mode === 'image' && settings.backgroundImageUrl) {
    const dataUrl = await normaliseImageData(settings.backgroundImageUrl);
    if (await addImageBackground(dataUrl)) {
      return;
    }
  }

  if (mode === 'gradient') {
    const start = settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart;
    const end = settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd;
    const direction = settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection;
    const gradient = `linear-gradient(${direction}, ${start}, ${end})`;
    const gradientData = generateLinearGradientDataUrl(widthPx, heightPx, gradient, opacity);
    if (await addImageBackground(gradientData)) {
      return;
    }
    const fallbackSolid = applyOpacityToHexColor(start, opacity);
    const pptColor = toPptColorHex(fallbackSolid) ?? fallbackColor;
    slide.background = { color: pptColor };
    return;
  }

  if (mode === 'solid') {
    const solid = settings.backgroundSolidColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    const blended = applyOpacityToHexColor(solid, opacity);
    const pptColor = toPptColorHex(blended) ?? fallbackColor;
    slide.background = { color: pptColor };
    return;
  }

  const backgroundColor = settings.backgroundColor;
  if (isSolidToken(backgroundColor)) {
    const solidHex = applyOpacityToHexColor(solidTokenToHex(backgroundColor), opacity);
    const pptColor = toPptColorHex(solidHex) ?? fallbackColor;
    slide.background = { color: pptColor };
    return;
  }

  if (
    typeof backgroundColor === 'string' &&
    (isGradientToken(backgroundColor) || isKnownGradientId(backgroundColor))
  ) {
    const gradient = GRADIENT_STYLE_MAP[backgroundColor as keyof typeof GRADIENT_STYLE_MAP];
    const gradientData = generateLinearGradientDataUrl(widthPx, heightPx, gradient, opacity);
    if (await addImageBackground(gradientData)) {
      return;
    }
  }

  const preset =
    (typeof backgroundColor === 'string'
      ? (backgroundColor as SlideBackgroundPreset)
      : undefined) ?? 'default';
  const presetHex = SLIDE_BACKGROUND_PRESET_COLORS[preset] ?? DEFAULT_SLIDE_BACKGROUND_COLOR;
  const blendedPreset = applyOpacityToHexColor(presetHex, opacity);
  const pptColor = toPptColorHex(blendedPreset) ?? fallbackColor;
  slide.background = { color: pptColor };
};

const addLayoutOverlay = async (
  slide: PptxGenJS.Slide,
  card: LayoutCard,
  metrics: SlideMetrics,
) => {
  const settings = resolvePresentationSettings(card);
  const layout: CardLayout = settings.cardLayout ?? 'none';
  const rect = computeOverlayRect(layout, metrics.width, metrics.height);

  if (!rect) {
    return;
  }

  const x = pxToInches(rect.x, metrics.width, metrics.widthInches);
  const y = pxToInches(rect.y, metrics.height, metrics.heightInches);
  const w = pxToInches(rect.width, metrics.width, metrics.widthInches);
  const h = pxToInches(rect.height, metrics.height, metrics.heightInches);

  if (settings.accentImage) {
    const accentData = await normaliseImageData(settings.accentImage);
    const pptData = normalisePptxImageData(accentData);
    if (pptData) {
      slide.addImage({ data: pptData, x, y, w, h });
      return;
    }
  }

  const overlayFill = resolveCardOverlayFill(settings.cardColor);
  if (overlayFill.kind === 'solid') {
    const color = toPptColorHex(overlayFill.color) ?? toPptColorHex(DEFAULT_SLIDE_BACKGROUND_COLOR) ?? 'FFFFFF';
    slide.addShape('rect', {
      x,
      y,
      w,
      h,
      fill: { color },
      line: { color, width: 0 },
    });
    return;
  }

  const gradientData = generateLinearGradientDataUrl(rect.width, rect.height, overlayFill.definition, 100);
  const pptData = normalisePptxImageData(gradientData);
  if (pptData) {
    slide.addImage({ data: pptData, x, y, w, h });
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
      legendPos: PPT_LEGEND_POSITION_MAP[chartConfig.legendPosition] ?? 'b',
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

  const pptData = normalisePptxImageData(dataUrl);
  if (!pptData) {
    return;
  }

  slide.addImage({
    data: pptData,
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

    const metrics: SlideMetrics = {
      width: slideWidth,
      height: slideHeight,
      widthInches: slideWidthInches,
      heightInches: slideHeightInches,
    };

    await addSlideBackground(pptSlide, slideData.card, metrics);
    await addLayoutOverlay(pptSlide, slideData.card, metrics);

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

      if (object.type === 'shape') {
        const shapeProps = (object.props ?? {}) as Partial<ShapeObjectProps>;
        const shapeType = shapeProps?.shapeId ? PPT_SHAPE_TYPE_MAP[shapeProps.shapeId] : undefined;

        if (shapeType) {
          const fillColorHex = shapeProps.fill ? toPptColorHex(shapeProps.fill) : undefined;
          const opacity = typeof shapeProps.opacity === 'number' ? Math.min(Math.max(shapeProps.opacity, 0), 1) : 1;
          const strokeColorHex = shapeProps.stroke ? toPptColorHex(shapeProps.stroke) : undefined;
          const strokeWidthPx = typeof shapeProps.strokeWidth === 'number' ? shapeProps.strokeWidth : 0;
          const strokeWidthPt = strokeWidthPx > 0 ? Math.max(0.25, strokeWidthPx * 0.75) : 0;

          pptSlide.addShape(shapeType, {
            x,
            y,
            w,
            h,
            rotate: rotation,
            fill: fillColorHex
              ? { color: fillColorHex, transparency: Math.min(Math.max(1 - opacity, 0), 1) }
              : undefined,
            line:
              strokeColorHex && strokeWidthPt > 0
                ? { color: strokeColorHex, width: strokeWidthPt }
                : { color: fillColorHex ?? 'FFFFFF', width: 0 },
          });
          continue;
        }
      }

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

        const pptData = normalisePptxImageData(dataUrl);
        if (pptData) {
          pptSlide.addImage({
            data: pptData,
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
