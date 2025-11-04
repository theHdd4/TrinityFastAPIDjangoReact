import type { DroppedAtom, SlideObject } from '../../store/exhibitionStore';

export const snapToGrid = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

export const cloneValue = <T,>(value: T): T => {
  const structured = (globalThis as any)?.structuredClone;
  if (typeof structured === 'function') {
    try {
      return structured(value);
    } catch (error) {
      console.warn('[Exhibition] Structured clone failed, falling back to JSON clone', error);
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

export const generateObjectId = (fallback: string) => {
  const globalCrypto: Crypto | undefined =
    typeof window !== 'undefined'
      ? window.crypto
      : typeof globalThis !== 'undefined' && 'crypto' in globalThis
        ? (globalThis.crypto as Crypto | undefined)
        : undefined;

  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${fallback || 'slide-object'}-${suffix}`;
};

export const isSlideObjectLocked = (object: SlideObject | undefined | null): boolean => {
  if (!object) {
    return false;
  }
  const props = (object.props ?? {}) as Record<string, unknown>;
  return Boolean(props.locked);
};

export const parseBooleanish = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) {
      return false;
    }
  }
  return null;
};

export const resolveLayerValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

export const normaliseHexColor = (value: string): string => {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    const [, short] = /^#([0-9a-fA-F]{3})$/.exec(trimmed) ?? [];
    if (short) {
      return `#${short
        .split('')
        .map(char => char + char)
        .join('')}`.toLowerCase();
    }
  }
  return '#ffffff';
};

export const applyOpacityToHex = (value: string, opacity: number): string => {
  const safeOpacity = Math.min(100, Math.max(0, opacity));
  const normalised = normaliseHexColor(value);
  const hex = normalised.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const alpha = Math.round((safeOpacity / 100) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const resolveFeatureOverviewTransparency = (
  metadata: Record<string, any> | undefined,
): boolean => {
  if (!metadata || typeof metadata !== 'object') {
    return true;
  }

  const controls = metadata.exhibitionControls;
  if (!controls || typeof controls !== 'object') {
    return true;
  }

  const preference = parseBooleanish((controls as Record<string, unknown>).transparentBackground);
  return preference ?? true;
};

export const isAtomObject = (
  object: SlideObject,
): object is SlideObject & { props: { atom: DroppedAtom } } => {
  if (object.type !== 'atom') {
    return false;
  }
  const payload = object.props as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload.atom as DroppedAtom | undefined;
  return Boolean(candidate && typeof candidate.id === 'string');
};
