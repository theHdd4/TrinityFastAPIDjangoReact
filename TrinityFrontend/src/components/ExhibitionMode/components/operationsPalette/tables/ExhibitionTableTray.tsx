import React from 'react';
import {
  Copy,
  Clipboard,
  Files,
  Lock,
  Trash2,
  Plus,
  Minus,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Grid3x3,
} from 'lucide-react';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';

export interface ExhibitionTableTrayProps {
  locked: boolean;
  rows: number;
  cols: number;
  selectedCell: { row: number; col: number } | null;
  onToggleLock: () => void;
  onDelete: () => void;
  onDeleteColumn: () => void;
  onDelete2Columns: () => void;
  onDeleteRow: () => void;
  onDelete2Rows: () => void;
  onAddColumn: () => void;
  onAdd2Columns: () => void;
  onAddRow: () => void;
  onAdd2Rows: () => void;
}

export const ExhibitionTableTray: React.FC<ExhibitionTableTrayProps> = ({
  locked,
  rows,
  cols,
  selectedCell,
  onToggleLock,
  onDelete,
  onDeleteColumn,
  onDelete2Columns,
  onDeleteRow,
  onDelete2Rows,
  onAddColumn,
  onAdd2Columns,
  onAddRow,
  onAdd2Rows,
}) => {
  return (
    <ContextMenuContent className="w-64">
      <ContextMenuItem disabled={locked}>
        <Copy className="mr-2 h-4 w-4" />
        Copy
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={locked}>
        <Clipboard className="mr-2 h-4 w-4" />
        Copy style
        <ContextMenuShortcut>Ctrl+Alt+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={locked}>
        <Clipboard className="mr-2 h-4 w-4" />
        Paste
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={locked}>
        <Files className="mr-2 h-4 w-4" />
        Duplicate
        <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={onDelete} disabled={locked}>
        <Trash2 className="mr-2 h-4 w-4" />
        Delete table
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={onToggleLock}>
        <Lock className="mr-2 h-4 w-4" />
        {locked ? 'Unlock' : 'Lock'}
        <ContextMenuShortcut>Alt+Shift+L</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={onDeleteColumn}
        disabled={locked || !selectedCell || cols <= 1}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete column
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDelete2Columns}
        disabled={locked || !selectedCell || cols <= 2}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete 2 columns
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDeleteRow}
        disabled={locked || !selectedCell || rows <= 1}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete row
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDelete2Rows}
        disabled={locked || !selectedCell || rows <= 2}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete 2 rows
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={onAddColumn} disabled={locked}>
        <Plus className="mr-2 h-4 w-4" />
        Add column
      </ContextMenuItem>
      <ContextMenuItem onClick={onAdd2Columns} disabled={locked}>
        <Plus className="mr-2 h-4 w-4" />
        Add 2 columns
      </ContextMenuItem>
      <ContextMenuItem onClick={onAddRow} disabled={locked}>
        <Plus className="mr-2 h-4 w-4" />
        Add row
      </ContextMenuItem>
      <ContextMenuItem onClick={onAdd2Rows} disabled={locked}>
        <Plus className="mr-2 h-4 w-4" />
        Add 2 rows
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem disabled={locked}>
        <AlignHorizontalSpaceAround className="mr-2 h-4 w-4" />
        Size columns equally
      </ContextMenuItem>
      <ContextMenuItem disabled={locked}>
        <AlignVerticalSpaceAround className="mr-2 h-4 w-4" />
        Size row to content
      </ContextMenuItem>
      <ContextMenuItem disabled={locked}>
        <AlignHorizontalSpaceAround className="mr-2 h-4 w-4" />
        Size columns to content
      </ContextMenuItem>
      <ContextMenuItem disabled={locked}>
        <Grid3x3 className="mr-2 h-4 w-4" />
        Merge cells
      </ContextMenuItem>
    </ContextMenuContent>
  );
};

export default ExhibitionTableTray;
