/**
 * Table Rich Text Toolbar Component
 * 
 * Floating toolbar for table cell formatting
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Underline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TableCellFormatting } from './types';
import { useTableRichTextToolbar } from './hooks/useTableRichTextToolbar';

interface TableRichTextToolbarProps {
  formatting: TableCellFormatting;
  onFormattingChange: (formatting: Partial<TableCellFormatting>) => void;
  cellPosition: { top: number; left: number; width: number } | null;
  isVisible: boolean;
}

const TableRichTextToolbar: React.FC<TableRichTextToolbarProps> = ({
  formatting,
  onFormattingChange,
  cellPosition,
  isVisible,
}) => {
  const {
    toolbarPosition,
    handleToggleBold,
    handleToggleItalic,
    handleToggleUnderline,
    handleFontFamilyChange,
    handleTextColorChange,
    handleBackgroundColorChange,
  } = useTableRichTextToolbar({
    formatting,
    onFormattingChange,
    cellPosition,
    isVisible,
  });

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!isVisible || !toolbarPosition || !portalTarget) {
    return null;
  }

  // Prevent blur when clicking toolbar
  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Common font families
  const fontFamilies = [
    'Arial',
    'Times New Roman',
    'Courier New',
    'Georgia',
    'Verdana',
    'Comic Sans MS',
    'Trebuchet MS',
    'Impact',
  ];

  return createPortal(
    <div
      data-table-rich-text-toolbar="true"
      className="fixed z-[2000]"
      style={{
        top: `${toolbarPosition.top}px`,
        left: `${toolbarPosition.left}px`,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={handleToolbarMouseDown}
    >
      <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/95 px-2 py-1 shadow-lg backdrop-blur-sm">
        {/* Font Family Selector */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-8 min-w-[100px] justify-between rounded-md border border-border/50 px-2 text-xs font-medium hover:bg-muted/40"
              onMouseDown={handleToolbarMouseDown}
            >
              <span className="truncate" style={{ fontFamily: formatting.fontFamily }}>
                {formatting.fontFamily}
              </span>
              <span className="ml-2 text-[10px]">▼</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="z-[4000] w-[200px] p-2"
            data-text-toolbar-root
            onMouseDown={handleToolbarMouseDown}
          >
            <div className="space-y-1">
              {fontFamilies.map((font) => (
                <button
                  key={font}
                  type="button"
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted/40",
                    formatting.fontFamily === font && "bg-muted"
                  )}
                  style={{ fontFamily: font }}
                  onMouseDown={handleToolbarMouseDown}
                  onClick={() => {
                    handleFontFamilyChange(font);
                    // Restore focus to editor
                    const editorElement = document.querySelector('[data-table-cell-editor="true"]') as HTMLElement;
                    if (editorElement) {
                      editorElement.focus();
                    }
                  }}
                >
                  {font}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Separator */}
        <div className="h-6 w-px bg-border/50" />

        {/* Bold Button */}
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className={cn(
            "h-8 w-8 rounded-md",
            formatting.bold && "bg-muted"
          )}
          onMouseDown={handleToolbarMouseDown}
          onClick={handleToggleBold}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>

        {/* Italic Button */}
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className={cn(
            "h-8 w-8 rounded-md",
            formatting.italic && "bg-muted"
          )}
          onMouseDown={handleToolbarMouseDown}
          onClick={handleToggleItalic}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>

        {/* Underline Button */}
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className={cn(
            "h-8 w-8 rounded-md",
            formatting.underline && "bg-muted"
          )}
          onMouseDown={handleToolbarMouseDown}
          onClick={handleToggleUnderline}
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </Button>

        {/* Separator */}
        <div className="h-6 w-px bg-border/50" />

        {/* Text Color Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-8 w-8 rounded-md border border-border/50 p-0 hover:bg-muted/40"
              onMouseDown={handleToolbarMouseDown}
              title="Text Color"
            >
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[10px] font-semibold">C</span>
                <div
                  className="ml-1 h-3 w-3 rounded-full border border-white/70"
                  style={{ backgroundColor: formatting.textColor }}
                />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="center"
            className="z-[4000] w-[200px] p-3"
            data-text-toolbar-root
            onMouseDown={handleToolbarMouseDown}
          >
            <div className="space-y-2">
              <label className="text-xs font-medium">Text Color</label>
              <input
                type="color"
                value={formatting.textColor}
                onChange={(e) => {
                  handleTextColorChange(e.target.value);
                  // Restore focus to editor
                  const editorElement = document.querySelector('[data-table-cell-editor="true"]') as HTMLElement;
                  if (editorElement) {
                    editorElement.focus();
                  }
                }}
                onMouseDown={handleToolbarMouseDown}
                className="h-10 w-full cursor-pointer rounded border"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Background Color Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-8 w-8 rounded-md border border-border/50 p-0 hover:bg-muted/40"
              onMouseDown={handleToolbarMouseDown}
              title="Background Color"
            >
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[10px] font-semibold">B</span>
                <div
                  className="ml-1 h-3 w-3 rounded-full border border-white/70"
                  style={{ 
                    backgroundColor: formatting.backgroundColor === 'transparent' 
                      ? '#ffffff' 
                      : formatting.backgroundColor 
                  }}
                />
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="center"
            className="z-[4000] w-[200px] p-3"
            data-text-toolbar-root
            onMouseDown={handleToolbarMouseDown}
          >
            <div className="space-y-2">
              <label className="text-xs font-medium">Background Color</label>
              <input
                type="color"
                value={formatting.backgroundColor === 'transparent' ? '#ffffff' : formatting.backgroundColor}
                onChange={(e) => {
                  handleBackgroundColorChange(e.target.value);
                  // Restore focus to editor
                  const editorElement = document.querySelector('[data-table-cell-editor="true"]') as HTMLElement;
                  if (editorElement) {
                    editorElement.focus();
                  }
                }}
                onMouseDown={handleToolbarMouseDown}
                className="h-10 w-full cursor-pointer rounded border"
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="w-full text-xs"
                onMouseDown={handleToolbarMouseDown}
                onClick={() => {
                  handleBackgroundColorChange('transparent');
                  const editorElement = document.querySelector('[data-table-cell-editor="true"]') as HTMLElement;
                  if (editorElement) {
                    editorElement.focus();
                  }
                }}
              >
                Transparent
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>,
    portalTarget
  );
};

export default TableRichTextToolbar;



