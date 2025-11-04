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
