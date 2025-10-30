import PptxGenJS from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  type LayoutCard,
  type PresentationSettings,
  type SlideObject,
  type ExhibitionTheme,
  type CardLayout,
  type CardColor,
} from '../store/exhibitionStore';
import {
  extractTextBoxFormatting,
  DEFAULT_TEXT_BOX_TEXT,
} from '../components/operationsPalette/textBox/constants';
import type { ShapeObjectProps } from '../components/operationsPalette/shapes/constants';
import type { TableCellData } from '../components/operationsPalette/tables/constants';
import type { ChartConfig, ChartDataRow } from '../components/operationsPalette/charts';
import {
  GRADIENT_STYLE_MAP,
  isGradientToken,
  isKnownGradientId,
  isSolidToken,
  solidTokenToHex,
  type GradientColorId,
} from '@/templates/color-tray';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 520;
const PPT_SLIDE_WIDTH_IN = 13.33;
const PPT_SLIDE_HEIGHT_IN = 7.5;
const IMAGE_CAPTURE_SCALE = 2;
const TOP_LAYOUT_MIN_HEIGHT = 210;
const BOTTOM_LAYOUT_MIN_HEIGHT = 220;
const SIDE_LAYOUT_MIN_WIDTH = 280;
const SIDE_LAYOUT_RATIO = 0.34;

const SLIDE_PRESET_COLORS: Record<string, string> = {
  default: '#ffffff',
  ivory: '#fef3c7',
  slate: '#e2e8f0',
  charcoal: '#d4d4d8',
  indigo: '#e0e7ff',
  emerald: '#d1fae5',
  rose: '#fce7f3',
};

const FONT_FALLBACK = 'Arial';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toInches = (value: number, axis: 'x' | 'y' | 'w' | 'h'): number => {
  if (axis === 'x' || axis === 'w') {
    return ((value ?? 0) / CANVAS_WIDTH) * PPT_SLIDE_WIDTH_IN;
  }
  return ((value ?? 0) / CANVAS_HEIGHT) * PPT_SLIDE_HEIGHT_IN;
};

