import type { SlideObject } from '../../store/exhibitionStore';
import type { ActiveInteraction, ResizeHandle } from './types';

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

export const isResizeInteraction = (interaction: ActiveInteraction | null): interaction is Extract<
  ActiveInteraction,
  { kind: 'resize' }
> => interaction?.kind === 'resize';

export const getOppositeHandle = (handle: ResizeHandle): ResizeHandle => {
  switch (handle) {
    case 'nw':
      return 'se';
    case 'ne':
      return 'sw';
    case 'sw':
      return 'ne';
    case 'se':
    default:
      return 'nw';
  }
};
