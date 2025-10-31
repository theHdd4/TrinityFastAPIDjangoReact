import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

import { EXHIBITION_API } from '@/lib/api';
import {
  type CardWidth,
  DEFAULT_PRESENTATION_SETTINGS,
  type LayoutCard,
  type PresentationSettings,
  type SlideObject,
  resolveCardTitle,
} from '../store/exhibitionStore';
import { SlideCanvas } from '../components/SlideCanvas';

type SlideObjectMap = Record<string, SlideObject[] | undefined>;

type JsonCompatible =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null;

const EXPORT_CONTAINER_ID = 'exhibition-export-container';
const WAIT_FOR_RENDER_MS = 120;
const DOWNLOAD_DELAY_MS = 80;
const PRESENTATION_STAGE_HEIGHT = 520;
const CLIENT_RENDER_PIXEL_RATIO = 3;

const RENDERER_UNAVAILABLE_PATTERNS = [
  /server-side renderer failed/i,
  /playwright is not installed/i,
  /renderer is not available/i,
  /renderer failed/i,
  /rendering service unavailable/i,
];

const extractRendererErrorMessage = (raw: string): string => {
  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const detail = (parsed as { detail?: unknown }).detail;
      if (typeof detail === 'string') {
        return detail;
      }
      if (detail && typeof detail === 'object') {
        const detailMessage = (detail as { message?: unknown }).message;
        if (typeof detailMessage === 'string') {
          return detailMessage;
        }
        try {
          return JSON.stringify(detail);
        } catch {
          /* no-op */
        }
      }
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    /* fall through */
  }

  return raw;
};

const isRendererUnavailable = (status: number, message: string): boolean => {
  if (status >= 500) {
    return true;
  }
  if (!message) {
    return false;
  }
  return RENDERER_UNAVAILABLE_PATTERNS.some(pattern => pattern.test(message));
};

export class SlideRendererUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlideRendererUnavailableError';
  }
}

const CARD_WIDTH_DIMENSIONS: Record<CardWidth, { width: number; height: number }> = {
  M: { width: 832, height: PRESENTATION_STAGE_HEIGHT },
  L: { width: 1088, height: PRESENTATION_STAGE_HEIGHT },
};

const FALLBACK_BASE_WIDTH = CARD_WIDTH_DIMENSIONS[DEFAULT_PRESENTATION_SETTINGS.cardWidth].width;
const FALLBACK_BASE_HEIGHT = CARD_WIDTH_DIMENSIONS[DEFAULT_PRESENTATION_SETTINGS.cardWidth].height;
const MAX_CAPTURE_ATTEMPTS = 2;

const DEFAULT_PDF_UNIT: 'pt' | 'px' = 'px';

const isSecurityError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'SecurityError') {
    return true;
  }

  return /SecurityError/i.test(error.message);
};

const clonePlainObject = <T,>(value: T): T => {
  if (typeof window !== 'undefined' && typeof window.structuredClone === 'function') {
    try {
      return window.structuredClone(value);
    } catch (error) {
      console.warn('[Exhibition Export] structuredClone failed, falling back to JSON clone', error);
    }
  }

  try {
    return JSON.parse(JSON.stringify(value ?? null)) as T;
  } catch {
    return value;
  }
};

const DATA_URL_PATTERN = /^data:image\//i;

const imageDataUrlCache = new Map<string, Promise<string>>();

const readBlobAsDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to convert image to data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read image contents.'));
    reader.readAsDataURL(blob);
  });
};

