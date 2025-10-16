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
  Palette,
  Check,
} from 'lucide-react';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { TABLE_STYLE_GROUPS, type TableStyleDefinition } from './constants';

const noop = () => {};

const parseHexColor = (value: string): { r: number; g: number; b: number } | null => {
  const hex = value.trim().replace(/^#/, '');

  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }

  const normalized = hex.length === 3 ? hex.replace(/./g, char => `${char}${char}`) : hex;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return { r, g, b };
};

const toLinearChannel = (value: number): number => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
};

const calculateLuminance = ({ r, g, b }: { r: number; g: number; b: number }): number => {
  const red = toLinearChannel(r);
  const green = toLinearChannel(g);
  const blue = toLinearChannel(b);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const getPreviewAccentColor = (hex: string): string => {
  const rgb = parseHexColor(hex);

  if (!rgb) {
    return 'rgba(17, 24, 39, 0.5)';
  }

  const luminance = calculateLuminance(rgb);

  return luminance > 0.6 ? 'rgba(17, 24, 39, 0.45)' : 'rgba(255, 255, 255, 0.78)';
};

export interface ExhibitionTableTrayProps {
  locked: boolean;
  canEdit?: boolean;
  rows: number;
  cols: number;
  showOutline?: boolean;
  selectedCell: { row: number; col: number; region?: 'header' | 'body' } | null;
  styleId?: string;
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
  onSelectStyle?: (styleId: string) => void;
}

export const ExhibitionTableTray: React.FC<ExhibitionTableTrayProps> = ({
  locked,
  canEdit = true,
  rows,
  cols,
  showOutline = true,
  selectedCell,
  styleId,
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
  onSelectStyle = noop,
}) => {
  const isHeaderSelected = selectedCell?.region === 'header' || selectedCell?.row === -1;
  const hasColumnSelection = Boolean(selectedCell && selectedCell.col >= 0);
  const hasBodySelection = Boolean(selectedCell && !isHeaderSelected && selectedCell.row >= 0);
  const disableStyleSelection = locked || !canEdit;

  const renderStylePreview = (style: TableStyleDefinition) => {
    const rowConfigs: Array<{
      key: string;
      background: string;
      accent: string;
      primaryWidths: [string, string, string];
      secondaryWidths?: [string, string, string];
    }> = [
      {
        key: 'header',
        background: style.preview.header,
        accent: getPreviewAccentColor(style.preview.header),
        primaryWidths: ['58%', '52%', '48%'],
      },
      {
        key: 'odd',
        background: style.preview.odd,
        accent: getPreviewAccentColor(style.preview.odd),
        primaryWidths: ['72%', '64%', '58%'],
        secondaryWidths: ['42%', '48%', '36%'],
      },
      {
        key: 'even',
        background: style.preview.even,
        accent: getPreviewAccentColor(style.preview.even),
        primaryWidths: ['68%', '60%', '54%'],
        secondaryWidths: ['40%', '46%', '34%'],
      },
    ];

    return (
      <div
        className="rounded-md border p-1 shadow-sm"
        style={{
          borderColor: style.preview.border,
          backgroundColor: style.table.background,
        }}
      >
        <div className="space-y-[3px]">
          {rowConfigs.map(row => (
            <div
              key={`${style.id}-row-${row.key}`}
              className="grid grid-cols-3 overflow-hidden rounded-[3px] border"
              style={{ borderColor: style.preview.border }}
            >
              {row.primaryWidths.map((width, columnIndex) => (
                <div
                  key={`${style.id}-row-${row.key}-col-${columnIndex}`}
                  className="flex flex-col justify-center border-r px-1.5 py-1 last:border-r-0"
                  style={{
                    backgroundColor: row.background,
                    borderColor: style.preview.border,
                  }}
                >
                  <div
                    className="h-1.5 rounded-sm"
                    style={{
                      backgroundColor: row.accent,
                      width,
                    }}
                  />
                  {row.secondaryWidths && (
                    <div
                      className="mt-[2px] h-1 rounded-sm opacity-80"
                      style={{
                        backgroundColor: row.accent,
                        width: row.secondaryWidths[columnIndex],
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

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

      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={disableStyleSelection}>
          <Palette className="mr-2 h-4 w-4" />
          Table style
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-[320px]">
          {TABLE_STYLE_GROUPS.map(group => (
            <div key={group.id} className="mb-2 last:mb-0">
              <ContextMenuLabel className="px-1.5 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {group.label}
              </ContextMenuLabel>
              <div className="grid grid-cols-3 gap-2 px-1.5">
                {group.styles.map(style => {
                  const isActive = style.id === styleId;

                  return (
                    <ContextMenuItem
                      key={style.id}
                      asChild
                      disabled={disableStyleSelection}
                      className="p-0"
                    >
                      <button
                        type="button"
                        className={cn(
                          'flex h-24 w-full flex-col justify-between rounded-md border bg-background p-2 text-left text-xs font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                          isActive
                            ? 'border-primary/70 ring-2 ring-primary ring-offset-2 ring-offset-background'
                            : 'hover:border-primary/50 hover:shadow-md',
                        )}
                        onClick={() => onSelectStyle(style.id)}
                      >
                        {renderStylePreview(style)}
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <span className="truncate font-semibold">{style.label}</span>
                          {isActive && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    </ContextMenuItem>
                  );
                })}
              </div>
            </div>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuItem onClick={onToggleOutline} disabled={!canEdit}>
        <AlignHorizontalSpaceAround className="mr-2 h-4 w-4" />
        {showOutline ? 'Hide table outline' : 'Show table outline'}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={onDeleteColumn}
        disabled={locked || !hasColumnSelection || cols <= 1 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete column
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDelete2Columns}
        disabled={locked || !hasColumnSelection || cols <= 2 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete 2 columns
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDeleteRow}
        disabled={locked || !hasBodySelection || rows <= 1 || !canEdit}
      >
        <Minus className="mr-2 h-4 w-4" />
        Delete row
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onDelete2Rows}
        disabled={locked || !hasBodySelection || rows <= 2 || !canEdit}
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
