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
import { EXHIBITION_EXPORT_API } from '@/lib/api';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 520;
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

const toNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normaliseHex = (value: string | null | undefined, fallback: string): string => {
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

const parseGradientString = (
  value: string | null | undefined,
): { angle: number; colors: string[] } | null => {
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
): Promise<{ dataUrl: string; width: number; height: number } | null> => {
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
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  } catch (error) {
    console.warn('[Exhibition] Unable to capture element for export', error);
    return null;
  }
};

const findSlideElement = (slideId: string): HTMLElement | null => {
  return document.querySelector(`[data-exhibition-slide-id="${slideId}"]`) as HTMLElement | null;
};

const resolveOverlayRect = (
  layout: CardLayout,
): { x: number; y: number; width: number; height: number } | null => {
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

interface SlideBackgroundExport {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: { angle: number; colors: string[] };
  imageSrc?: string;
  imageData?: string | null;
}

interface LayoutOverlayExport {
  type: 'color' | 'gradient' | 'image';
  color?: string;
  gradient?: { angle: number; colors: string[] };
  imageSrc?: string;
  imageData?: string | null;
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
  data?: string | null;
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

export interface SlideScreenshot {
  id: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  scale: number;
}

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
          } satisfies TextBoxExportObject;
        }
        case 'image':
        case 'accent-image': {
          const props = (object.props ?? {}) as Record<string, unknown>;
          const src = typeof props.src === 'string' ? props.src : '';
          return {
            ...base,
            kind: 'image',
            src,
            name: typeof props.name === 'string' ? props.name : null,
            data: null,
          } satisfies ImageExportObject;
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
          } satisfies ShapeExportObject;
        }
        case 'table': {
          const props = (object.props ?? {}) as Record<string, unknown>;
          const data = Array.isArray(props.data) ? (props.data as TableCellData[][]) : [];
          return {
            ...base,
            kind: 'table',
            data,
            showOutline: props.showOutline !== false,
          } satisfies TableExportObject;
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
          } satisfies ChartExportObject;
        }
        default: {
          return {
            ...base,
            kind: 'foreign',
            objectType: object.type,
          } satisfies ForeignExportObject;
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

export const hydrateSlidesWithAssets = async (
  slides: SlideExportData[],
): Promise<SlideExportData[]> => {
  const enrichedSlides = await Promise.all(
    slides.map(async slide => {
      const backgroundImageData =
        slide.background.type === 'image'
          ? await resolveImageData(slide.background.imageSrc)
          : null;

      const overlayImageData =
        slide.overlay && slide.overlay.type === 'image'
          ? await resolveImageData(slide.overlay.imageSrc)
          : null;

      const objects = await Promise.all(
        slide.objects.map(async object => {
          if (object.kind === 'image') {
            const data = await resolveImageData(object.src);
            return { ...object, data } satisfies ImageExportObject;
          }
          return object;
        }),
      );

      return {
        ...slide,
        background: { ...slide.background, imageData: backgroundImageData },
        overlay: slide.overlay?.type === 'image' ? { ...slide.overlay, imageData: overlayImageData } : slide.overlay,
        objects,
      } satisfies SlideExportData;
    }),
  );

  return enrichedSlides;
};

const splitDataUrl = (
  dataUrl: string,
): { mimeType: string; base64: string } => {
  const [header, payload] = dataUrl.split(',', 2);
  const mimeMatch = header?.match(/data:([^;]+);base64/);
  return {
    mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
    base64: payload ?? '',
  };
};

export const captureSlidesAsImages = async (
  slideIds: string[],
  options: { backgroundColor?: string | null; scale?: number } = {},
): Promise<SlideScreenshot[]> => {
  const screenshots: SlideScreenshot[] = [];
  for (const slideId of slideIds) {
    const element = findSlideElement(slideId);
    const capture = await captureElementAsImage(element, options);
    if (!capture) {
      continue;
    }
    const { mimeType, base64 } = splitDataUrl(capture.dataUrl);
    screenshots.push({
      id: slideId,
      dataUrl: capture.dataUrl,
      base64,
      mimeType,
      width: capture.width,
      height: capture.height,
      scale: options.scale ?? IMAGE_CAPTURE_SCALE,
    });
  }
  return screenshots;
};

const sanitizeFilename = (value: string): string => {
  const safe = value
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length > 0 ? safe : 'presentation';
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

interface ExportRequestPayload {
  title: string;
  slides: SlideExportData[];
  screenshots: Array<{
    id: string;
    data: string;
    mimeType: string;
    width: number;
    height: number;
    scale: number;
  }>;
}

const postExportRequest = async (path: 'pptx' | 'pdf', payload: ExportRequestPayload): Promise<Response> => {
  const response = await fetch(`${EXHIBITION_EXPORT_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Failed to export presentation';
    try {
      const data = await response.json();
      if (typeof data?.detail === 'string') {
        message = data.detail;
      }
    } catch {
      const text = await response.text();
      if (text.trim().length > 0) {
        message = text;
      }
    }
    throw new Error(message);
  }

  return response;
};

const buildExportPayload = (
  slides: SlideExportData[],
  title: string,
  screenshots: SlideScreenshot[],
): ExportRequestPayload => ({
  title,
  slides,
  screenshots: screenshots.map(screenshot => ({
    id: screenshot.id,
    data: screenshot.base64,
    mimeType: screenshot.mimeType,
    width: screenshot.width,
    height: screenshot.height,
    scale: screenshot.scale,
  })),
});

export const exportToPowerPoint = async (
  slides: SlideExportData[],
  title: string = 'Presentation',
  screenshots: SlideScreenshot[] = [],
): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('PowerPoint export is only available in the browser.');
  }
  if (slides.length === 0) {
    throw new Error('No slides to export');
  }

  const payload = buildExportPayload(slides, title, screenshots);
  const response = await postExportRequest('pptx', payload);
  const blob = await response.blob();
  triggerDownload(blob, `${sanitizeFilename(title)}.pptx`);
};

export const exportToPDF = async (
  slides: SlideExportData[],
  title: string = 'Presentation',
  screenshots: SlideScreenshot[] = [],
): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('PDF export is only available in the browser.');
  }
  if (slides.length === 0) {
    throw new Error('No slides to export');
  }

  const payload = buildExportPayload(slides, title, screenshots);
  const response = await postExportRequest('pdf', payload);
  const blob = await response.blob();
  triggerDownload(blob, `${sanitizeFilename(title)}.pdf`);
};

export const exportAsImages = async (
  screenshots: SlideScreenshot[],
  title: string = 'Presentation',
): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('Image export is only available in the browser.');
  }

  for (let index = 0; index < screenshots.length; index += 1) {
    const screenshot = screenshots[index];
    if (!screenshot?.base64) {
      continue;
    }
    const byteString = atob(screenshot.base64);
    const length = byteString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: screenshot.mimeType });
    triggerDownload(blob, `${sanitizeFilename(title)}-slide-${index + 1}.png`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
};