const fetchImageAsDataUrl = async (src: string): Promise<string> => {
  if (imageDataUrlCache.has(src)) {
    return imageDataUrlCache.get(src) as Promise<string>;
  }

  const request = fetch(src, { credentials: 'include', mode: 'cors' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Unable to fetch image (${response.status})`);
      }
      return response.blob();
    })
    .then(readBlobAsDataUrl);

  imageDataUrlCache.set(src, request);
  return request;
};

const ensureImageDataUrl = async (props: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const nextProps = { ...props };

  const dataUrlValue = typeof nextProps.dataUrl === 'string' ? nextProps.dataUrl : null;
  if (dataUrlValue && DATA_URL_PATTERN.test(dataUrlValue)) {
    return nextProps;
  }

  const srcValue = typeof nextProps.src === 'string' ? nextProps.src : null;
  const candidate = dataUrlValue || srcValue;

  if (!candidate) {
    return nextProps;
  }

  if (DATA_URL_PATTERN.test(candidate)) {
    nextProps.dataUrl = candidate;
    if (!srcValue) {
      nextProps.src = candidate;
    }
    return nextProps;
  }

  try {
    const dataUrl = await fetchImageAsDataUrl(candidate);
    nextProps.dataUrl = dataUrl;
    if (!srcValue || srcValue === candidate) {
      nextProps.src = dataUrl;
    }
    return nextProps;
  } catch (error) {
    console.error('[Exhibition Export] Unable to inline image for export', candidate, error);
    throw new Error('We could not include one of the slide images in the export.');
  }
};

const loadImageElement = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load captured image.'));
    image.src = dataUrl;
  });
};

const loadImageDimensions = async (
  dataUrl: string,
): Promise<{ image: HTMLImageElement; width: number; height: number }> => {
  const image = await loadImageElement(dataUrl);
  return { image, width: image.naturalWidth, height: image.naturalHeight };
};

const sanitiseTitle = (value?: string | null) => {
  if (!value) {
    return 'Exhibition Presentation';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Exhibition Presentation';
};

const getPixelRatio = (preferred?: number): number => {
  const deviceRatio =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : 1;
  const desired = preferred ?? Math.max(2, deviceRatio);
  return Math.min(Math.max(desired, 1), 4);
};

const ensureBrowserEnvironment = (action: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error(`${action} is only available in a browser environment.`);
  }
};

const collectDocumentStyles = (): ExportDocumentStyles => {
  ensureBrowserEnvironment('Style collection');

  const inline = Array.from(document.querySelectorAll('style'))
    .map(node => node.textContent?.trim() ?? '')
    .filter(content => content.length > 0);

  const external = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => {
      const href = (link as HTMLLinkElement).href;
      if (!href) {
        return null;
      }
      try {
        return new URL(href, window.location.href).href;
      } catch {
        return href;
      }
    })
    .filter((value): value is string => Boolean(value));

  const uniqueInline = Array.from(new Set(inline));
  const uniqueExternal = Array.from(new Set(external));

  const baseUrl = window.location?.origin;

  return {
    inline: uniqueInline,
    external: uniqueExternal,
    baseUrl,
  };
};

const parseTransformScale = (transform: string | null | undefined): { scaleX: number; scaleY: number } => {
  if (!transform || transform === 'none') {
    return { scaleX: 1, scaleY: 1 };
  }

  const normalise = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }
    return value;
  };

  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if (matrixMatch) {
    const values = matrixMatch[1]
      .split(',')
      .map(part => Number.parseFloat(part.trim()))
      .filter(Number.isFinite);
    if (values.length >= 4) {
      const [a, b, c, d] = values;
      const scaleX = Math.sqrt(a * a + b * b);
      const scaleY = Math.sqrt(c * c + d * d);
      return { scaleX: normalise(scaleX), scaleY: normalise(scaleY) };
    }
  }

  const matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1]
      .split(',')
      .map(part => Number.parseFloat(part.trim()))
      .filter(Number.isFinite);
    if (values.length >= 16) {
      const scaleX = Math.sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2]);
      const scaleY = Math.sqrt(values[4] * values[4] + values[5] * values[5] + values[6] * values[6]);
      return { scaleX: normalise(scaleX), scaleY: normalise(scaleY) };
    }
  }

  const scaleMatch = transform.match(/scale\(([^)]+)\)/);
  if (scaleMatch) {
    const parts = scaleMatch[1]
      .split(',')
      .map(part => Number.parseFloat(part.trim()))
      .filter(Number.isFinite);
    if (parts.length === 1) {
      const scale = normalise(parts[0]);
      return { scaleX: scale, scaleY: scale };
    }
    if (parts.length >= 2) {
      return { scaleX: normalise(parts[0]), scaleY: normalise(parts[1]) };
    }
  }

  return { scaleX: 1, scaleY: 1 };
};

const resolveSlideDimensions = (
  element: HTMLElement,
): { width: number; height: number; rect: DOMRect; scaleX: number; scaleY: number } => {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const vendorTransforms = computed as unknown as {
    webkitTransform?: string;
    mozTransform?: string;
    msTransform?: string;
  };
  const vendorTransform =
    vendorTransforms.webkitTransform ?? vendorTransforms.mozTransform ?? vendorTransforms.msTransform ?? '';
  const { scaleX, scaleY } = parseTransformScale(computed.transform || vendorTransform);

  const normalise = (value: number, fallback: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  };

  const baseWidth = scaleX > 0 ? rect.width / scaleX : rect.width;
  const baseHeight = scaleY > 0 ? rect.height / scaleY : rect.height;

  return {
    width: normalise(baseWidth, FALLBACK_BASE_WIDTH),
    height: normalise(baseHeight, FALLBACK_BASE_HEIGHT),
    rect,
    scaleX: scaleX > 0 ? scaleX : 1,
    scaleY: scaleY > 0 ? scaleY : 1,
  };
};

const serialiseSlideElement = (element: HTMLElement, width: number, height: number): string => {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  clone.style.margin = '0';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.right = 'auto';
  clone.style.bottom = 'auto';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  if (!clone.style.position) {
    clone.style.position = 'relative';
  }
  return clone.outerHTML;
};

const createDomSnapshot = (
  element: HTMLElement,
  cardId: string,
  pixelRatio: number,
  width: number,
  height: number,
): SlideDomSnapshot => {
  return {
    cardId,
    html: serialiseSlideElement(element, width, height),
    width,
    height,
    pixelRatio,
  };
};

const resolveDesignDimensions = (
  card: LayoutCard,
  measuredWidth: number,
  measuredHeight: number,
): { width: number; height: number } => {
  const cardWidthSetting = card.presentationSettings?.cardWidth as CardWidth | undefined;
  const fallbackDimensions = CARD_WIDTH_DIMENSIONS[DEFAULT_PRESENTATION_SETTINGS.cardWidth];
  const targetDimensions = (cardWidthSetting && CARD_WIDTH_DIMENSIONS[cardWidthSetting]) || fallbackDimensions;

  const width = (() => {
    if (targetDimensions?.width && targetDimensions.width > 0) {
      return targetDimensions.width;
    }
    if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
      return measuredWidth;
    }
    return FALLBACK_BASE_WIDTH;
  })();

  const height = (() => {
    if (targetDimensions?.height && targetDimensions.height > 0) {
      return targetDimensions.height;
    }
    if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
      return measuredHeight;
    }
    return FALLBACK_BASE_HEIGHT;
  })();

  return { width, height };
};

export interface PrepareSlidesForExportOptions {
  pixelRatio?: number;
  captureImages?: boolean;
  includeDomSnapshot?: boolean;
}

export interface SlideCaptureResult {
  cardId: string;
  dataUrl: string;
  cssWidth: number;
  cssHeight: number;
  imageWidth: number;
  imageHeight: number;
  pixelRatio: number;
}

export interface SlideDomSnapshot {
  cardId: string;
  html: string;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface ExportDocumentStyles {
  inline: string[];
  external: string[];
  baseUrl?: string;
}

export interface PreparedSlidesForExport {
  captures: SlideCaptureResult[];
  domSnapshots: Map<string, SlideDomSnapshot>;
  documentStyles: ExportDocumentStyles | null;
}

export interface RenderedSlideScreenshot {
  id: string;
  index: number;
  dataUrl: string;
  width: number;
  height: number;
  cssWidth?: number | null;
  cssHeight?: number | null;
  pixelRatio?: number | null;
}

const buildSlideIndexLookup = (cards: LayoutCard[]): Map<string, number> => {
  return cards.reduce((lookup, card, index) => {
    lookup.set(card.id, index);
    return lookup;
  }, new Map<string, number>());
};

const resolvePreparedPixelRatio = (
  prepared?: PreparedSlidesForExport | null,
): number | null => {
  if (!prepared?.domSnapshots || prepared.domSnapshots.size === 0) {
    return null;
  }

  const iterator = prepared.domSnapshots.values().next();
  if (!iterator || !iterator.value) {
    return null;
  }

  const ratio = iterator.value.pixelRatio;
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : null;
};

export const createRenderedSlideScreenshotsFromCaptures = (
  captures: SlideCaptureResult[],
  cards: LayoutCard[],
): RenderedSlideScreenshot[] => {
  if (!Array.isArray(captures) || captures.length === 0) {
    return [];
  }

  const indexLookup = buildSlideIndexLookup(cards);

  return captures
    .map(capture => {
      const index = indexLookup.get(capture.cardId);
      if (typeof index !== 'number') {
        return null;
      }

      return {
        id: capture.cardId,
        index,
        dataUrl: capture.dataUrl,
        width: capture.imageWidth,
        height: capture.imageHeight,
        cssWidth: capture.cssWidth,
        cssHeight: capture.cssHeight,
        pixelRatio: capture.pixelRatio,
      } satisfies RenderedSlideScreenshot;
    })
    .filter((entry): entry is RenderedSlideScreenshot => Boolean(entry))
    .sort((a, b) => a.index - b.index);
};

const renderSlideForCapture = (
  root: ReturnType<typeof createRoot>,
  card: LayoutCard,
  slideIndex: number,
  totalSlides: number,
): Promise<void> => {
  return new Promise(resolve => {
    root.render(
      <StrictMode>
        <SlideCanvas
          card={card}
          slideNumber={slideIndex + 1}
          totalSlides={totalSlides}
          onDrop={() => {
            /* no-op during export */
          }}
          draggedAtom={null}
          canEdit={false}
          presentationMode
          viewMode="horizontal"
        />
      </StrictMode>,
    );

    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, WAIT_FOR_RENDER_MS);
    });
  });
};

export const prepareSlidesForExport = async (
  cards: LayoutCard[],
  options?: PrepareSlidesForExportOptions,
): Promise<PreparedSlidesForExport> => {
  ensureBrowserEnvironment('Slide preparation');

  const captureImages = options?.captureImages ?? true;
  const includeDomSnapshot = options?.includeDomSnapshot ?? false;

  if (!captureImages && !includeDomSnapshot) {
    return {
      captures: [],
      domSnapshots: new Map(),
      documentStyles: null,
    };
  }

  if (cards.length === 0) {
    return {
      captures: [],
      domSnapshots: new Map(),
      documentStyles: includeDomSnapshot ? collectDocumentStyles() : null,
    };
  }

  const container = document.createElement('div');
  container.id = EXPORT_CONTAINER_ID;
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.width = '1600px';
  container.style.height = '1200px';
  container.style.pointerEvents = 'none';
  container.style.opacity = '0';
  container.style.zIndex = '-1';
  container.style.userSelect = 'none';
  container.setAttribute('aria-hidden', 'true');

  document.body.appendChild(container);
  const root = createRoot(container);

  const captures: SlideCaptureResult[] = [];
  const domSnapshots = new Map<string, SlideDomSnapshot>();
  const failures: string[] = [];
  const pixelRatio = getPixelRatio(options?.pixelRatio);
  let collectedStyles: ExportDocumentStyles | null = null;

  try {
    const fontReady = (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    if (fontReady instanceof Promise) {
      try {
        await fontReady;
      } catch (error) {
        console.warn('[Exhibition Export] Font loading promise rejected', error);
      }
    }

    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      await renderSlideForCapture(root, card, index, cards.length);

      const slideElement = container.querySelector<HTMLElement>(
        `[data-exhibition-slide-id="${card.id}"]`,
      );

      if (!slideElement) {
        failures.push(card.id);
        continue;
      }

      const { width: measuredWidth, height: measuredHeight } = resolveSlideDimensions(slideElement);
      const { width: designWidth, height: designHeight } = resolveDesignDimensions(
        card,
        measuredWidth,
        measuredHeight,
      );

      if ((captureImages || includeDomSnapshot) && (designWidth === 0 || designHeight === 0)) {
        failures.push(card.id);
        continue;
      }

      if (includeDomSnapshot) {
        domSnapshots.set(
          card.id,
          createDomSnapshot(slideElement, card.id, pixelRatio, designWidth, designHeight),
        );
        if (!collectedStyles) {
          collectedStyles = collectDocumentStyles();
        }
      }

      if (!captureImages) {
        continue;
      }

      try {
        let dataUrl: string | null = null;
        let attempt = 0;

        while (attempt < MAX_CAPTURE_ATTEMPTS && !dataUrl) {
          attempt += 1;

          try {
            const targetWidth = Math.round(designWidth);
            const targetHeight = Math.round(designHeight);

            const pngOptions = {
              pixelRatio,
              cacheBust: true,
              width: targetWidth,
              height: targetHeight,
              canvasWidth: Math.round(targetWidth * pixelRatio),
              canvasHeight: Math.round(targetHeight * pixelRatio),
              style: {
                transform: 'none',
                transformOrigin: 'top left',
                margin: '0',
                padding: '0',
                boxShadow: 'none',
                maxWidth: 'none',
                left: '0',
                top: '0',
                width: `${targetWidth}px`,
                height: `${targetHeight}px`,
              },
              ...(attempt > 1 ? { skipFonts: true } : {}),
            } as Parameters<typeof toPng>[1];

            dataUrl = await toPng(slideElement, pngOptions);
          } catch (error) {
            if (attempt >= MAX_CAPTURE_ATTEMPTS || !isSecurityError(error)) {
              throw error;
            }

            console.warn(
              '[Exhibition Export] Retrying slide capture without embedding fonts due to restricted stylesheet',
              error,
            );
          }
        }

        if (!dataUrl) {
          throw new Error('Unable to capture slide image.');
        }

        const { image, width: initialWidth, height: initialHeight } = await loadImageDimensions(dataUrl);
        const expectedWidth = Math.round(designWidth * pixelRatio);
        const expectedHeight = Math.round(designHeight * pixelRatio);

        let imageWidth = initialWidth;
        let imageHeight = initialHeight;
        let finalDataUrl = dataUrl;

        if (
          expectedWidth > 0 &&
          expectedHeight > 0 &&
          (Math.abs(imageWidth - expectedWidth) > 1 || Math.abs(imageHeight - expectedHeight) > 1)
        ) {
          const canvas = document.createElement('canvas');
          canvas.width = expectedWidth;
          canvas.height = expectedHeight;
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('Unable to adjust slide capture dimensions.');
          }

          const sourceWidth = Math.min(expectedWidth, imageWidth);
          const sourceHeight = Math.min(expectedHeight, imageHeight);

          context.drawImage(
            image,
            0,
            0,
            sourceWidth,
            sourceHeight,
            0,
            0,
            expectedWidth,
            expectedHeight,
          );

          finalDataUrl = canvas.toDataURL('image/png');
          imageWidth = expectedWidth;
          imageHeight = expectedHeight;
        }

        captures.push({
          cardId: card.id,
          dataUrl: finalDataUrl,
          cssWidth: designWidth,
          cssHeight: designHeight,
          imageWidth,
          imageHeight,
          pixelRatio,
        });
      } catch (error) {
        console.error('[Exhibition Export] Failed to capture slide', card.id, error);
        failures.push(card.id);
      }
    }
  } finally {
    try {
      root.render(<></>);
      root.unmount();
    } catch (error) {
      console.warn('[Exhibition Export] Failed to unmount capture root', error);
    }
    container.remove();
  }

  if (failures.length > 0) {
    throw new Error(
      `Unable to prepare ${failures.length} slide${failures.length === 1 ? '' : 's'} for export.`,
    );
  }

  return {
    captures,
    domSnapshots,
    documentStyles: includeDomSnapshot ? collectedStyles ?? collectDocumentStyles() : null,
  };
};

export const renderSlidesClientSideForDownload = async (
  cards: LayoutCard[],
  prepared?: PreparedSlidesForExport | null,
  options?: { pixelRatio?: number },
): Promise<RenderedSlideScreenshot[]> => {
  const preferredPixelRatio =
    (typeof options?.pixelRatio === 'number' && Number.isFinite(options.pixelRatio) && options.pixelRatio > 0
      ? options.pixelRatio
      : null) ?? resolvePreparedPixelRatio(prepared) ?? CLIENT_RENDER_PIXEL_RATIO;

  const existingCaptures = prepared?.captures ?? [];
  const captures =
    existingCaptures.length > 0
      ? existingCaptures
      : (
          await prepareSlidesForExport(cards, {
            captureImages: true,
            includeDomSnapshot: false,
            pixelRatio: preferredPixelRatio,
          })
        ).captures;

  return createRenderedSlideScreenshotsFromCaptures(captures, cards);
};

const toPositiveNumber = (value: unknown): number | null => {
  if (typeof value !== 'number') {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
};

const computeScreenshotDimensions = (
  screenshot: RenderedSlideScreenshot,
): { width: number; height: number } => {
  const pixelRatio = toPositiveNumber(screenshot.pixelRatio) ?? 1;

  const normalisedWidth =
    toPositiveNumber(screenshot.cssWidth) ?? toPositiveNumber(screenshot.width / pixelRatio) ?? screenshot.width;
  const normalisedHeight =
    toPositiveNumber(screenshot.cssHeight) ?? toPositiveNumber(screenshot.height / pixelRatio) ?? screenshot.height;

  const width = Math.max(Math.round(normalisedWidth), 1);
  const height = Math.max(Math.round(normalisedHeight), 1);

  return { width, height };
};

const createPdfFromScreenshots = (
  screenshots: RenderedSlideScreenshot[],
): jsPDF => {
  if (screenshots.length === 0) {
    throw new Error('No slides available for PDF export.');
  }

  const ordered = [...screenshots].sort((a, b) => a.index - b.index);
  const baseDimensions = computeScreenshotDimensions(ordered[0]);
  const baseOrientation = baseDimensions.width >= baseDimensions.height ? 'landscape' : 'portrait';

  const pdf = new jsPDF({
    orientation: baseOrientation,
    unit: DEFAULT_PDF_UNIT,
    format: [baseDimensions.width, baseDimensions.height],
  });

  ordered.forEach((screenshot, index) => {
    const { width, height } = computeScreenshotDimensions(screenshot);
    const orientation = width >= height ? 'landscape' : 'portrait';

    if (index > 0) {
      pdf.addPage([width, height], orientation);
    }

    pdf.addImage(screenshot.dataUrl, 'PNG', 0, 0, width, height);
  });

  return pdf;
};

export interface ExportSlidesAsPdfOptions {
  title?: string;
  pixelRatio?: number;
}

export const exportSlidesAsPdfClientSide = async (
  cards: LayoutCard[],
  prepared: PreparedSlidesForExport | null,
  options?: ExportSlidesAsPdfOptions,
): Promise<{ fileName: string; slideCount: number }> => {
  ensureBrowserEnvironment('Client-side PDF export');

  const screenshots = await renderSlidesClientSideForDownload(cards, prepared, {
    pixelRatio: options?.pixelRatio,
  });

  if (screenshots.length === 0) {
    throw new Error('Unable to capture slides for PDF export.');
  }

  const pdf = createPdfFromScreenshots(screenshots);
  const resolvedTitle = sanitiseTitle(options?.title);
  const fileName = `${sanitizeFileName(resolvedTitle)}.pdf`;

  await pdf.save(fileName, { returnPromise: true });

  return { fileName, slideCount: screenshots.length };
};

export interface SlideExportObjectPayload {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  groupId?: string | null;
  props: Record<string, unknown>;
}

export interface SlideScreenshotPayload {
  dataUrl: string;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
}

export interface SlideDomSnapshotPayload {
  html: string;
  width: number;
  height: number;
  pixelRatio?: number;
}

export interface SlideExportPayload {
  id: string;
  index: number;
  title?: string | null;
  baseWidth: number;
  baseHeight: number;
  presentationSettings?: PresentationSettings | null;
  objects: SlideExportObjectPayload[];
  screenshot?: SlideScreenshotPayload;
  domSnapshot?: SlideDomSnapshotPayload;
}

export interface ExhibitionExportPayload {
  title: string;
  slides: SlideExportPayload[];
  documentStyles?: ExportDocumentStyles | null;
}

export interface BuildPresentationExportOptions {
  title?: string;
}

const normaliseObjects = async (
  objects: SlideObject[] | undefined,
): Promise<SlideExportObjectPayload[]> => {
  if (!objects || objects.length === 0) {
    return [];
  }

  return Promise.all(
    objects.map(async object => {
      const props = clonePlainObject(object.props ?? {});
      const normalisedProps =
        object.type === 'image' ? await ensureImageDataUrl(props) : props;

      const groupId =
        typeof object.groupId === 'string' && object.groupId.trim().length > 0
          ? object.groupId
          : object.groupId === null
            ? null
            : undefined;

      return {
        id: object.id,
        type: object.type,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        rotation: object.rotation,
        zIndex: object.zIndex,
        groupId,
        props: normalisedProps,
      };
    }),
  );
};

const normalisePresentationSettings = async (
  settings?: PresentationSettings,
): Promise<PresentationSettings | null> => {
  if (!settings) {
    return null;
  }

  const cloned = clonePlainObject(settings);
  const accentImage = cloned.accentImage;

  if (typeof accentImage === 'string' && accentImage.length > 0) {
    if (DATA_URL_PATTERN.test(accentImage)) {
      cloned.accentImage = accentImage;
    } else {
      try {
        cloned.accentImage = await fetchImageAsDataUrl(accentImage);
      } catch (error) {
        console.warn('[Exhibition Export] Unable to inline accent image for export', error);
        cloned.accentImage = null;
      }
    }
  }

  return cloned;
};

const resolveExportTitle = (cards: LayoutCard[], provided?: string): string => {
  if (provided && provided.trim().length > 0) {
    return provided.trim();
  }
  if (cards.length === 0) {
    return 'Exhibition Presentation';
  }
  const firstCard = cards[0];
  const resolved = resolveCardTitle(firstCard, firstCard.atoms ?? []);
  return sanitiseTitle(resolved);
};

export const buildPresentationExportPayload = async (
  cards: LayoutCard[],
  slideObjectsByCardId: SlideObjectMap,
  prepared: PreparedSlidesForExport | null,
  options?: BuildPresentationExportOptions,
): Promise<ExhibitionExportPayload> => {
  const captures = prepared?.captures ?? [];
  const captureLookup = new Map<string, SlideCaptureResult>();
  captures.forEach(capture => {
    captureLookup.set(capture.cardId, capture);
  });

  const domSnapshots = prepared?.domSnapshots ?? new Map<string, SlideDomSnapshot>();
  const firstSnapshot = domSnapshots.size > 0 ? domSnapshots.values().next().value : undefined;

  const fallbackWidth = captures[0]?.cssWidth ?? firstSnapshot?.width ?? FALLBACK_BASE_WIDTH;
  const fallbackHeight = captures[0]?.cssHeight ?? firstSnapshot?.height ?? FALLBACK_BASE_HEIGHT;

  const slides: SlideExportPayload[] = await Promise.all(cards.map(async (card, index) => {
    const capture = captureLookup.get(card.id);
    const domSnapshot = domSnapshots.get(card.id);
    const objects = await normaliseObjects(slideObjectsByCardId[card.id]);
    const presentationSettings = await normalisePresentationSettings(
      card.presentationSettings ?? undefined,
    );
    const baseWidth = capture?.cssWidth ?? domSnapshot?.width ?? fallbackWidth;
    const baseHeight = capture?.cssHeight ?? domSnapshot?.height ?? fallbackHeight;

    return {
      id: card.id,
      index,
      title: resolveCardTitle(card, card.atoms ?? []),
      baseWidth,
      baseHeight,
      presentationSettings,
      objects,
      screenshot: capture
        ? {
            dataUrl: capture.dataUrl,
            width: capture.imageWidth,
            height: capture.imageHeight,
            cssWidth: capture.cssWidth,
            cssHeight: capture.cssHeight,
            pixelRatio: capture.pixelRatio,
          }
        : undefined,
      domSnapshot: domSnapshot
        ? {
            html: domSnapshot.html,
            width: domSnapshot.width,
            height: domSnapshot.height,
            pixelRatio: domSnapshot.pixelRatio,
          }
        : undefined,
    };
  }));

  return {
    title: resolveExportTitle(cards, options?.title),
    slides,
    documentStyles: prepared?.documentStyles ?? null,
  };
};

export const sanitizeFileName = (value: string): string => {
  const trimmed = value.normalize('NFKD').replace(/[^\w\s-]+/g, '').trim();
  const collapsed = trimmed.replace(/[\s_-]+/g, '-');
  const result = collapsed.replace(/^-+|-+$/g, '').toLowerCase();
  return result.length > 0 ? result.slice(0, 120) : 'exhibition-presentation';
};

export const downloadBlob = (blob: Blob, filename: string) => {
  ensureBrowserEnvironment('File download');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadSlidesAsImages = async (
  captures: SlideCaptureResult[],
  baseTitle: string,
): Promise<void> => {
  ensureBrowserEnvironment('Image download');

  if (captures.length === 0) {
    return;
  }

  const safeBase = sanitizeFileName(baseTitle);

  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    const response = await fetch(capture.dataUrl);
    const blob = await response.blob();
    const paddedIndex = String(index + 1).padStart(2, '0');
    downloadBlob(blob, `${safeBase}-slide-${paddedIndex}.png`);
    await new Promise(resolve => setTimeout(resolve, DOWNLOAD_DELAY_MS));
  }
};

const normaliseRenderedScreenshot = (entry: any): RenderedSlideScreenshot | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id : '';
  const dataUrl = typeof entry.dataUrl === 'string' ? entry.dataUrl : '';

  if (!id || !dataUrl) {
    return null;
  }

  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  const width = toNumber(entry.width) ?? 0;
  const height = toNumber(entry.height) ?? 0;
  const index = toNumber(entry.index) ?? 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    id,
    index,
    dataUrl,
    width,
    height,
    cssWidth: toNumber(entry.cssWidth),
    cssHeight: toNumber(entry.cssHeight),
    pixelRatio: toNumber(entry.pixelRatio),
  };
};

export const requestRenderedSlideScreenshots = async (
  payload: ExhibitionExportPayload,
): Promise<RenderedSlideScreenshot[]> => {
  ensureBrowserEnvironment('Rendered slide capture');

  const endpoint = `${EXHIBITION_API}/export/screenshots`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload as JsonCompatible),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Renderer request failed.';
    throw new SlideRendererUnavailableError(message);
  }

  if (!response.ok) {
    const raw = await response.text();
    const message = extractRendererErrorMessage(raw);
    if (isRendererUnavailable(response.status, message)) {
      throw new SlideRendererUnavailableError(
        message || 'The slide rendering service is currently unavailable.',
      );
    }
    throw new Error(message || 'Failed to render slides for download.');
  }

  let body: { slides?: unknown };
  try {
    body = (await response.json()) as { slides?: unknown };
  } catch {
    throw new SlideRendererUnavailableError(
      'Received an invalid response from the slide rendering service.',
    );
  }
  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const rendered = slides
    .map(normaliseRenderedScreenshot)
    .filter((value): value is RenderedSlideScreenshot => Boolean(value));

  if (rendered.length === 0) {
    throw new SlideRendererUnavailableError('The rendering service did not return any slides.');
  }

  return rendered;
};

export const downloadRenderedSlideScreenshots = async (
  screenshots: RenderedSlideScreenshot[],
  baseTitle: string,
): Promise<void> => {
  ensureBrowserEnvironment('Rendered slide download');

  if (screenshots.length === 0) {
    return;
  }

  const safeBase = sanitizeFileName(baseTitle);
  const ordered = [...screenshots].sort((a, b) => a.index - b.index);

  for (let index = 0; index < ordered.length; index += 1) {
    const screenshot = ordered[index];
    const response = await fetch(screenshot.dataUrl);
    const blob = await response.blob();
    const paddedIndex = String(index + 1).padStart(2, '0');
    downloadBlob(blob, `${safeBase}-slide-${paddedIndex}.png`);
    await new Promise(resolve => setTimeout(resolve, DOWNLOAD_DELAY_MS));
  }
};

export const requestPresentationExport = async (
  format: 'pptx' | 'pdf',
  payload: ExhibitionExportPayload,
): Promise<Blob> => {
  ensureBrowserEnvironment('Presentation export');

  const endpoint = `${EXHIBITION_API}/export/${format}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload as JsonCompatible),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Renderer request failed.';
    throw new SlideRendererUnavailableError(message);
  }

  if (!response.ok) {
    const raw = await response.text();
    const message = extractRendererErrorMessage(raw);
    if (isRendererUnavailable(response.status, message)) {
      throw new SlideRendererUnavailableError(
        message || `The slide rendering service is unavailable for ${format.toUpperCase()} exports.`,
      );
    }
    throw new Error(message || `Failed to export presentation as ${format.toUpperCase()}`);
  }

  try {
    return await response.blob();
  } catch {
    throw new SlideRendererUnavailableError(
      `Received an invalid response when exporting ${format.toUpperCase()} presentation.`,
    );
  }
};
