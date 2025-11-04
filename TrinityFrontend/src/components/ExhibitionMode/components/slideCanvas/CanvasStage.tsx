import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Clipboard,
  ClipboardPaste,
  CopyPlus,
  Edit3,
  Lock,
  MessageSquarePlus,
  Scissors,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import ExhibitedAtomRenderer from '../ExhibitedAtomRenderer';
import { SlideTextBoxObject } from '../operationsPalette/textBox/TextBox';
import { DEFAULT_TEXT_BOX_TEXT, extractTextBoxFormatting } from '../operationsPalette/textBox/constants';
import type { TextBoxFormatting } from '../operationsPalette/textBox/types';
import { ExhibitionTable } from '../operationsPalette/tables/ExhibitionTable';
import { SlideShapeObject } from '../operationsPalette/shapes';
import type { ShapeObjectProps } from '../operationsPalette/shapes/constants';
import {
  ChartDataEditor,
  SlideChart,
  isEditableChartType,
  parseChartObjectProps,
} from '../operationsPalette/charts';
import type { ChartConfig, ChartDataRow } from '../operationsPalette/charts';
import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  cloneTableHeaders,
  cloneTableMatrix,
  createDefaultHeaderCell,
  createEmptyCell,
  createEmptyTableRow,
  ensureTableStyleId,
  normaliseTableData,
  normaliseTableHeaders,
  type TableCellData,
  type TableCellFormatting,
} from '../operationsPalette/tables/constants';
import SlideObjectContextMenu, { AlignAction } from '../SlideObjectContextMenu';
import type {
  CardColor,
  CardLayout,
  DroppedAtom,
  SlideObject,
} from '../../store/exhibitionStore';
import {
  cloneValue,
  generateObjectId,
  isAtomObject,
  isSlideObjectLocked,
  resolveFeatureOverviewTransparency,
  resolveLayerValue,
  snapToGrid,
} from './utils';
import {
  COLOR_PROP_KEYS,
  MIN_OBJECT_HEIGHT,
  MIN_OBJECT_WIDTH,
  MIN_TEXT_OBJECT_HEIGHT,
  MIN_TEXT_OBJECT_WIDTH,
} from './constants';
import type { ActiveInteraction, EditingTextState, ResizeHandle } from './types';
import { readTableState, tableStatesEqual, type TableState } from './tableUtils';

export type CanvasStageProps = {
  canEdit: boolean;
  objects: SlideObject[];
  isDragOver: boolean;
  showEmptyState: boolean;
  layout: CardLayout;
  cardColor: CardColor;
  accentImage?: string | null;
  accentImageName?: string | null;
  titleObjectId: string | null;
  onAddObject: (object: SlideObject) => void;
  onAddAtom?: (atom: DroppedAtom) => void;
  onCanvasDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onInteract: () => void;
  onRemoveAtom?: (atomId: string) => void;
  onBringToFront: (objectIds: string[]) => void;
  onBringForward: (objectIds: string[]) => void;
  onSendBackward: (objectIds: string[]) => void;
  onSendToBack: (objectIds: string[]) => void;
  onBulkUpdate: (updates: Record<string, Partial<SlideObject>>) => void;
  onGroupObjects: (objectIds: string[], groupId: string | null) => void;
  onTitleCommit: (nextTitle: string) => void;
  onRemoveObject?: (objectId: string) => void;
  onTextToolbarChange?: (node: ReactNode | null) => void;
  onRequestPositionPanel?: (objectId: string) => void;
  onUndo?: () => void;
  fullBleed: boolean;
  backgroundLocked: boolean;
  onToggleBackgroundLock: () => void;
  onRequestFormatPanel?: () => void;
  snapToGridEnabled: boolean;
  gridSize: number;
  showGrid: boolean;
  showGuides: boolean;
};

const arraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
};

