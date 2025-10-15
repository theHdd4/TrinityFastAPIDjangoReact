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
  canEdit?: boolean;
  rows: number;
  cols: number;
  showOutline?: boolean;
  selectedCell: { row: number; col: number } | null;
  onToggleLock: () => void;
  onToggleOutline?: () => void;
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
  canEdit = true,
  rows,
  cols,
  showOutline = true,
  selectedCell,
  onToggleLock,
  onToggleOutline,
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
      <ContextMenuItem disabled={locked || !canEdit}>
        <Copy className="mr-2 h-4 w-4" />
        Copy
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={locked || !canEdit}>
        <Clipboard className="mr-2 h-4 w-4" />
        Copy style
        <ContextMenuShortcut>Ctrl+Alt+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={locked || !canEdit}>
        <Clipboard className="mr-2 h-4 w-4" />
        Paste
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={locked || !canEdit}>
        <Files className="mr-2 h-4 w-4" />
        Duplicate
        <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={onDelete} disabled={locked || !canEdit}>
        <Trash2 className="mr-2 h-4 w-4" />
        Delete table
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={onToggleLock} disabled={!canEdit}>
        <Lock className="mr-2 h-4 w-4" />
        {locked ? 'Unlock' : 'Lock'}
        <ContextMenuShortcut>Alt+Shift+L</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuItem onClick={onToggleOutline} disabled={!canEdit}>
        <AlignHorizontalSpaceAround className="mr-2 h-4 w-4" />
        {showOutline ? 'Hide table outline' : 'Show table outline'}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={onDeleteColumn}
        disabled={locked || !selectedCell || cols <= 1 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete column
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDelete2Columns}
        disabled={locked || !selectedCell || cols <= 2 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete 2 columns
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDeleteRow}
        disabled={locked || !selectedCell || rows <= 1 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete row
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDelete2Rows}
        disabled={locked || !selectedCell || rows <= 2 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete 2 rows
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={onAddColumn} disabled={locked || !canEdit}>
        <Plus className="mr-2 h-4 w-4" />
        Add column
      </ContextMenuItem>
      <ContextMenuItem onClick={onAdd2Columns} disabled={locked || !canEdit}>
        <Plus className="mr-2 h-4 w-4" />
        Add 2 columns
      </ContextMenuItem>
      <ContextMenuItem onClick={onAddRow} disabled={locked || !canEdit}>
        <Plus className="mr-2 h-4 w-4" />
        Add row
      </ContextMenuItem>
      <ContextMenuItem onClick={onAdd2Rows} disabled={locked || !canEdit}>
        <Plus className="mr-2 h-4 w-4" />
        Add 2 rows
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem disabled={locked || !canEdit}>
        <AlignHorizontalSpaceAround className="mr-2 h-4 w-4" />
        Size columns equally
      </ContextMenuItem>
      <ContextMenuItem disabled={locked || !canEdit}>
        <AlignVerticalSpaceAround className="mr-2 h-4 w-4" />
        Size row to content
      </ContextMenuItem>
      <ContextMenuItem disabled={locked || !canEdit}>
        <AlignHorizontalSpaceAround className="mr-2 h-4 w-4" />
        Size columns to content
      </ContextMenuItem>
      <ContextMenuItem disabled={locked || !canEdit}>
        <Grid3x3 className="mr-2 h-4 w-4" />
        Merge cells
      </ContextMenuItem>
    </ContextMenuContent>
  );
};

export default ExhibitionTableTray;
