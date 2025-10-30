import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';

import { EXHIBITION_API } from '@/lib/api';
import {
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
const FALLBACK_BASE_WIDTH = 960;
const FALLBACK_BASE_HEIGHT = 540;
const MAX_CAPTURE_ATTEMPTS = 2;

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

const loadImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      reject(new Error('Unable to determine captured image dimensions'));
    };
    image.src = dataUrl;
  });
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

export interface SlideCaptureOptions {
  pixelRatio?: number;
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

export const captureSlidesForExport = async (
  cards: LayoutCard[],
  options?: SlideCaptureOptions,
): Promise<SlideCaptureResult[]> => {
  ensureBrowserEnvironment('Slide capture');

  if (cards.length === 0) {
    return [];
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
  const failures: string[] = [];
  const pixelRatio = getPixelRatio(options?.pixelRatio);

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

      const rect = slideElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        failures.push(card.id);
        continue;
      }

      try {
        let dataUrl: string | null = null;
        let attempt = 0;

        while (attempt < MAX_CAPTURE_ATTEMPTS && !dataUrl) {
          attempt += 1;

          try {
            const options = {
              pixelRatio,
              cacheBust: true,
              ...(attempt > 1 ? { skipFonts: true } : {}),
            } as Parameters<typeof toPng>[1];

            dataUrl = await toPng(slideElement, options);
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

        const { width: imageWidth, height: imageHeight } = await loadImageDimensions(dataUrl);

        captures.push({
          cardId: card.id,
          dataUrl,
          cssWidth: rect.width,
          cssHeight: rect.height,
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
      `Unable to capture ${failures.length} slide${failures.length === 1 ? '' : 's'} for export.`,
    );
  }

  return captures;
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

export interface SlideExportPayload {
  id: string;
  index: number;
  title?: string | null;
  baseWidth: number;
  baseHeight: number;
  presentationSettings?: PresentationSettings | null;
  objects: SlideExportObjectPayload[];
  screenshot?: SlideScreenshotPayload;
}

export interface ExhibitionExportPayload {
  title: string;
  slides: SlideExportPayload[];
}

export interface BuildPresentationExportOptions {
  title?: string;
}

const normaliseObjects = (objects: SlideObject[] | undefined): SlideExportObjectPayload[] => {
  if (!objects || objects.length === 0) {
    return [];
  }

  return objects.map(object => ({
    id: object.id,
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    zIndex: object.zIndex,
    props: clonePlainObject(object.props ?? {}),
  }));
};

const normalisePresentationSettings = (
  settings?: PresentationSettings,
): PresentationSettings | null => {
  if (!settings) {
    return null;
  }
  return clonePlainObject(settings);
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

export const buildPresentationExportPayload = (
  cards: LayoutCard[],
  slideObjectsByCardId: SlideObjectMap,
  captures: SlideCaptureResult[],
  options?: BuildPresentationExportOptions,
): ExhibitionExportPayload => {
  const captureLookup = new Map<string, SlideCaptureResult>();
  captures.forEach(capture => {
    captureLookup.set(capture.cardId, capture);
  });

  const fallbackWidth = captures[0]?.cssWidth ?? FALLBACK_BASE_WIDTH;
  const fallbackHeight = captures[0]?.cssHeight ?? FALLBACK_BASE_HEIGHT;

  const slides: SlideExportPayload[] = cards.map((card, index) => {
    const capture = captureLookup.get(card.id);
    const objects = normaliseObjects(slideObjectsByCardId[card.id]);
    const baseWidth = capture?.cssWidth ?? fallbackWidth;
    const baseHeight = capture?.cssHeight ?? fallbackHeight;

    return {
      id: card.id,
      index,
      title: resolveCardTitle(card, card.atoms ?? []),
      baseWidth,
      baseHeight,
      presentationSettings: normalisePresentationSettings(card.presentationSettings ?? undefined),
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
    };
  });

  return {
    title: resolveExportTitle(cards, options?.title),
    slides,
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

export const requestPresentationExport = async (
  format: 'pptx' | 'pdf',
  payload: ExhibitionExportPayload,
): Promise<Blob> => {
  ensureBrowserEnvironment('Presentation export');

  const endpoint = `${EXHIBITION_API}/export/${format}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload as JsonCompatible),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to export presentation as ${format.toUpperCase()}`);
  }

  return response.blob();
};