const CanvasStage = React.forwardRef<HTMLDivElement, CanvasStageProps>(
  (
    {
      canEdit,
      objects,
      isDragOver,
      showEmptyState,
      layout,
      cardColor,
      accentImage,
      accentImageName,
      titleObjectId,
      onAddObject,
      onAddAtom,
      onCanvasDragOver,
      onCanvasDragLeave,
      onCanvasDrop,
      onInteract,
      onRemoveAtom,
      onBringToFront,
      onBringForward,
      onSendBackward,
      onSendToBack,
      onBulkUpdate,
      onGroupObjects,
      onTitleCommit,
      onRemoveObject,
      onTextToolbarChange,
      onRequestPositionPanel,
      onUndo,
      fullBleed,
      backgroundLocked,
      onToggleBackgroundLock,
      onRequestFormatPanel,
      snapToGridEnabled,
      gridSize,
      showGrid,
      showGuides,
    },
    forwardedRef,
  ) => {
    const internalRef = useRef<HTMLDivElement | null>(null);
    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const [selectedIdsState, setSelectedIdsState] = useState<string[]>([]);
    const selectedIds = selectedIdsState;
    const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
    const [editingTextState, setEditingTextState] = useState<EditingTextState | null>(null);
    const [activeTextToolbar, setActiveTextToolbar] = useState<{ id: string; node: ReactNode } | null>(null);
    const [clipboard, setClipboard] = useState<SlideObject[]>([]);
    const [styleClipboard, setStyleClipboard] = useState<Record<string, string> | null>(null);
    const selectedIdsRef = useRef<string[]>([]);
    useEffect(() => {
      selectedIdsRef.current = selectedIdsState;
    }, [selectedIdsState]);

    const orderedObjects = useMemo(
      () =>
        [...objects].sort((a, b) => {
          const aZ = resolveLayerValue(a.zIndex);
          const bZ = resolveLayerValue(b.zIndex);
          if (aZ !== bZ) {
            return aZ - bZ;
          }
          return a.id.localeCompare(b.id);
        }),
      [objects],
    );
    const [chartEditorTarget, setChartEditorTarget] = useState<{
      objectId: string;
      data: ChartDataRow[];
      config: ChartConfig;
    } | null>(null);
    const focusCanvas = useCallback(() => {
      const node = internalRef.current;
      if (node && typeof node.focus === 'function') {
        node.focus();
      }
    }, []);

    const objectsMap = useMemo(() => new Map(objects.map(object => [object.id, object])), [objects]);
    useEffect(() => {
      if (!chartEditorTarget) {
        return;
      }
      if (!objectsMap.has(chartEditorTarget.objectId)) {
        setChartEditorTarget(null);
      }
    }, [chartEditorTarget, objectsMap]);

    const commitSelection = useCallback(
      (ids: string[]) => {
        const filtered = ids
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map(id => id.trim());
        const unique = Array.from(new Set(filtered));
        if (arraysEqual(selectedIdsRef.current, unique)) {
          return;
        }

        setSelectedIdsState(unique);
        const nextSet = new Set(unique);
        const updates: Record<string, Partial<SlideObject>> = {};
        objects.forEach(object => {
          const nextSelected = nextSet.has(object.id);
          if ((object.isSelected ?? false) !== nextSelected) {
            updates[object.id] = { isSelected: nextSelected };
          }
        });

        if (Object.keys(updates).length > 0) {
          onBulkUpdate(updates);
        }
      },
      [objects, onBulkUpdate],
    );

    const setSelectedIds = useCallback(
      (value: string[] | ((prev: string[]) => string[])) => {
        const base = selectedIdsRef.current;
        const next = typeof value === 'function' ? (value as (prev: string[]) => string[])(base) : value;
        if (!Array.isArray(next)) {
          if (base.length > 0) {
            commitSelection([]);
          }
          return;
        }
        commitSelection(next);
      },
      [commitSelection],
    );

    useEffect(() => {
      const selectedFromStore = orderedObjects
        .filter(object => object.isSelected)
        .map(object => object.id);
      if (!arraysEqual(selectedIdsRef.current, selectedFromStore)) {
        setSelectedIdsState(selectedFromStore);
      }
    }, [orderedObjects]);

    const handleChartEditorSave = useCallback(
      (data: ChartDataRow[], updatedConfig: ChartConfig) => {
        if (!chartEditorTarget) {
          return;
        }
        const target = objectsMap.get(chartEditorTarget.objectId);
        if (!target) {
          setChartEditorTarget(null);
          return;
        }

        const nextProps = {
          ...(target.props ?? {}),
          chartData: data.map(row => ({ ...row })),
          chartConfig: { ...updatedConfig },
        } as Record<string, unknown>;

        onBulkUpdate({
          [chartEditorTarget.objectId]: {
            props: nextProps,
          },
        });
        setChartEditorTarget(null);
      },
      [chartEditorTarget, objectsMap, onBulkUpdate],
    );
    const selectedObjects = useMemo(
      () =>
        selectedIds
          .map(id => objectsMap.get(id))
          .filter((object): object is SlideObject => Boolean(object)),
      [objectsMap, selectedIds],
    );
    const unlockedSelectedObjects = useMemo(
      () => selectedObjects.filter(object => !isSlideObjectLocked(object)),
      [selectedObjects],
    );

    const resolveTargetIds = useCallback(
      (explicitIds?: string[] | null) => {
        if (explicitIds && explicitIds.length > 0) {
          return Array.from(new Set(explicitIds));
        }
        return selectedIds;
      },
      [selectedIds],
    );

    const resolveTargetObjects = useCallback(
      (explicitIds?: string[] | null) => {
        const ids = resolveTargetIds(explicitIds);
        const targets: SlideObject[] = [];
        ids.forEach(id => {
          const object = objectsMap.get(id);
          if (object) {
            targets.push(object);
          }
        });
        return targets;
      },
      [objectsMap, resolveTargetIds],
    );

    const captureColorStyle = useCallback((object: SlideObject | null | undefined) => {
      if (!object) {
        return null;
      }
      const props = (object.props ?? {}) as Record<string, unknown>;
      const palette: Record<string, string> = {};

      COLOR_PROP_KEYS.forEach(key => {
        const value = props[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          palette[key] = value;
        }
      });

      return Object.keys(palette).length > 0 ? palette : null;
    }, []);

    const handleCopySelection = useCallback(
      (explicitIds?: string[] | null) => {
        const targetIds = resolveTargetIds(explicitIds);
        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to copy',
            description: 'Select an object to copy before copying.',
          });
          return;
        }

        const snapshots = targets.map(object => ({
          ...object,
          props: cloneValue(object.props ?? {}),
        }));

        setClipboard(snapshots);
        if (explicitIds && explicitIds.length > 0) {
          setSelectedIds(targetIds);
        }
        focusCanvas();
        toast({
          title: snapshots.length === 1 ? 'Object copied' : 'Objects copied',
          description:
            snapshots.length === 1
              ? 'Copied the selected object.'
              : `Copied ${snapshots.length} objects to the clipboard.`,
        });
      },
      [focusCanvas, resolveTargetIds, resolveTargetObjects, setSelectedIds],
    );

    const handleCutSelection = useCallback(
      (explicitIds?: string[] | null) => {
        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to cut',
            description: 'Select an object before attempting to cut it.',
          });
          return;
        }

        const unlockedTargets = targets.filter(object => !isSlideObjectLocked(object));
        if (unlockedTargets.length === 0) {
          toast({
            title: 'Selection locked',
            description: 'Unlock the selected object before cutting it.',
          });
          return;
        }

        const snapshots = unlockedTargets.map(object => ({
          ...object,
          props: cloneValue(object.props ?? {}),
        }));

        setClipboard(snapshots);
        onInteract();

        const removedIds = new Set(unlockedTargets.map(object => object.id));

        unlockedTargets.forEach(object => {
          if (isAtomObject(object) && onRemoveAtom) {
            const atomId = (object.props as { atom?: DroppedAtom } | undefined)?.atom?.id;
            if (atomId) {
              onRemoveAtom(atomId);
            }
            return;
          }

          if (!onRemoveObject) {
            return;
          }

          if (object.type === 'accent-image') {
            return;
          }

          onRemoveObject(object.id);
        });

        setSelectedIds(prev => prev.filter(id => !removedIds.has(id)));
        focusCanvas();
        toast({
          title: snapshots.length === 1 ? 'Object cut' : 'Objects cut',
          description:
            snapshots.length === 1
              ? 'Moved the selected object to the clipboard.'
              : `Cut ${snapshots.length} objects to the clipboard.`,
        });
      },
      [
        focusCanvas,
        onInteract,
        onRemoveAtom,
        onRemoveObject,
        resolveTargetObjects,
        setSelectedIds,
        titleObjectId,
      ],
    );

    const handleCopyStyle = useCallback(() => {
      const primary = selectedObjects[0] ?? null;
      if (!primary) {
        toast({
          title: 'No object selected',
          description: 'Select an object to capture its styling.',
        });
        return;
      }

      const palette = captureColorStyle(primary);
      if (!palette) {
        toast({
          title: 'No colors to copy',
          description: 'The selected object does not expose color styling to copy.',
        });
        return;
      }

      setStyleClipboard(palette);
      toast({
        title: 'Style copied',
        description: 'Copied the selected object styling for reuse.',
      });
    }, [captureColorStyle, selectedObjects]);

    const handleDeleteSelection = useCallback(
      (explicitIds?: string[] | null) => {
        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to delete',
            description: 'Select an object to remove it from the slide.',
          });
          return;
        }

        const unlockedTargets = targets.filter(object => !isSlideObjectLocked(object));
        if (unlockedTargets.length === 0) {
          toast({
            title: 'Selection locked',
            description: 'Unlock the selected object before deleting it.',
          });
          return;
        }

        onInteract();
        const removedIds = new Set(unlockedTargets.map(object => object.id));

        unlockedTargets.forEach(object => {
          if (isAtomObject(object) && onRemoveAtom) {
            const atomId = (object.props as { atom?: DroppedAtom } | undefined)?.atom?.id;
            if (atomId) {
              onRemoveAtom(atomId);
            }
            return;
          }

          if (!onRemoveObject) {
            return;
          }

          if (object.type === 'accent-image') {
            return;
          }

          onRemoveObject(object.id);
        });

        setSelectedIds(prev => prev.filter(id => !removedIds.has(id)));
        focusCanvas();
        toast({
          title: unlockedTargets.length === 1 ? 'Object deleted' : 'Objects deleted',
          description:
            unlockedTargets.length === 1
              ? 'The selected object has been removed.'
              : `${unlockedTargets.length} objects removed from the slide.`,
        });
      },
      [focusCanvas, onInteract, onRemoveAtom, onRemoveObject, resolveTargetObjects, titleObjectId],
    );

    const handleToggleLock = useCallback(() => {
      if (selectedObjects.length === 0) {
        toast({
          title: 'No object selected',
          description: 'Select an object to lock or unlock.',
        });
        return;
      }

      const shouldLock = unlockedSelectedObjects.length > 0;
      const targets = shouldLock ? unlockedSelectedObjects : selectedObjects;
      if (targets.length === 0) {
        toast({
          title: 'Selection locked',
          description: 'All selected objects are already locked.',
        });
        return;
      }

      const updates: Record<string, Partial<SlideObject>> = {};
      targets.forEach(object => {
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (shouldLock) {
          nextProps.locked = true;
        } else {
          delete nextProps.locked;
        }
        updates[object.id] = { props: nextProps };
      });

      onInteract();
      onBulkUpdate(updates);

      toast({
        title: shouldLock ? 'Objects locked' : 'Objects unlocked',
        description: shouldLock
          ? 'Locked the selected objects to prevent accidental edits.'
          : 'Unlocked the selected objects.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects]);

    const handleLayerAction = useCallback(
      (action: 'front' | 'forward' | 'backward' | 'back', explicitIds?: string[]) => {
        const explicitTargets = Array.isArray(explicitIds) && explicitIds.length > 0
          ? explicitIds
              .map(id => objectsMap.get(id))
              .filter((object): object is SlideObject => Boolean(object))
          : null;

        const unlockedExplicitTargets = explicitTargets?.filter(object => !isSlideObjectLocked(object)) ?? [];

        const targets = unlockedExplicitTargets.length > 0
          ? unlockedExplicitTargets
          : explicitTargets && explicitTargets.length > 0
            ? []
            : unlockedSelectedObjects.length > 0
              ? unlockedSelectedObjects
              : selectedObjects;

        if (targets.length === 0) {
          toast({
            title: explicitTargets && explicitTargets.length > 0 ? 'Selection locked' : 'No objects selected',
            description:
              explicitTargets && explicitTargets.length > 0
                ? 'Unlock the selected objects to change their layer order.'
                : 'Select an object to change its layer order.',
          });
          return;
        }

        const ids = Array.from(new Set(targets.map(object => object.id))).filter(Boolean);
        if (ids.length === 0) {
          return;
        }

        onInteract();
        switch (action) {
          case 'front':
            onBringToFront(ids);
            break;
          case 'forward':
            onBringForward(ids);
            break;
          case 'backward':
            onSendBackward(ids);
            break;
          case 'back':
            onSendToBack(ids);
            break;
          default:
            break;
        }
      },
      [
        objectsMap,
        onBringForward,
        onBringToFront,
        onInteract,
        onSendBackward,
        onSendToBack,
        selectedObjects,
        unlockedSelectedObjects,
      ],
    );

    const handleLinkSelection = useCallback(() => {
      if (selectedObjects.length === 0) {
        toast({
          title: 'No object selected',
          description: 'Select an object to add a link.',
        });
        return;
      }

      if (typeof window === 'undefined') {
        toast({
          title: 'Link unavailable',
          description: 'Links can only be edited in a browser environment.',
        });
        return;
      }

      const current = (selectedObjects[0]?.props as Record<string, unknown> | undefined)?.link;
      const input = window.prompt('Enter a link URL', typeof current === 'string' ? current : '');
      if (input === null) {
        return;
      }

      const trimmed = input.trim();
      const updates: Record<string, Partial<SlideObject>> = {};
      unlockedSelectedObjects.forEach(object => {
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (trimmed.length === 0) {
          delete nextProps.link;
        } else {
          nextProps.link = trimmed;
        }
        updates[object.id] = { props: nextProps };
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Selection locked',
          description: 'Unlock the object to update its link.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: trimmed.length === 0 ? 'Link cleared' : 'Link updated',
        description:
          trimmed.length === 0
            ? 'Removed link information from the selected objects.'
            : 'Updated the selected objects with the provided link.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects]);

    const handleCommentSelection = useCallback(() => {
      if (selectedObjects.length === 0) {
        toast({
          title: 'No object selected',
          description: 'Select an object to attach a comment.',
        });
        return;
      }

      if (typeof window === 'undefined') {
        toast({
          title: 'Comment unavailable',
          description: 'Comments can only be edited in a browser environment.',
        });
        return;
      }

      const current = (selectedObjects[0]?.props as Record<string, unknown> | undefined)?.comment;
      const input = window.prompt('Add a comment', typeof current === 'string' ? current : '');
      if (input === null) {
        return;
      }

      const trimmed = input.trim();
      const updates: Record<string, Partial<SlideObject>> = {};
      unlockedSelectedObjects.forEach(object => {
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (trimmed.length === 0) {
          delete nextProps.comment;
        } else {
          nextProps.comment = trimmed;
        }
        updates[object.id] = { props: nextProps };
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Selection locked',
          description: 'Unlock the object to update comments.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: trimmed.length === 0 ? 'Comment cleared' : 'Comment added',
        description:
          trimmed.length === 0
            ? 'Removed comments from the selected objects.'
            : 'Saved the provided comment on the selection.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects]);

    const handleAltTextSelection = useCallback(() => {
      const eligible = selectedObjects.filter(object => object.type === 'image' || object.type === 'accent-image');
      if (eligible.length === 0) {
        toast({
          title: 'No image selected',
          description: 'Select an image object to edit alternative text.',
        });
        return;
      }

      if (typeof window === 'undefined') {
        toast({
          title: 'Alternative text unavailable',
          description: 'Alternative text can only be edited in a browser environment.',
        });
        return;
      }

      const current = (eligible[0].props as Record<string, unknown> | undefined)?.altText;
      const input = window.prompt('Describe this image for screen readers', typeof current === 'string' ? current : '');
      if (input === null) {
        return;
      }

      const trimmed = input.trim();
      const updates: Record<string, Partial<SlideObject>> = {};
      eligible.forEach(object => {
        if (isSlideObjectLocked(object)) {
          return;
        }
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (trimmed.length === 0) {
          delete nextProps.altText;
        } else {
          nextProps.altText = trimmed;
        }
        updates[object.id] = { props: nextProps };
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Images locked',
          description: 'Unlock the image to change its alternative text.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: trimmed.length === 0 ? 'Alternative text cleared' : 'Alternative text saved',
        description:
          trimmed.length === 0
            ? 'Removed alternative text from the selected images.'
            : 'Updated alternative text for the selected images.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects]);

    const handleApplyColorsToAll = useCallback(() => {
      const sourcePalette = styleClipboard ?? captureColorStyle(selectedObjects[0]);
      if (!sourcePalette) {
        toast({
          title: 'No colors available',
          description: 'Copy a style or select an object with color styling.',
        });
        return;
      }

      const updates: Record<string, Partial<SlideObject>> = {};
      objects.forEach(object => {
        if (isSlideObjectLocked(object)) {
          return;
        }
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        let changed = false;
        Object.entries(sourcePalette).forEach(([key, value]) => {
          if (typeof value !== 'string') {
            return;
          }
          if (nextProps[key] !== value) {
            nextProps[key] = value;
            changed = true;
          }
        });
        if (changed) {
          updates[object.id] = { props: nextProps };
        }
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'No updates applied',
          description: 'Objects already use the selected colors.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: 'Colors applied',
        description: 'Applied the captured styling across the slide.',
      });
    }, [captureColorStyle, objects, onBulkUpdate, onInteract, selectedObjects, styleClipboard]);

    const handleInfo = useCallback(() => {
      const target = selectedObjects[0] ?? null;
      if (!target) {
        toast({
          title: 'No object selected',
          description: 'Select an object to view its details.',
        });
        return;
      }

      const descriptionParts = [
        `Type: ${target.type}`,
        `Position: ${Math.round(target.x)}, ${Math.round(target.y)}`,
        `Size: ${Math.round(target.width)} × ${Math.round(target.height)}`,
      ];

      toast({
        title: 'Object details',
        description: descriptionParts.join(' • '),
      });
    }, [selectedObjects]);

    const hasSelection = selectedObjects.length > 0;
    const hasClipboardItems = clipboard.length > 0;
    const selectionLocked = hasSelection && unlockedSelectedObjects.length === 0;
    const lockLabel: 'Lock' | 'Unlock' = selectionLocked ? 'Unlock' : 'Lock';
    const selectedSupportsAltText = selectedObjects.some(
      object => object.type === 'image' || object.type === 'accent-image',
    );
    const effectiveColorPalette = styleClipboard ?? captureColorStyle(selectedObjects[0]);
    const canApplyColorsGlobally = Boolean(effectiveColorPalette);
    const canCutSelection = unlockedSelectedObjects.length > 0;

    useEffect(() => {
      setSelectedIds(prev => prev.filter(id => objectsMap.has(id)));
      setActiveTextToolbar(prev => {
        if (!prev) {
          return prev;
        }
        return objectsMap.has(prev.id) ? prev : null;
      });
    }, [objectsMap, setSelectedIds]);

    useEffect(() => {
      if (!editingTextState) {
        return;
      }

      const object = objectsMap.get(editingTextState.id);
      if (!object) {
        setEditingTextState(null);
      }
    }, [editingTextState, objectsMap]);


    useEffect(() => {
      setActiveTextToolbar(prev => {
        if (!prev) {
          return prev;
        }
        return selectedIds.includes(prev.id) ? prev : null;
      });
    }, [selectedIds]);

    useEffect(() => {
      if (!canEdit) {
        setActiveTextToolbar(null);
      }
    }, [canEdit]);

    useEffect(() => {
      onTextToolbarChange?.(activeTextToolbar?.node ?? null);
    }, [activeTextToolbar, onTextToolbarChange]);

    useEffect(() => {
      return () => {
        onTextToolbarChange?.(null);
      };
    }, [onTextToolbarChange]);

    const handleTextToolbarStateChange = useCallback(
      (objectId: string, node: ReactNode | null) => {
        setActiveTextToolbar(prev => {
          if (node) {
            return { id: objectId, node };
          }
          if (prev?.id === objectId) {
            return null;
          }
          return prev;
        });
      },
      [],
    );

    const updateShapeProps = useCallback(
      (objectId: string, updates: Partial<ShapeObjectProps>) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'shape') {
          return;
        }

        const currentProps = (object.props ?? {}) as Record<string, unknown>;
        const nextProps = {
          ...currentProps,
          ...updates,
        } as Record<string, unknown>;

        onBulkUpdate({
          [objectId]: {
            props: nextProps,
          },
        });
      },
      [objectsMap, onBulkUpdate],
    );

    const mutateTableState = useCallback(
      (objectId: string, mutator: (state: TableState) => TableState | null) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'table') {
          return;
        }

        const currentState = readTableState(object);
        const nextState = mutator(currentState);

        if (!nextState || tableStatesEqual(currentState, nextState)) {
          return;
        }

        onInteract();
        onBulkUpdate({
          [objectId]: {
            props: {
              ...(object.props || {}),
              data: nextState.data,
              rows: nextState.rows,
              cols: nextState.cols,
              locked: nextState.locked,
              showOutline: nextState.showOutline,
              headers: nextState.headers,
              styleId: nextState.styleId,
            },
          },
        });
      },
      [objectsMap, onBulkUpdate, onInteract],
    );

    const updateTableCellContent = useCallback(
      (objectId: string, rowIndex: number, colIndex: number, value: string) => {
        mutateTableState(objectId, state => {
          if (rowIndex < 0 || colIndex < 0 || rowIndex >= state.rows || colIndex >= state.cols) {
            return state;
          }

          const currentCell = state.data[rowIndex][colIndex];
          if (!currentCell) {
            return state;
          }

          if (currentCell.content === value) {
            return state;
          }

          const nextData = cloneTableMatrix(state.data);
          nextData[rowIndex][colIndex] = {
            ...nextData[rowIndex][colIndex],
            content: value,
          };

          return {
            ...state,
            data: nextData,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableCellFormatting = useCallback(
      (objectId: string, rowIndex: number, colIndex: number, updates: Partial<TableCellFormatting>) => {
        mutateTableState(objectId, state => {
          if (rowIndex < 0 || colIndex < 0 || rowIndex >= state.rows || colIndex >= state.cols) {
            return state;
          }

          const currentCell = state.data[rowIndex][colIndex];
          if (!currentCell) {
            return state;
          }

          const nextFormatting = { ...currentCell.formatting, ...updates };
          if (formattingShallowEqual(currentCell.formatting, nextFormatting)) {
            return state;
          }

          const nextData = cloneTableMatrix(state.data);
          nextData[rowIndex][colIndex] = {
            ...nextData[rowIndex][colIndex],
            formatting: nextFormatting,
          };

          return {
            ...state,
            data: nextData,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableHeaderContent = useCallback(
      (objectId: string, colIndex: number, value: string) => {
        mutateTableState(objectId, state => {
          if (colIndex < 0 || colIndex >= state.cols) {
            return state;
          }

          const currentHeader = state.headers[colIndex];
          if (!currentHeader || currentHeader.content === value) {
            return state;
          }

          const nextHeaders = cloneTableHeaders(state.headers);
          nextHeaders[colIndex] = {
            ...nextHeaders[colIndex],
            content: value,
          };

          return {
            ...state,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableHeaderFormatting = useCallback(
      (objectId: string, colIndex: number, updates: Partial<TableCellFormatting>) => {
        mutateTableState(objectId, state => {
          if (colIndex < 0 || colIndex >= state.cols) {
            return state;
          }

          const currentHeader = state.headers[colIndex];
          if (!currentHeader) {
            return state;
          }

          const nextFormatting = { ...currentHeader.formatting, ...updates };
          if (formattingShallowEqual(currentHeader.formatting, nextFormatting)) {
            return state;
          }

          const nextHeaders = cloneTableHeaders(state.headers);
          nextHeaders[colIndex] = {
            ...nextHeaders[colIndex],
            formatting: nextFormatting,
          };

          return {
            ...state,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
    );

    const toggleTableLock = useCallback(
      (objectId: string) => {
        mutateTableState(objectId, state => ({
          ...state,
          locked: !state.locked,
        }));
      },
      [mutateTableState],
    );

    const toggleTableOutline = useCallback(
      (objectId: string) => {
        mutateTableState(objectId, state => ({
          ...state,
          showOutline: !state.showOutline,
        }));
      },
      [mutateTableState],
    );

    const setTableStyle = useCallback(
      (objectId: string, nextStyleId: string) => {
        mutateTableState(objectId, state => {
          const safeStyleId = ensureTableStyleId(nextStyleId);

          if (state.styleId === safeStyleId) {
            return state;
          }

          return {
            ...state,
            styleId: safeStyleId,
          };
        });
      },
      [mutateTableState],
    );

    const addRowsToTable = useCallback(
      (objectId: string, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          const columnCount = Math.max(state.cols, 1);
          const additions = Array.from({ length: count }, () => createEmptyTableRow(columnCount));
          const nextData = [...state.data, ...additions];

          return {
            ...state,
            data: nextData,
            rows: nextData.length,
          };
        });
      },
      [mutateTableState],
    );

    const addColumnsToTable = useCallback(
      (objectId: string, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          const nextData = state.data.map(row => [
            ...row,
            ...Array.from({ length: count }, () => createEmptyCell()),
          ]);
          const existingHeaders = cloneTableHeaders(state.headers);
          const headerAdditions = Array.from({ length: count }, (_, additionIndex) =>
            createDefaultHeaderCell(existingHeaders.length + additionIndex),
          );
          const nextHeaders = [...existingHeaders, ...headerAdditions];
          const nextCols = nextHeaders.length;

          return {
            ...state,
            data: nextData,
            cols: nextCols,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
    );

    const removeRowsFromTable = useCallback(
      (objectId: string, startIndex: number, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          if (state.rows <= 1) {
            return state;
          }

          const safeStart = Math.max(0, Math.min(startIndex, state.rows - 1));
          const available = state.rows - safeStart;
          const actualCount = Math.min(count, available);

          if (state.rows - actualCount < 1) {
            return state;
          }

          const nextData = state.data.filter((_, index) => index < safeStart || index >= safeStart + actualCount);

          return {
            ...state,
            data: nextData,
            rows: nextData.length,
          };
        });
      },
      [mutateTableState],
    );

    const removeColumnsFromTable = useCallback(
      (objectId: string, startIndex: number, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          if (state.cols <= 1) {
            return state;
          }

          const safeStart = Math.max(0, Math.min(startIndex, state.cols - 1));
          const available = state.cols - safeStart;
          const actualCount = Math.min(count, available);

          if (state.cols - actualCount < 1) {
            return state;
          }

          const nextData = state.data.map(row => [
            ...row.slice(0, safeStart),
            ...row.slice(safeStart + actualCount),
          ]);
          const remainingHeaders = cloneTableHeaders(state.headers);
          const nextHeaders = remainingHeaders.filter(
            (_, index) => index < safeStart || index >= safeStart + actualCount,
          );
          const nextCols = nextHeaders.length;

          return {
            ...state,
            data: nextData,
            cols: nextCols,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
    );

    const commitEditingText = useCallback(() => {
      setEditingTextState(prev => {
        if (!prev) {
          return prev;
        }

        const object = objectsMap.get(prev.id);
        if (!object || object.type !== 'text-box') {
          return null;
        }

        const raw = prev.value ?? '';
        const contentWithoutTags = raw.replace(/<[^>]*>/g, '').trim();
        const isTitleTextBox = Boolean(titleObjectId && object.id === titleObjectId);
        const fallbackText = isTitleTextBox ? UNTITLED_SLIDE_TEXT : DEFAULT_TEXT_BOX_TEXT;
        const resolved = contentWithoutTags.length > 0 ? raw : fallbackText;
        const existingFormatting = extractTextBoxFormatting(object.props as Record<string, unknown> | undefined);

        if (resolved !== existingFormatting.text) {
          onInteract();
          const nextProps = { ...(object.props || {}), text: resolved };
          onBulkUpdate({
            [object.id]: {
              props: nextProps,
            },
          });
        }

        if (isTitleTextBox) {
          const existingPlain =
            existingFormatting.text.replace(/<[^>]*>/g, '').trim() || UNTITLED_SLIDE_TEXT;
          const plain = contentWithoutTags.length > 0 ? contentWithoutTags : UNTITLED_SLIDE_TEXT;
          if (plain !== existingPlain) {
            onTitleCommit?.(plain);
          }
        }

        return null;
      });
    }, [objectsMap, onBulkUpdate, onInteract, onTitleCommit, titleObjectId]);

    useEffect(() => {
      if (!canEdit && editingTextState) {
        commitEditingText();
      }
    }, [canEdit, commitEditingText, editingTextState]);

    const cancelEditingText = useCallback(() => {
      setEditingTextState(null);
    }, []);

    const beginEditingTextBox = useCallback(
      (objectId: string) => {
        if (!canEdit) {
          return;
        }

        if (editingTextState?.type === 'text-box' && editingTextState.id === objectId) {
          return;
        }

        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'text-box') {
          return;
        }

        const formatting = extractTextBoxFormatting(object.props as Record<string, unknown> | undefined);
        onInteract();
        focusCanvas();
        setSelectedIds([objectId]);
        setEditingTextState({
          id: objectId,
          type: 'text-box',
          value: formatting.text,
          original: formatting.text,
        });
      },
      [canEdit, editingTextState, focusCanvas, objectsMap, onInteract, setSelectedIds],
    );

    const handleEditingValueChange = useCallback(
      (value: string) => {
        setEditingTextState(prev => {
          if (!prev || prev.value === value) {
            return prev;
          }
          onInteract();
          return { ...prev, value };
        });
      },
      [onInteract],
    );

    const handleObjectDoubleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }
        const object = objectsMap.get(objectId);
        if (!object) {
          return;
        }
        if (object.type === 'text-box') {
          event.stopPropagation();
          beginEditingTextBox(objectId);
        }
      },
      [beginEditingTextBox, canEdit, objectsMap],
    );

    const handleContextMenuRequest = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }

        event.stopPropagation();

        if (editingTextState) {
          commitEditingText();
        }

        focusCanvas();
        setSelectedIds(prev => (prev.includes(objectId) ? prev : [objectId]));
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas],
    );

    const clampPosition = useCallback((x: number, y: number, width: number, height: number) => {
      const canvas = internalRef.current;
      if (!canvas) {
        return { x, y };
      }
      const maxX = Math.max(0, canvas.clientWidth - width);
      const maxY = Math.max(0, canvas.clientHeight - height);
      return {
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
      };
    }, []);

    const clampAndSnapPosition = useCallback(
      (x: number, y: number, width: number, height: number) => {
        const canvas = internalRef.current;
        const { x: clampedX, y: clampedY } = clampPosition(x, y, width, height);
        const maxX = canvas ? Math.max(0, canvas.clientWidth - width) : clampedX;
        const maxY = canvas ? Math.max(0, canvas.clientHeight - height) : clampedY;
        if (!snapToGridEnabled) {
          return { x: clampedX, y: clampedY };
        }
        const snappedX = Math.min(Math.max(0, snapToGrid(clampedX, gridSize)), maxX);
        const snappedY = Math.min(Math.max(0, snapToGrid(clampedY, gridSize)), maxY);
        return { x: snappedX, y: snappedY };
      },
      [clampPosition, gridSize, snapToGridEnabled],
    );

    const handlePasteClipboard = useCallback(() => {
      if (!canEdit) {
        return;
      }

      if (clipboard.length === 0) {
        toast({
          title: 'Clipboard empty',
          description: 'Copy an object before attempting to paste.',
        });
        return;
      }

      const pastedIds: string[] = [];
      clipboard.forEach((snapshot, index) => {
        const baseProps = cloneValue(snapshot.props ?? {}) as Record<string, unknown>;
        delete baseProps.locked;

        const offset = gridSize * 2 * (index + 1);
        const nextX = snapshot.x + offset;
        const nextY = snapshot.y + offset;
        const { x, y } = clampAndSnapPosition(nextX, nextY, snapshot.width, snapshot.height);
        const newId = generateObjectId(snapshot.id);

        if (snapshot.type === 'atom') {
          const atom = (snapshot.props as { atom?: DroppedAtom } | undefined)?.atom;
          if (atom) {
            const clonedAtom: DroppedAtom = { ...cloneValue(atom), id: newId };
            baseProps.atom = clonedAtom;
            onAddAtom?.(clonedAtom);
          }
        }

        const prepared: SlideObject = {
          ...snapshot,
          id: newId,
          x,
          y,
          position: { x, y },
          width: snapshot.width,
          height: snapshot.height,
          size: { width: snapshot.width, height: snapshot.height },
          groupId: null,
          props: baseProps,
          content: snapshot.content ?? baseProps,
          isSelected: false,
        };

        onAddObject(prepared);
        pastedIds.push(newId);
      });

      if (pastedIds.length === 0) {
        return;
      }

      onInteract();
      onBringToFront(pastedIds);
      setSelectedIds(pastedIds);
      focusCanvas();
      toast({
        title: pastedIds.length === 1 ? 'Object pasted' : 'Objects pasted',
        description:
          pastedIds.length === 1
            ? 'Added a copy of the selected object to the slide.'
            : `Added ${pastedIds.length} copied objects to the slide.`,
      });
    }, [
      canEdit,
      clipboard,
      clampAndSnapPosition,
      focusCanvas,
      onAddAtom,
      onAddObject,
      onBringToFront,
      onInteract,
      setSelectedIds,
    ]);

    const handleDuplicateSelection = useCallback(
      (explicitIds?: string[] | null) => {
        if (!canEdit) {
          return;
        }

        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to duplicate',
            description: 'Select at least one object before duplicating.',
          });
          return;
        }

        const duplicatedIds: string[] = [];
        targets.forEach((object, index) => {
          const baseProps = cloneValue(object.props ?? {}) as Record<string, unknown>;
          delete baseProps.locked;
          const offset = gridSize * 2 * (index + 1);
          const { x, y } = clampAndSnapPosition(
            object.x + offset,
            object.y + offset,
            object.width,
            object.height,
          );
          const newId = generateObjectId(object.id);

          if (object.type === 'atom') {
            const atom = (object.props as { atom?: DroppedAtom } | undefined)?.atom;
            if (atom) {
              const clonedAtom: DroppedAtom = { ...cloneValue(atom), id: newId };
              baseProps.atom = clonedAtom;
              onAddAtom?.(clonedAtom);
            }
          }

          const duplicate: SlideObject = {
            ...object,
            id: newId,
            x,
            y,
            position: { x, y },
            width: object.width,
            height: object.height,
            size: { width: object.width, height: object.height },
            groupId: null,
            props: baseProps,
            content: object.content ?? baseProps,
            isSelected: false,
          };

          onAddObject(duplicate);
          duplicatedIds.push(newId);
        });

        if (duplicatedIds.length === 0) {
          return;
        }

        onInteract();
        onBringToFront(duplicatedIds);
        setSelectedIds(duplicatedIds);
        focusCanvas();
        toast({
          title: duplicatedIds.length === 1 ? 'Object duplicated' : 'Objects duplicated',
          description:
            duplicatedIds.length === 1
              ? 'Added a copy of the selected object.'
              : `Added ${duplicatedIds.length} duplicated objects to the slide.`,
        });
      },
      [
        canEdit,
        clampAndSnapPosition,
        focusCanvas,
        onAddAtom,
        onAddObject,
        onBringToFront,
        onInteract,
        resolveTargetObjects,
        setSelectedIds,
      ],
    );

    const handleAlignSelection = useCallback(
      (alignment: AlignAction) => {
        if (selectedObjects.length === 0) {
          toast({
            title: 'No object selected',
            description: 'Select an object to align it on the slide.',
          });
          return;
        }

        const canvas = internalRef.current;
        if (!canvas) {
          toast({
            title: 'Canvas unavailable',
            description: 'Unable to align objects while the canvas is not ready.',
          });
          return;
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const targets = unlockedSelectedObjects.length > 0 ? unlockedSelectedObjects : selectedObjects;
        const updates: Record<string, Partial<SlideObject>> = {};

        targets.forEach(object => {
          if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
            let targetX = 0;
            if (alignment === 'center') {
              targetX = (width - object.width) / 2;
            } else if (alignment === 'right') {
              targetX = width - object.width;
            }
            const maxX = Math.max(0, width - object.width);
            const clampedX = Math.min(Math.max(0, targetX), maxX);
            const snappedX = snapToGridEnabled
              ? Math.min(Math.max(0, snapToGrid(targetX, gridSize)), maxX)
              : clampedX;
            if (Math.abs(snappedX - object.x) > 0.5) {
              updates[object.id] = { ...(updates[object.id] ?? {}), x: snappedX };
            }
          }

          if (alignment === 'top' || alignment === 'middle' || alignment === 'bottom') {
            let targetY = 0;
            if (alignment === 'middle') {
              targetY = (height - object.height) / 2;
            } else if (alignment === 'bottom') {
              targetY = height - object.height;
            }
            const maxY = Math.max(0, height - object.height);
            const clampedY = Math.min(Math.max(0, targetY), maxY);
            const snappedY = snapToGridEnabled
              ? Math.min(Math.max(0, snapToGrid(targetY, gridSize)), maxY)
              : clampedY;
            if (Math.abs(snappedY - object.y) > 0.5) {
              updates[object.id] = { ...(updates[object.id] ?? {}), y: snappedY };
            }
          }
        });

        if (Object.keys(updates).length === 0) {
          toast({
            title: 'No alignment changes',
            description: 'Objects already align to the requested position.',
          });
          return;
        }

        onInteract();
        onBulkUpdate(updates);
        toast({
          title: 'Objects aligned',
          description: 'Updated the selection alignment on the slide.',
        });
      },
      [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects],
    );

    const handleBackgroundPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if (event.button !== 0) {
          return;
        }

        if (editingTextState) {
          commitEditingText();
        }

        onInteract();
        setSelectedIds([]);
        focusCanvas();
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas, onInteract, setSelectedIds],
    );

    const handleBackgroundContextMenu = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if (editingTextState) {
          commitEditingText();
        }

        focusCanvas();
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas],
    );

    const selectionCount = selectedIds.length;

    useEffect(() => {
      if (!canEdit || selectionCount === 0) {
        return;
      }

      const resolveTargetElement = (eventTarget: EventTarget | null): Element | null => {
        if (!eventTarget) {
          return null;
        }

        if (eventTarget instanceof Element) {
          return eventTarget;
        }

        if (eventTarget instanceof Node) {
          return eventTarget.parentElement;
        }

        return null;
      };

      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        const node = internalRef.current;

        if (!node) {
          return;
        }

        const targetElement = resolveTargetElement(event.target);

        if (targetElement) {
          if (node.contains(targetElement)) {
            return;
          }

          if (targetElement.closest('[data-text-toolbar-root]')) {
            return;
          }
        }

        if (editingTextState) {
          commitEditingText();
        }

        onInteract();
        setSelectedIds([]);
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);

      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('touchstart', handlePointerDown);
      };
    }, [canEdit, commitEditingText, editingTextState, onInteract, selectionCount, setSelectedIds]);

    const handleObjectPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }

        const targetElement = event.target instanceof Element ? event.target : null;
        const editableTableCell = targetElement?.closest('[data-exhibition-table-cell-content="true"]');

        const targetObject = objectsMap.get(objectId);
        const isLocked = isSlideObjectLocked(targetObject);

        const isMulti = event.shiftKey || event.metaKey || event.ctrlKey;
        const resolveSelection = () => {
          const baseSelection = isMulti
            ? selectedIds.includes(objectId)
              ? selectedIds
              : [...selectedIds, objectId]
            : [objectId];
          return Array.from(new Set(baseSelection));
        };

        if (editableTableCell) {
          event.stopPropagation();
          if (editingTextState) {
            commitEditingText();
          }
          onInteract();
          const uniqueSelection = resolveSelection();
          setSelectedIds(uniqueSelection);
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (editingTextState) {
          commitEditingText();
        }
        focusCanvas();

        const uniqueSelection = resolveSelection();
        setSelectedIds(uniqueSelection);

        if (isLocked) {
          return;
        }

        onInteract();

        const initialPositions = new Map<string, { x: number; y: number }>();
        uniqueSelection.forEach(id => {
          const object = objectsMap.get(id);
          if (object) {
            initialPositions.set(id, { x: object.x, y: object.y });
          }
        });

        if (initialPositions.size === 0) {
          return;
        }

        setActiveInteraction({
          kind: 'move',
          objectIds: Array.from(initialPositions.keys()),
          startClientX: event.clientX,
          startClientY: event.clientY,
          initialPositions,
        });
      },
      [
        canEdit,
        commitEditingText,
        editingTextState,
        focusCanvas,
        onInteract,
        objectsMap,
        selectedIds,
        setSelectedIds,
      ],
    );

    const handleResizeStart = useCallback(
      (event: React.PointerEvent<HTMLSpanElement>, objectId: string, handle: ResizeHandle) => {
        if (!canEdit) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        focusCanvas();
        const target = objectsMap.get(objectId);
        if (!target) {
          return;
        }
        if (isSlideObjectLocked(target)) {
          setSelectedIds(prev => (prev.includes(objectId) ? prev : [objectId]));
          return;
        }
        onInteract();
        setSelectedIds([objectId]);
        setActiveInteraction({
          kind: 'resize',
          objectId,
          handle,
          startClientX: event.clientX,
          startClientY: event.clientY,
          initial: {
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height,
          },
        });
      },
      [canEdit, focusCanvas, onInteract, objectsMap, setSelectedIds],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if ((event.key === 'z' || event.key === 'Z') && (event.metaKey || event.ctrlKey)) {
          if (editingTextState) {
            return;
          }
          event.preventDefault();
          onUndo?.();
          return;
        }

        if (event.key === 'Escape') {
          setSelectedIds([]);
          if (editingTextState) {
            cancelEditingText();
          }
          return;
        }

        if (editingTextState) {
          return;
        }

        if ((event.key === 'v' || event.key === 'V') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handlePasteClipboard();
          return;
        }

        if (selectedIds.length === 0) {
          return;
        }

        if ((event.key === 'c' || event.key === 'C') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (event.altKey) {
            handleCopyStyle();
          } else {
            handleCopySelection();
          }
          return;
        }

        if ((event.key === 'x' || event.key === 'X') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleCutSelection();
          return;
        }

        if ((event.key === 'd' || event.key === 'D') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleDuplicateSelection();
          return;
        }

        if ((event.key === 'l' || event.key === 'L') && event.altKey && event.shiftKey) {
          event.preventDefault();
          handleToggleLock();
          return;
        }

        if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleLinkSelection();
          return;
        }

        if ((event.key === 'n' || event.key === 'N') && (event.metaKey || event.ctrlKey) && event.altKey) {
          event.preventDefault();
          handleCommentSelection();
          return;
        }

        const activeTargets =
          unlockedSelectedObjects.length > 0 ? unlockedSelectedObjects : selectedObjects;

        if (activeTargets.length === 0) {
          toast({
            title: 'Selection locked',
            description: 'Unlock the selected objects to edit them.',
          });
          return;
        }

        const activeIds = activeTargets.map(object => object.id);

        const baseStep = snapToGridEnabled ? gridSize : 4;
        const step = event.shiftKey ? baseStep * 2 : baseStep;
        if (
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown'
        ) {
          event.preventDefault();
          const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
          const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          const updates: Record<string, Partial<SlideObject>> = {};
          activeTargets.forEach(object => {
            const { x, y } = clampAndSnapPosition(
              object.x + deltaX,
              object.y + deltaY,
              object.width,
              object.height,
            );
            if (x !== object.x || y !== object.y) {
              updates[object.id] = { x, y };
            }
          });
          if (Object.keys(updates).length > 0) {
            onInteract();
            onBulkUpdate(updates);
          }
          return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          handleDeleteSelection();
          return;
        }

        if ((event.key === 'g' || event.key === 'G') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (event.shiftKey) {
            onInteract();
            onGroupObjects(activeIds, null);
          } else {
            const groupId = `group-${Date.now()}`;
            onInteract();
            onGroupObjects(activeIds, groupId);
          }
          return;
        }

        if (event.key === ']' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleLayerAction('front');
          return;
        }

        if (event.key === '[' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleLayerAction('back');
          return;
        }
      },
      [
        canEdit,
        cancelEditingText,
        clampAndSnapPosition,
        handleCutSelection,
        handleDuplicateSelection,
        editingTextState,
        handleCommentSelection,
        handleCopySelection,
        handleCopyStyle,
        handleDeleteSelection,
        handleLayerAction,
        handleLinkSelection,
        handlePasteClipboard,
        handleToggleLock,
        onUndo,
        onBulkUpdate,
        onGroupObjects,
        onInteract,
        selectedIds,
        selectedObjects,
        unlockedSelectedObjects,
        setSelectedIds,
      ],
    );

    useEffect(() => {
      if (!activeInteraction) {
        return;
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!canEdit) {
          return;
        }

        if (activeInteraction.kind === 'move') {
          const deltaX = event.clientX - activeInteraction.startClientX;
          const deltaY = event.clientY - activeInteraction.startClientY;
          const updates: Record<string, Partial<SlideObject>> = {};
          activeInteraction.objectIds.forEach(id => {
            const initial = activeInteraction.initialPositions.get(id);
            const object = objectsMap.get(id);
            if (!initial || !object) {
              return;
            }
            const { x, y } = clampAndSnapPosition(initial.x + deltaX, initial.y + deltaY, object.width, object.height);
            updates[id] = { x, y };
          });
          if (Object.keys(updates).length > 0) {
            onBulkUpdate(updates);
          }
        } else if (activeInteraction.kind === 'resize') {
          const { handle, initial, objectId } = activeInteraction;
          const target = objectsMap.get(objectId);
          if (!target) {
            return;
          }

          const { minWidth, minHeight } =
            target.type === 'text-box'
              ? { minWidth: MIN_TEXT_OBJECT_WIDTH, minHeight: MIN_TEXT_OBJECT_HEIGHT }
              : { minWidth: MIN_OBJECT_WIDTH, minHeight: MIN_OBJECT_HEIGHT };

          const deltaX = event.clientX - activeInteraction.startClientX;
          const deltaY = event.clientY - activeInteraction.startClientY;

          let nextX = initial.x;
          let nextY = initial.y;
          let nextWidth = initial.width;
          let nextHeight = initial.height;

          if (handle === 'nw' || handle === 'sw') {
            nextX = initial.x + deltaX;
            nextWidth = initial.width - deltaX;
          }
          if (handle === 'ne' || handle === 'se') {
            nextWidth = initial.width + deltaX;
          }
          if (handle === 'nw' || handle === 'ne') {
            nextY = initial.y + deltaY;
            nextHeight = initial.height - deltaY;
          }
          if (handle === 'sw' || handle === 'se') {
            nextHeight = initial.height + deltaY;
          }

          const canvas = internalRef.current;
          if (canvas) {
            nextWidth = Math.min(nextWidth, canvas.clientWidth);
            nextHeight = Math.min(nextHeight, canvas.clientHeight);
          }

          if (nextWidth < minWidth) {
            if (handle === 'nw' || handle === 'sw') {
              nextX -= minWidth - nextWidth;
            }
            nextWidth = minWidth;
          }

          if (nextHeight < minHeight) {
            if (handle === 'nw' || handle === 'ne') {
              nextY -= minHeight - nextHeight;
            }
            nextHeight = minHeight;
          }

          const { x, y } = clampAndSnapPosition(nextX, nextY, nextWidth, nextHeight);
          const snappedWidth = snapToGridEnabled
            ? Math.max(minWidth, snapToGrid(nextWidth, gridSize))
            : Math.max(minWidth, nextWidth);
          const snappedHeight = snapToGridEnabled
            ? Math.max(minHeight, snapToGrid(nextHeight, gridSize))
            : Math.max(minHeight, nextHeight);
          const widthLimit = canvas ? Math.max(minWidth, Math.min(snappedWidth, canvas.clientWidth)) : snappedWidth;
          const heightLimit = canvas ? Math.max(minHeight, Math.min(snappedHeight, canvas.clientHeight)) : snappedHeight;

          onBulkUpdate({
            [objectId]: {
              x,
              y,
              width: widthLimit,
              height: heightLimit,
            },
          });
        }
      };

      const handlePointerUp = () => {
        setActiveInteraction(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [activeInteraction, canEdit, clampAndSnapPosition, onBulkUpdate, objectsMap]);

    const handleDefinitions: Array<{ handle: ResizeHandle; className: string; cursor: string }> = useMemo(
      () => [
        { handle: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
        { handle: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
      ],
      [],
    );

    const renderObjectContent = (object: SlideObject) => {
      if (isAtomObject(object)) {
        return <ExhibitedAtomRenderer atom={object.props.atom} />;
      }

      if (object.type === 'accent-image') {
        const src = typeof object.props?.src === 'string' ? object.props.src : null;
        const name =
          typeof object.props?.name === 'string' && object.props.name.trim().length > 0
            ? object.props.name.trim()
            : 'Accent image';

        if (src) {
          return <img src={src} alt={name} className="h-full w-full object-cover" />;
        }

        return (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Accent image
          </div>
        );
      }

      if (object.type === 'image') {
        const src = typeof object.props?.src === 'string' ? object.props.src : null;
        const name =
          typeof object.props?.name === 'string' && object.props.name.trim().length > 0
            ? object.props.name.trim()
            : 'Slide image';

        if (src) {
          return <img src={src} alt={name} className="h-full w-full object-cover" />;
        }

        return (
          <div className="flex h-full w-full items-center justify-center bg-muted/20 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Image
          </div>
        );
      }

      if (object.type === 'text-box') {
        return null;
      }

      if (object.type === 'shape') {
        return null;
      }

      if (typeof object.props?.text === 'string') {
        return <p className="text-sm leading-relaxed text-muted-foreground">{object.props.text}</p>;
      }

      return (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          Unsupported component type: {object.type}
        </div>
      );
    };

    const canvasCornerClass = fullBleed ? 'rounded-none' : 'rounded-[28px]';

    const canvasBorderClass = (() => {
      if (isDragOver) {
        return 'border-2 border-primary/60 ring-2 ring-primary/20 shadow-xl scale-[0.99]';
      }

      if (showEmptyState) {
        return 'border-2 border-dashed border-border/70';
      }

      return fullBleed ? 'border-0' : 'border-2 border-border/60';
    })();

    const backgroundLockLabel = backgroundLocked ? 'Unlock background' : 'Lock background';

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setRef}
            className={cn(
              'relative h-full w-full overflow-hidden transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-transparent',
              canvasCornerClass,
              canvasBorderClass,
            )}
            tabIndex={canEdit ? 0 : -1}
            onPointerDown={handleBackgroundPointerDown}
            onKeyDown={handleKeyDown}
            onContextMenu={handleBackgroundContextMenu}
            onDragOver={onCanvasDragOver}
            onDragLeave={onCanvasDragLeave}
            onDrop={onCanvasDrop}
          >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <LayoutOverlay
            layout={layout}
            color={cardColor}
            accentImage={accentImage}
            accentImageName={accentImageName}
            fullBleed={fullBleed}
          />
        </div>

        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 6,
              backgroundImage:
                'linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px)',
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
          />
        )}

        {showGuides && (
          <div className="pointer-events-none absolute inset-0" style={{ zIndex: 7 }}>
            <div className="absolute inset-y-0 left-1/2 w-px bg-primary/40" style={{ transform: 'translateX(-0.5px)' }} />
            <div className="absolute inset-x-0 top-1/2 h-px bg-primary/40" style={{ transform: 'translateY(-0.5px)' }} />
          </div>
        )}

        {showEmptyState && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground',
              canvasCornerClass,
            )}
          >
            Add components from the catalogue to build your presentation slide.
          </div>
        )}

        <div className="relative z-20 h-full w-full">
          {orderedObjects.map(object => {
            const isSelected = selectedIds.includes(object.id);
            const baseLayer = Math.max(0, resolveLayerValue(object.zIndex));
            const visualLayer = baseLayer * 100 + (isSelected ? 1 : 0);
            const rotation = typeof object.rotation === 'number' ? object.rotation : 0;
            const isAccentImageObject = object.type === 'accent-image';
            const isImageObject = object.type === 'image';
            const isTextBoxObject = object.type === 'text-box';
            const isTableObject = object.type === 'table';
            const isChartObject = object.type === 'chart';
            const isShapeObject = object.type === 'shape';
            const isEditingTextBox =
              isTextBoxObject &&
              editingTextState?.id === object.id &&
              editingTextState.type === 'text-box';
            const textBoxFormatting = isTextBoxObject
              ? extractTextBoxFormatting(object.props as Record<string, unknown> | undefined)
              : null;
            const tableState = isTableObject ? readTableState(object) : null;
            const chartProps = isChartObject
              ? parseChartObjectProps(object.props as Record<string, unknown> | undefined)
              : null;
            const atomId =
              isAtomObject(object) && typeof object.props.atom.atomId === 'string'
                ? object.props.atom.atomId
                : null;
            const isFeatureOverviewAtom = atomId === 'feature-overview';
            const featureOverviewMetadata =
              isFeatureOverviewAtom && object.props.atom.metadata && typeof object.props.atom.metadata === 'object'
                ? (object.props.atom.metadata as Record<string, any>)
                : undefined;
            const featureOverviewTransparentBackground =
              isFeatureOverviewAtom && resolveFeatureOverviewTransparency(featureOverviewMetadata);
            const suppressCardChrome =
              isShapeObject ||
              isTextBoxObject ||
              isTableObject ||
              isChartObject ||
              (isFeatureOverviewAtom && featureOverviewTransparentBackground);
            const isChartMakerAtom = atomId === 'chart-maker';
            const isEvaluateModelsFeatureAtom = atomId === 'evaluate-models-feature';
            const shouldShowTitle = !isFeatureOverviewAtom && !isChartMakerAtom && !isEvaluateModelsFeatureAtom;

          const renderObject = () => {
            return (
              <div
                className="absolute group"
                style={{
                  left: object.x,
                  top: object.y,
                  width: object.width,
                  height: object.height,
                  zIndex: visualLayer,
                }}
                data-exhibition-object-id={object.id}
                data-exhibition-object-type={object.type}
                onPointerDown={canEdit ? event => handleObjectPointerDown(event, object.id) : undefined}
                onDoubleClick={canEdit ? event => handleObjectDoubleClick(event, object.id) : undefined}
              >
              {isSelected && !(isTextBoxObject && isEditingTextBox) && (
                <div
                  className="pointer-events-none absolute inset-0 z-40 border-2 border-yellow-400 transition-all duration-200"
                  aria-hidden="true"
                />
              )}
              <div
                className={cn(
                  'relative flex h-full w-full flex-col overflow-hidden rounded-3xl border-2 transition-all',
                  suppressCardChrome
                    ? 'border-transparent bg-transparent shadow-none'
                    : 'bg-background/95 shadow-xl',
                  isAccentImageObject && 'bg-muted/30 shadow-none border-transparent',
                  isShapeObject && 'border-none bg-transparent shadow-none overflow-visible',
                  (isTextBoxObject || isTableObject || isChartObject) &&
                    'overflow-hidden border-transparent bg-transparent shadow-none',
                  (() => {
                    const shouldShowCardChrome =
                      !suppressCardChrome &&
                      !isAccentImageObject &&
                      !isShapeObject &&
                      !(isTextBoxObject || isTableObject || isChartObject);

                    if (!shouldShowCardChrome || isSelected) {
                      return 'border-transparent';
                    }

                    return 'border-border/70 hover:border-primary/40';
                  })(),
                )}
                style={{
                  transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: rotation !== 0 ? 'center center' : undefined,
                }}
              >
                {isAtomObject(object) && shouldShowTitle && (
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/10 px-4 py-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${object.props.atom.color}`} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">{object.props.atom.title}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {object.props.atom.category}
                      </span>
                    </div>
                  </div>
                )}
                <div
                  className={cn(
                    'relative flex-1 overflow-hidden',
                    isAccentImageObject || isShapeObject || isImageObject ? undefined : 'p-4',
                    (isTextBoxObject || isTableObject || isChartObject) && 'overflow-visible p-0',
                    isShapeObject && 'flex items-center justify-center overflow-visible p-0',
                  )}
                >
                  {isTextBoxObject ? (
                    <SlideTextBoxObject
                      id={object.id}
                      canEdit={canEdit}
                      props={object.props as Record<string, unknown> | undefined}
                      isEditing={Boolean(isEditingTextBox)}
                      isSelected={isSelected}
                      editingValue={
                        isEditingTextBox ? editingTextState.value : textBoxFormatting?.text ?? DEFAULT_TEXT_BOX_TEXT
                      }
                      onBeginEditing={() => beginEditingTextBox(object.id)}
                      onCommitEditing={commitEditingText}
                      onCancelEditing={cancelEditingText}
                      onEditingChange={handleEditingValueChange}
                      onUpdateFormatting={updates => {
                        onInteract();
                        const nextProps = {
                          ...(object.props || {}),
                          ...updates,
                        } as Record<string, unknown>;
                        onBulkUpdate({
                          [object.id]: {
                            props: nextProps,
                          },
                        });
                      }}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onInteract={onInteract}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onRequestPositionPanel={
                        onRequestPositionPanel ? () => onRequestPositionPanel(object.id) : undefined
                      }
                      onContextMenu={event => handleContextMenuRequest(event, object.id)}
                    />
                  ) : isTableObject && tableState ? (
                    <ExhibitionTable
                      id={object.id}
                      headers={tableState.headers}
                      data={tableState.data}
                      rows={tableState.rows}
                      cols={tableState.cols}
                      locked={tableState.locked}
                      showOutline={tableState.showOutline}
                      styleId={tableState.styleId}
                      canEdit={canEdit}
                      isSelected={isSelected}
                      selectedCell={isSelected ? undefined : null}
                      onUpdateCell={(row, col, value) => updateTableCellContent(object.id, row, col, value)}
                      onUpdateCellFormatting={(row, col, updates) =>
                        updateTableCellFormatting(object.id, row, col, updates)
                      }
                      onUpdateHeader={(col, value) => updateTableHeaderContent(object.id, col, value)}
                      onUpdateHeaderFormatting={(col, updates) =>
                        updateTableHeaderFormatting(object.id, col, updates)
                      }
                      onToggleLock={() => toggleTableLock(object.id)}
                      onToggleOutline={() => toggleTableOutline(object.id)}
                      onStyleChange={nextStyleId => setTableStyle(object.id, nextStyleId)}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onDeleteColumn={(startIndex, count) => removeColumnsFromTable(object.id, startIndex, count)}
                      onDelete2Columns={(startIndex, count) => removeColumnsFromTable(object.id, startIndex, count)}
                      onDeleteRow={(startIndex, count) => removeRowsFromTable(object.id, startIndex, count)}
                      onDelete2Rows={(startIndex, count) => removeRowsFromTable(object.id, startIndex, count)}
                      onAddColumn={() => addColumnsToTable(object.id, 1)}
                      onAdd2Columns={() => addColumnsToTable(object.id, 2)}
                      onAddRow={() => addRowsToTable(object.id, 1)}
                      onAdd2Rows={() => addRowsToTable(object.id, 2)}
                      onToolbarStateChange={node => handleTextToolbarStateChange(object.id, node)}
                      onInteract={onInteract}
                      className="h-full w-full"
                    />
                  ) : isShapeObject ? (
                    <SlideShapeObject
                      id={object.id}
                      canEdit={canEdit}
                      isSelected={isSelected}
                      props={object.props as Record<string, unknown> | undefined}
                      onUpdateProps={updates => updateShapeProps(object.id, updates)}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onRequestPositionPanel={
                        onRequestPositionPanel ? () => onRequestPositionPanel(object.id) : undefined
                      }
                      onBringToFront={() => onBringToFront([object.id])}
                      onSendToBack={() => onSendToBack([object.id])}
                      onInteract={onInteract}
                    />
                  ) : isChartObject && chartProps ? (
                    <SlideChart
                      data={chartProps.chartData}
                      config={chartProps.chartConfig}
                      className="h-full w-full"
                      captureId={object.id}
                    />
                  ) : (
                    <div
                      className={cn(
                        'h-full w-full overflow-hidden',
                        isAccentImageObject ? undefined : 'rounded-2xl bg-background/90 p-3',
                      )}
                    >
                      {renderObjectContent(object)}
                    </div>
                  )}
                </div>
                {canEdit && isAtomObject(object) && onRemoveAtom && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      'absolute top-3 right-3 z-30 h-9 w-9 text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
                      isSelected && 'opacity-100',
                    )}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onRemoveAtom(object.props.atom.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {canEdit && isShapeObject && onRemoveObject && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      'absolute top-3 right-3 z-30 h-9 w-9 text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
                      isSelected && 'opacity-100',
                    )}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onRemoveObject(object.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {canEdit && isSelected && !isEditingTextBox && !isSlideObjectLocked(object) &&
                handleDefinitions.map(definition => (
                  <span
                    key={definition.handle}
                    className={cn(
                      'absolute z-40 h-3 w-3 rounded-full border border-background bg-black shadow',
                      definition.className,
                    )}
                    style={{ cursor: definition.cursor }}
                    onPointerDown={event => handleResizeStart(event, object.id, definition.handle)}
                  />
                ))}
            </div>
            );
          };

          const contextTargetIds = isSelected ? selectedIds : [object.id];
          const contextHasSelection = contextTargetIds.length > 0;
          const contextHasUnlocked = contextTargetIds.some(id => {
            const target = objectsMap.get(id);
            return target ? !isSlideObjectLocked(target) : false;
          });

          return (
            <SlideObjectContextMenu
              key={object.id}
              canEdit={canEdit}
              canAlign={hasSelection && !selectionLocked}
              canLayer={hasSelection && !selectionLocked}
              canApplyColors={canApplyColorsGlobally}
              canAddAltText={selectedSupportsAltText}
              hasClipboard={hasClipboardItems}
              lockLabel={lockLabel}
              onContextMenu={event => handleContextMenuRequest(event, object.id)}
              onCopy={() => handleCopySelection(contextTargetIds)}
              onCopyStyle={handleCopyStyle}
              onCut={() => handleCutSelection(contextTargetIds)}
              onPaste={handlePasteClipboard}
              onDuplicate={() => handleDuplicateSelection(contextTargetIds)}
              onDelete={() => handleDeleteSelection(contextTargetIds)}
              onToggleLock={handleToggleLock}
              onBringToFront={() => handleLayerAction('front', contextTargetIds)}
              onBringForward={() => handleLayerAction('forward', contextTargetIds)}
              onSendBackward={() => handleLayerAction('backward', contextTargetIds)}
              onSendToBack={() => handleLayerAction('back', contextTargetIds)}
              onAlign={handleAlignSelection}
              onLink={handleLinkSelection}
              onComment={handleCommentSelection}
              onAltText={handleAltTextSelection}
              onApplyColorsToAll={handleApplyColorsToAll}
              onInfo={handleInfo}
              disableDelete={!contextHasUnlocked}
              disableLock={!hasSelection}
              disableCopy={!contextHasSelection}
              disableCopyStyle={!contextHasSelection}
              disableCut={!contextHasUnlocked}
              disableDuplicate={!contextHasSelection}
              disableLink={selectionLocked}
              disableComment={selectionLocked}
              disableApplyColors={!canApplyColorsGlobally}
              renderAdditionalContent={
                isChartObject
                  ? closeMenu => (
                      <ContextMenuItem
                        disabled={
                          !canEdit ||
                          !chartProps ||
                          !isEditableChartType(chartProps.chartConfig.type)
                        }
                        onSelect={event => {
                          event.preventDefault();
                          const isValidTarget =
                            canEdit &&
                            chartProps &&
                            isEditableChartType(chartProps.chartConfig.type);
                          const payload = isValidTarget
                            ? {
                                objectId: object.id,
                                data: chartProps.chartData,
                                config: chartProps.chartConfig,
                              }
                            : null;
                          closeMenu();
                          if (!payload) {
                            return;
                          }
                          setTimeout(() => {
                            setChartEditorTarget(payload);
                          }, 0);
                        }}
                        className="gap-3"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit chart data
                      </ContextMenuItem>
                    )
                  : undefined
              }
            >
              {renderObject()}
            </SlideObjectContextMenu>
          );
        })}
        </div>

        {isDragOver && canEdit && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 text-xs font-semibold uppercase tracking-wide text-primary',
              canvasCornerClass,
            )}
          >
            Drop to add component
          </div>
        )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64" style={{ zIndex: 10000 }}>
          <ContextMenuItem
            disabled={!canEdit || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleCopySelection();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy
            <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleCopyStyle();
            }}
          >
            <Clipboard className="mr-2 h-4 w-4" />
            Copy style
            <ContextMenuShortcut>Ctrl+Alt+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !canCutSelection}
            onSelect={event => {
              event.preventDefault();
              handleCutSelection();
            }}
          >
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !hasClipboardItems}
            onSelect={event => {
              event.preventDefault();
              handlePasteClipboard();
            }}
          >
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Paste
            <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleDuplicateSelection();
            }}
          >
            <CopyPlus className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || selectionLocked || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleDeleteSelection();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={event => {
              event.preventDefault();
              onToggleBackgroundLock();
            }}
          >
            {backgroundLocked ? (
              <Unlock className="mr-2 h-4 w-4" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {backgroundLockLabel}
            <ContextMenuShortcut>Alt+Shift+L</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={event => {
              event.preventDefault();
              onRequestFormatPanel?.();
              toast({
                title: 'Transition settings',
                description: 'Use the formatting panel to configure slide transitions.',
              });
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Add transition
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canEdit || !hasSelection || selectionLocked}
            onSelect={event => {
              event.preventDefault();
              handleCommentSelection();
            }}
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Comment
            <ContextMenuShortcut>Ctrl+Alt+N</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
        <ChartDataEditor
          open={Boolean(chartEditorTarget)}
          onClose={() => setChartEditorTarget(null)}
          onSave={handleChartEditorSave}
          initialData={chartEditorTarget?.data}
          initialConfig={chartEditorTarget?.config}
        />
      </ContextMenu>
    );
  },
);

CanvasStage.displayName = 'CanvasStage';

export default CanvasStage;

