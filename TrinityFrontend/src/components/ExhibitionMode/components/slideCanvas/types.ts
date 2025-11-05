import type { DroppedAtom, SlideObject } from '../../store/exhibitionStore';

export interface CanvasDropPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export type ActiveInteraction =
  | {
      kind: 'move';
      objectIds: string[];
      startClientX: number;
      startClientY: number;
      initialPositions: Map<string, { x: number; y: number }>;
    }
  | {
      kind: 'resize';
      objectId: string;
      handle: ResizeHandle;
      startClientX: number;
      startClientY: number;
      initial: { x: number; y: number; width: number; height: number };
    };

export interface EditingTextState {
  id: string;
  type: 'text-box';
  value: string;
  original: string;
}

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