const normaliseHex = (value: string, fallback: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    const [, shorthand] = /^#([0-9a-fA-F]{3})$/.exec(trimmed) ?? [];
    if (shorthand) {
      return `#${shorthand
        .split('')
        .map(char => char.repeat(2))
        .join('')}`.toLowerCase();
    }
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
  if (rgbMatch) {
    const r = clamp(parseInt(rgbMatch[1], 10), 0, 255);
    const g = clamp(parseInt(rgbMatch[2], 10), 0, 255);
    const b = clamp(parseInt(rgbMatch[3], 10), 0, 255);
    const toHex = (component: number) => component.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return fallback;
};

const parseGradientString = (value: string | null | undefined): { angle: number; colors: string[] } | null => {
  if (!value) {
    return null;
  }
  const match = value.match(/linear-gradient\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const parts = match[1]
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  let angle = 135;
  const colors: string[] = [];
  parts.forEach(part => {
    if (part.endsWith('deg')) {
      const numeric = Number.parseFloat(part.replace('deg', ''));
      if (Number.isFinite(numeric)) {
        angle = numeric;
      }
      return;
    }
    const colorCandidate = part.split(' ')[0];
    const normalised = normaliseHex(colorCandidate, '#ffffff');
    colors.push(normalised);
  });
  if (colors.length === 0) {
    return null;
  }
  if (colors.length === 1) {
    colors.push(colors[0]);
  }
  return { angle, colors: colors.slice(0, 4) };
};

const degreeStringToNumber = (value: string | null | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const numeric = Number.parseFloat(value.replace('deg', ''));
  return Number.isFinite(numeric) ? numeric : fallback;
};

const isDataUrl = (value: string | null | undefined): boolean => {
  return typeof value === 'string' && value.startsWith('data:');
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const resolveImageData = async (src: string | null | undefined): Promise<string | null> => {
  if (!src) {
    return null;
  }
  if (isDataUrl(src)) {
    return src;
  }
  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn('[Exhibition] Failed to resolve image data for export', error);
    return null;
  }
};

const captureElementAsImage = async (
  element: HTMLElement | null,
  options: { backgroundColor?: string | null; scale?: number } = {},
): Promise<string | null> => {
  if (!element) {
    return null;
  }
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: options.backgroundColor ?? null,
      scale: options.scale ?? IMAGE_CAPTURE_SCALE,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('[Exhibition] Unable to capture element for export', error);
    return null;
  }
};

const findSlideElement = (slideId: string): HTMLElement | null => {
  return document.querySelector(`[data-exhibition-slide-id="${slideId}"]`) as HTMLElement | null;
};

const findObjectElement = (objectId: string): HTMLElement | null => {
  return document.querySelector(`[data-exhibition-object-id="${objectId}"]`) as HTMLElement | null;
};

interface SlideBackgroundExport {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: { angle: number; colors: string[] };
  imageSrc?: string;
}

interface LayoutOverlayExport {
  type: 'color' | 'gradient' | 'image';
  color?: string;
  gradient?: { angle: number; colors: string[] };
  imageSrc?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BaseExportObject {
  id: string;
  kind: 'text' | 'image' | 'shape' | 'table' | 'chart' | 'foreign';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface TextBoxExportObject extends BaseExportObject {
  kind: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
}

export interface ImageExportObject extends BaseExportObject {
  kind: 'image';
  src: string;
  name?: string | null;
}

export interface ShapeExportObject extends BaseExportObject {
  kind: 'shape';
  shapeId: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: string;
  opacity: number;
}

export interface TableExportObject extends BaseExportObject {
  kind: 'table';
  data: TableCellData[][];
  showOutline: boolean;
}

export interface ChartExportObject extends BaseExportObject {
  kind: 'chart';
  chartConfig: ChartConfig | null;
  chartData: ChartDataRow[];
}

export interface ForeignExportObject extends BaseExportObject {
  kind: 'foreign';
  objectType: string;
}

export type SlideExportObject =
  | TextBoxExportObject
  | ImageExportObject
  | ShapeExportObject
  | TableExportObject
  | ChartExportObject
  | ForeignExportObject;

export interface SlideExportData {
  id: string;
  title: string;
  settings: PresentationSettings;
  background: SlideBackgroundExport;
  overlay?: LayoutOverlayExport | null;
  objects: SlideExportObject[];
}

const resolveBackground = (
  settings: PresentationSettings,
  theme: ExhibitionTheme,
): SlideBackgroundExport => {
  const mode = settings.backgroundMode ?? 'preset';

  if (mode === 'image' && settings.backgroundImageUrl) {
    return { type: 'image', imageSrc: settings.backgroundImageUrl };
  }

  if (mode === 'gradient') {
    const start = normaliseHex(settings.backgroundGradientStart ?? '#ffffff', '#ffffff');
    const end = normaliseHex(settings.backgroundGradientEnd ?? '#f5f5f5', '#f5f5f5');
    const angle = degreeStringToNumber(settings.backgroundGradientDirection ?? '135deg', 135);
    return { type: 'gradient', gradient: { angle, colors: [start, end] } };
  }

  if (mode === 'solid') {
    const color = normaliseHex(
      settings.backgroundSolidColor ?? theme.colors.background ?? '#ffffff',
      '#ffffff',
    );
    return { type: 'solid', color };
  }

  const preset = settings.backgroundColor;
  if (typeof preset === 'string') {
    if (isSolidToken(preset)) {
      return { type: 'solid', color: solidTokenToHex(preset) };
    }
    if (isKnownGradientId(preset) || isGradientToken(preset)) {
      const gradientString = GRADIENT_STYLE_MAP[preset as GradientColorId] ?? null;
      const parsed = parseGradientString(gradientString);
      if (parsed) {
        return { type: 'gradient', gradient: parsed };
      }
    }
    if (preset in SLIDE_PRESET_COLORS) {
      return { type: 'solid', color: SLIDE_PRESET_COLORS[preset] };
    }
    if (preset.startsWith('#')) {
      return { type: 'solid', color: normaliseHex(preset, '#ffffff') };
    }
  }

  const fallbackGradient = theme.gradients?.background;
  const parsedGradient = parseGradientString(fallbackGradient);
  if (parsedGradient) {
    return { type: 'gradient', gradient: parsedGradient };
  }

  return {
    type: 'solid',
    color: normaliseHex(theme.colors.background ?? '#ffffff', '#ffffff'),
  };
};

const resolveOverlayRect = (layout: CardLayout): { x: number; y: number; width: number; height: number } | null => {
  switch (layout) {
    case 'full':
      return { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    case 'top': {
      const height = Math.max(TOP_LAYOUT_MIN_HEIGHT, CANVAS_HEIGHT * 0.4);
      return { x: 0, y: 0, width: CANVAS_WIDTH, height };
    }
    case 'bottom': {
      const height = Math.max(BOTTOM_LAYOUT_MIN_HEIGHT, CANVAS_HEIGHT * 0.4);
      return { x: 0, y: CANVAS_HEIGHT - height, width: CANVAS_WIDTH, height };
    }
    case 'left': {
      const width = Math.max(SIDE_LAYOUT_MIN_WIDTH, CANVAS_WIDTH * SIDE_LAYOUT_RATIO);
      return { x: 0, y: 0, width, height: CANVAS_HEIGHT };
    }
    case 'right': {
      const width = Math.max(SIDE_LAYOUT_MIN_WIDTH, CANVAS_WIDTH * SIDE_LAYOUT_RATIO);
      return { x: CANVAS_WIDTH - width, y: 0, width, height: CANVAS_HEIGHT };
    }
    default:
      return null;
  }
};

const resolveOverlay = (settings: PresentationSettings): LayoutOverlayExport | null => {
  const layout = settings.cardLayout ?? DEFAULT_PRESENTATION_SETTINGS.cardLayout;
  if (!layout || layout === 'none') {
    return null;
  }

  const rect = resolveOverlayRect(layout);
  if (!rect) {
    return null;
  }

  const accentImage = typeof settings.accentImage === 'string' ? settings.accentImage : null;
  if (accentImage) {
    return {
      type: 'image',
      imageSrc: accentImage,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  const cardColor: CardColor = settings.cardColor ?? DEFAULT_PRESENTATION_SETTINGS.cardColor;
  if (isSolidToken(cardColor)) {
    return {
      type: 'color',
      color: solidTokenToHex(cardColor),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  const gradientId: GradientColorId = (isKnownGradientId(cardColor)
    ? (cardColor as GradientColorId)
    : 'default');
  const gradientString = GRADIENT_STYLE_MAP[gradientId] ?? null;
  const parsedGradient = parseGradientString(gradientString);
  if (parsedGradient) {
    return {
      type: 'gradient',
      gradient: parsedGradient,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  return null;
};

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const prepareSlidesForExport = (
  cards: LayoutCard[],
  slideObjectsByCardId: Record<string, SlideObject[]>,
  activeTheme: ExhibitionTheme,
): SlideExportData[] => {
  return cards.map(card => {
    const mergedSettings: PresentationSettings = {
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...(card.presentationSettings ?? {}),
    };

    const rawObjects = [...(slideObjectsByCardId[card.id] ?? [])];
    rawObjects.sort((a, b) => {
      const left = typeof a.zIndex === 'number' ? a.zIndex : 0;
      const right = typeof b.zIndex === 'number' ? b.zIndex : 0;
      if (left === right) {
        return a.id.localeCompare(b.id);
      }
      return left - right;
    });

    const objects: SlideExportObject[] = rawObjects.map(object => {
      const base: BaseExportObject = {
        id: object.id,
        kind: 'foreign',
        x: toNumber(object.x),
        y: toNumber(object.y),
        width: toNumber(object.width, CANVAS_WIDTH / 3),
        height: toNumber(object.height, CANVAS_HEIGHT / 3),
        rotation: toNumber(object.rotation),
        zIndex: typeof object.zIndex === 'number' ? object.zIndex : 0,
      };

      switch (object.type) {
        case 'text-box': {
          const formatting = extractTextBoxFormatting(object.props as Record<string, unknown> | undefined);
          const text = formatting.text === DEFAULT_TEXT_BOX_TEXT ? '' : formatting.text;
          return {
            ...base,
            kind: 'text',
            text,
            fontSize: formatting.fontSize,
            fontFamily: formatting.fontFamily ?? FONT_FALLBACK,
            bold: formatting.bold,
            italic: formatting.italic,
            underline: formatting.underline,
            align: formatting.align,
            color: formatting.color ?? '#111827',
          } as TextBoxExportObject;
        }
        case 'image':
        case 'accent-image': {
          const props = (object.props ?? {}) as Record<string, unknown>;
          const src = typeof props.src === 'string' ? props.src : null;
          if (!src) {
            return { ...base, kind: 'foreign', objectType: object.type } as ForeignExportObject;
          }
          return {
            ...base,
            kind: 'image',
            src,
            name: typeof props.name === 'string' ? props.name : null,
          } as ImageExportObject;
        }
        case 'shape': {
          const props = (object.props ?? {}) as ShapeObjectProps;
          return {
            ...base,
            kind: 'shape',
            shapeId: props.shapeId,
            fill: typeof props.fill === 'string' ? props.fill : '#111827',
            stroke: typeof props.stroke === 'string' ? props.stroke : 'transparent',
            strokeWidth: toNumber(props.strokeWidth, 0),
            strokeStyle: typeof props.strokeStyle === 'string' ? props.strokeStyle : 'solid',
            opacity: typeof props.opacity === 'number' ? clamp(props.opacity, 0, 1) : 1,
          } as ShapeExportObject;
        }
        case 'table': {
          const props = (object.props ?? {}) as Record<string, unknown>;
          const data = Array.isArray(props.data) ? (props.data as TableCellData[][]) : [];
          return {
            ...base,
            kind: 'table',
            data,
            showOutline: props.showOutline !== false,
          } as TableExportObject;
        }
        case 'chart': {
          const props = (object.props ?? {}) as Record<string, unknown>;
          const chartData = Array.isArray(props.chartData)
            ? (props.chartData as ChartDataRow[])
            : [];
          const chartConfig = (props.chartConfig as ChartConfig) ?? null;
          return {
            ...base,
            kind: 'chart',
            chartConfig,
            chartData,
          } as ChartExportObject;
        }
        default: {
          return {
            ...base,
            kind: 'foreign',
            objectType: object.type,
          } as ForeignExportObject;
        }
      }
    });

    return {
      id: card.id,
      title: card.title ?? '',
      settings: mergedSettings,
      background: resolveBackground(mergedSettings, activeTheme),
      overlay: resolveOverlay(mergedSettings),
      objects,
    };
  });
};

const SHAPE_TYPE_MAP: Partial<Record<string, PptxGenJS.ShapeType>> = {
  rectangle: PptxGenJS.ShapeType.rect,
  'rounded-rectangle': PptxGenJS.ShapeType.roundRect,
  ellipse: PptxGenJS.ShapeType.ellipse,
  circle: PptxGenJS.ShapeType.ellipse,
  triangle: PptxGenJS.ShapeType.triangle,
  diamond: PptxGenJS.ShapeType.diamond,
  pentagon: PptxGenJS.ShapeType.pentagon,
  hexagon: PptxGenJS.ShapeType.hexagon,
  octagon: PptxGenJS.ShapeType.octagon,
  star: PptxGenJS.ShapeType.star,
  burst: PptxGenJS.ShapeType.star,
};

const addBackgroundToSlide = async (
  slide: PptxGenJS.Slide,
  background: SlideBackgroundExport,
): Promise<void> => {
  if (background.type === 'solid' && background.color) {
    slide.background = { color: background.color };
    return;
  }

  if (background.type === 'gradient' && background.gradient) {
    slide.background = { color: background.gradient.colors[0] };
    slide.addShape(PptxGenJS.ShapeType.rect, {
      x: 0,
      y: 0,
      w: PPT_SLIDE_WIDTH_IN,
      h: PPT_SLIDE_HEIGHT_IN,
      fill: {
        type: 'gradient',
        color: background.gradient.colors[0],
        color2: background.gradient.colors[background.gradient.colors.length - 1],
        rotate: background.gradient.angle,
      },
      line: { type: 'none' },
    });
    return;
  }

  if (background.type === 'image' && background.imageSrc) {
    const data = await resolveImageData(background.imageSrc);
    if (data) {
      slide.addImage({
        data,
        x: 0,
        y: 0,
        w: PPT_SLIDE_WIDTH_IN,
        h: PPT_SLIDE_HEIGHT_IN,
      });
    } else {
      slide.background = { color: '#ffffff' };
    }
    return;
  }

  slide.background = { color: '#ffffff' };
};

const addOverlayToSlide = async (
  slide: PptxGenJS.Slide,
  overlay: LayoutOverlayExport | null | undefined,
): Promise<void> => {
  if (!overlay) {
    return;
  }

  const x = toInches(overlay.x, 'x');
  const y = toInches(overlay.y, 'y');
  const w = Math.max(0.01, toInches(overlay.width, 'w'));
  const h = Math.max(0.01, toInches(overlay.height, 'h'));

  if (overlay.type === 'image' && overlay.imageSrc) {
    const data = await resolveImageData(overlay.imageSrc);
    if (data) {
      slide.addImage({ data, x, y, w, h });
    }
    return;
  }

  if (overlay.type === 'gradient' && overlay.gradient) {
    slide.addShape(PptxGenJS.ShapeType.rect, {
      x,
      y,
      w,
      h,
      fill: {
        type: 'gradient',
        color: overlay.gradient.colors[0],
        color2: overlay.gradient.colors[overlay.gradient.colors.length - 1],
        rotate: overlay.gradient.angle,
      },
      line: { type: 'none' },
    });
    return;
  }

  if (overlay.type === 'color' && overlay.color) {
    slide.addShape(PptxGenJS.ShapeType.rect, {
      x,
      y,
      w,
      h,
      fill: { type: 'solid', color: overlay.color },
      line: { type: 'none' },
    });
  }
};

const addTextObject = (slide: PptxGenJS.Slide, object: TextBoxExportObject) => {
  if (!object.text || object.text.trim().length === 0) {
    return;
  }
  slide.addText(object.text, {
    x: toInches(object.x, 'x'),
    y: toInches(object.y, 'y'),
    w: Math.max(0.01, toInches(object.width, 'w')),
    h: Math.max(0.01, toInches(object.height, 'h')),
    fontSize: object.fontSize,
    fontFace: object.fontFamily || FONT_FALLBACK,
    color: normaliseHex(object.color, '#111827'),
    bold: object.bold,
    italic: object.italic,
    underline: object.underline,
    align: object.align,
    valign: 'top',
    margin: 0,
    rotate: object.rotation,
  });
};

const addImageObject = async (slide: PptxGenJS.Slide, object: ImageExportObject) => {
  const data = await resolveImageData(object.src);
  if (!data) {
    return;
  }
  slide.addImage({
    data,
    x: toInches(object.x, 'x'),
    y: toInches(object.y, 'y'),
    w: Math.max(0.01, toInches(object.width, 'w')),
    h: Math.max(0.01, toInches(object.height, 'h')),
    rotate: object.rotation,
  });
};

const addShapeObject = async (slide: PptxGenJS.Slide, object: ShapeExportObject) => {
  const shapeType = SHAPE_TYPE_MAP[object.shapeId];
  if (!shapeType) {
    const data = await captureElementAsImage(findObjectElement(object.id));
    if (data) {
      slide.addImage({
        data,
        x: toInches(object.x, 'x'),
        y: toInches(object.y, 'y'),
        w: Math.max(0.01, toInches(object.width, 'w')),
        h: Math.max(0.01, toInches(object.height, 'h')),
        rotate: object.rotation,
      });
    }
    return;
  }

  const fillColor = object.fill === 'transparent' ? undefined : normaliseHex(object.fill, '#111827');
  const lineColor = object.stroke === 'transparent' ? undefined : normaliseHex(object.stroke, '#111827');

  slide.addShape(shapeType, {
    x: toInches(object.x, 'x'),
    y: toInches(object.y, 'y'),
    w: Math.max(0.01, toInches(object.width, 'w')),
    h: Math.max(0.01, toInches(object.height, 'h')),
    fill:
      fillColor
        ? {
            type: 'solid',
            color: fillColor,
            transparency: clamp(100 - object.opacity * 100, 0, 100),
          }
        : { type: 'none' },
    line: lineColor
      ? {
          color: lineColor,
          width: clamp(object.strokeWidth / 2, 0.25, 12),
        }
      : { type: 'none' },
    rotate: object.rotation,
  });
};

const addTableObject = (slide: PptxGenJS.Slide, object: TableExportObject) => {
  const rows = object.data.length > 0 ? object.data : [[{ content: '', formatting: object.data[0]?.[0]?.formatting ?? { fontFamily: FONT_FALLBACK, fontSize: 14, bold: false, italic: false, underline: false, strikethrough: false, align: 'left', color: '#111827' } } as TableCellData]];
  const tableRows = rows.map(row =>
    row.map(cell => {
      const formatting = cell.formatting;
      const cellOptions: PptxGenJS.TableCellProps = {
        fontFace: formatting.fontFamily || FONT_FALLBACK,
        fontSize: formatting.fontSize || 14,
        bold: formatting.bold,
        italic: formatting.italic,
        underline: formatting.underline,
        align: formatting.align,
        color: normaliseHex(formatting.color || '#111827', '#111827'),
        valign: 'middle',
      };
      if (cell.rowSpan && cell.rowSpan > 1) {
        cellOptions.rowSpan = cell.rowSpan;
      }
      if (cell.colSpan && cell.colSpan > 1) {
        cellOptions.colSpan = cell.colSpan;
      }
      return { text: cell.content ?? '', options: cellOptions };
    }),
  );

  slide.addTable(tableRows, {
    x: toInches(object.x, 'x'),
    y: toInches(object.y, 'y'),
    w: Math.max(0.01, toInches(object.width, 'w')),
    h: Math.max(0.01, toInches(object.height, 'h')),
    margin: 0,
    border: object.showOutline ? { pt: 1, color: 'CFCFCF' } : { type: 'none' },
  });
};

const addChartObject = async (slide: PptxGenJS.Slide, object: ChartExportObject) => {
  const element = findObjectElement(object.id);
  const data = await captureElementAsImage(element, { backgroundColor: '#ffffff' });
  if (!data) {
    return;
  }
  slide.addImage({
    data,
    x: toInches(object.x, 'x'),
    y: toInches(object.y, 'y'),
    w: Math.max(0.01, toInches(object.width, 'w')),
    h: Math.max(0.01, toInches(object.height, 'h')),
    rotate: object.rotation,
  });
};

const addForeignObject = async (slide: PptxGenJS.Slide, object: ForeignExportObject) => {
  const element = findObjectElement(object.id);
  const data = await captureElementAsImage(element, { backgroundColor: '#ffffff' });
  if (!data) {
    return;
  }
  slide.addImage({
    data,
    x: toInches(object.x, 'x'),
    y: toInches(object.y, 'y'),
    w: Math.max(0.01, toInches(object.width, 'w')),
    h: Math.max(0.01, toInches(object.height, 'h')),
    rotate: object.rotation,
  });
};

export const exportToPowerPoint = async (
  slides: SlideExportData[],
  title: string = 'Presentation',
): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('PowerPoint export is only available in the browser.');
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Exhibition Mode';
  pptx.title = title;
  pptx.subject = 'Exported Presentation';

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    await addBackgroundToSlide(slide, slideData.background);
    await addOverlayToSlide(slide, slideData.overlay);

    const orderedObjects = [...slideData.objects].sort((a, b) => a.zIndex - b.zIndex);
    for (const object of orderedObjects) {
      switch (object.kind) {
        case 'text':
          addTextObject(slide, object);
          break;
        case 'image':
          await addImageObject(slide, object);
          break;
        case 'shape':
          await addShapeObject(slide, object);
          break;
        case 'table':
          addTableObject(slide, object);
          break;
        case 'chart':
          await addChartObject(slide, object);
          break;
        case 'foreign':
          await addForeignObject(slide, object);
          break;
        default:
          break;
      }
    }
  }

  await pptx.writeFile({ fileName: `${title}.pptx` });
};

export const exportToPDF = async (
  slides: SlideExportData[],
  title: string = 'Presentation',
): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('PDF export is only available in the browser.');
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1920, 1080] });
  let first = true;

  for (const slide of slides) {
    if (!first) {
      pdf.addPage();
    }
    first = false;

    const element = findSlideElement(slide.id);
    if (!element) {
      pdf.setFontSize(18);
      pdf.text(`Slide ${slides.indexOf(slide) + 1}`, 80, 120);
      continue;
    }

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: IMAGE_CAPTURE_SCALE,
        useCORS: true,
        logging: false,
      });
      const data = canvas.toDataURL('image/png');
      pdf.addImage(data, 'PNG', 0, 0, 1920, 1080);
    } catch (error) {
      console.warn('[Exhibition] Failed to capture slide for PDF export', error);
      pdf.setFontSize(18);
      pdf.text(`Slide ${slides.indexOf(slide) + 1}`, 80, 120);
    }
  }

  pdf.save(`${title}.pdf`);
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportAsImages = async (
  slides: SlideExportData[],
  title: string = 'Presentation',
): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('Image export is only available in the browser.');
  }

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    const element = findSlideElement(slide.id);
    if (!element) {
      continue;
    }

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: IMAGE_CAPTURE_SCALE,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        triggerDownload(blob, `${title}-slide-${index + 1}.png`);
      }
    } catch (error) {
      console.warn(`[Exhibition] Failed to export slide ${index + 1} as image`, error);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }
};
