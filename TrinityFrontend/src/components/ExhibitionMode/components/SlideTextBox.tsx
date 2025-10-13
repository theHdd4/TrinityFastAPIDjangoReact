import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Palette,
  Type,
  Underline,
  Highlighter,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExhibitionTextBox } from '../store/exhibitionStore';

interface SlideTextBoxProps {
  textBox: ExhibitionTextBox;
  canEdit: boolean;
  onChange: (updates: Partial<ExhibitionTextBox>) => void;
  onRemove?: () => void;
  autoFocus?: boolean;
  onFocusAcknowledged?: () => void;
  onInteract?: () => void;
}

const FONT_OPTIONS = ['Inter', 'Times New Roman', 'Georgia', 'Arial', 'Montserrat'];
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 120;
const FONT_STEP = 4;

const SlideTextBox: React.FC<SlideTextBoxProps> = ({
  textBox,
  canEdit,
  onChange,
  onRemove,
  autoFocus = false,
  onFocusAcknowledged,
  onInteract,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [fontSize, setFontSize] = useState<number>(textBox.fontSize);
  const [fontFamily, setFontFamily] = useState<string>(textBox.fontFamily);
  const [textColor, setTextColor] = useState<string>(textBox.textColor);
  const highlightColor = useMemo(() => '#fef08a', []);

  useEffect(() => {
    setFontSize(textBox.fontSize);
  }, [textBox.fontSize]);

  useEffect(() => {
    setFontFamily(textBox.fontFamily);
  }, [textBox.fontFamily]);

  useEffect(() => {
    setTextColor(textBox.textColor);
  }, [textBox.textColor]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== textBox.html) {
      editorRef.current.innerHTML = textBox.html;
    }
  }, [textBox.html]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.style.fontFamily = fontFamily;
    editorRef.current.style.fontSize = `${fontSize}px`;
    editorRef.current.style.color = textColor;
    editorRef.current.style.textAlign = textBox.alignment;
  }, [fontFamily, fontSize, textColor, textBox.alignment]);

  useEffect(() => {
    if (!autoFocus || !canEdit || !editorRef.current) {
      return;
    }

    const element = editorRef.current;
    element.focus({ preventScroll: true });

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    selectionRef.current = range.cloneRange();
    onFocusAcknowledged?.();
  }, [autoFocus, canEdit, onFocusAcknowledged]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        setContextMenu(null);
        return;
      }

      if (menuRef.current?.contains(target)) {
        return;
      }
      if (editorRef.current?.contains(target)) {
        return;
      }
      setContextMenu(null);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const restoreSelection = () => {
    const range = selectionRef.current;
    const selection = window.getSelection();
    if (!range || !selection) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const handleInput = () => {
    if (!editorRef.current) {
      return;
    }
    const html = editorRef.current.innerHTML;
    onChange({ html });
    onInteract?.();
  };

  const handleFocus = () => {
    if (canEdit) {
      onInteract?.();
    }
  };

  const handleBlur = () => {
    setContextMenu(null);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }
    if (!editorRef.current?.contains(selection.anchorNode)) {
      return;
    }

    event.preventDefault();
    selectionRef.current = selection.getRangeAt(0).cloneRange();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const applyInlineStyle = (styles: Partial<CSSStyleDeclaration>) => {
    if (!restoreSelection()) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      return;
    }

    const span = document.createElement('span');
    Object.assign(span.style, styles);
    span.appendChild(range.extractContents());
    range.insertNode(span);

    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(newRange);
    selectionRef.current = newRange.cloneRange();
    handleInput();
  };

  const applyCommand = (command: string, value?: string) => {
    if (!restoreSelection()) {
      return;
    }
    document.execCommand(command, false, value);
    captureSelection();
    handleInput();
  };

  const handleFontFamilyChange = (value: string) => {
    setFontFamily(value);
    onChange({ fontFamily: value });
    onInteract?.();
    if (restoreSelection()) {
      document.execCommand('fontName', false, value);
      captureSelection();
      handleInput();
    }
  };

  const updateFontSize = (nextSize: number) => {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, nextSize));
    setFontSize(clamped);
    onChange({ fontSize: clamped });
    onInteract?.();
    applyInlineStyle({ fontSize: `${clamped}px` });
  };

  const handleTextColorChange = (value: string) => {
    setTextColor(value);
    onChange({ textColor: value });
    onInteract?.();
    applyCommand('foreColor', value);
  };

  const handleAlignmentChange = (alignment: ExhibitionTextBox['alignment']) => {
    onChange({ alignment });
    onInteract?.();
    if (editorRef.current) {
      editorRef.current.style.textAlign = alignment;
    }
  };

  return (
    <div className="relative rounded-3xl border-2 border-border bg-background/95 p-6 shadow-lg transition-all">
      {canEdit && onRemove && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      <div
        ref={editorRef}
        className={cn(
          'min-h-[120px] w-full whitespace-pre-wrap break-words focus:outline-none',
          !canEdit && 'cursor-text',
        )}
        contentEditable={canEdit}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onContextMenu={handleContextMenu}
        onClick={() => setContextMenu(null)}
      />

      {contextMenu && canEdit && (
        <div
          ref={menuRef}
          className="fixed z-50 flex items-center gap-3 rounded-2xl border border-border bg-popover px-3 py-2 text-sm shadow-2xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={event => event.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" />
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none"
              value={fontFamily}
              onChange={event => handleFontFamilyChange(event.target.value)}
            >
              {FONT_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => updateFontSize(fontSize - FONT_STEP)}
              type="button"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-12 text-center font-semibold">{fontSize}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => updateFontSize(fontSize + FONT_STEP)}
              type="button"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <input
              type="color"
              value={textColor}
              onChange={event => handleTextColorChange(event.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-border bg-background p-0"
            />
          </label>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => applyCommand('bold')}
              type="button"
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => applyCommand('italic')}
              type="button"
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => applyCommand('underline')}
              type="button"
            >
              <Underline className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => applyInlineStyle({ backgroundColor: highlightColor })}
              type="button"
            >
              <Highlighter className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1 border-l border-border pl-3">
            <Button
              size="icon"
              variant="ghost"
              className={cn('h-7 w-7', textBox.alignment === 'left' && 'bg-muted')}
              onClick={() => handleAlignmentChange('left')}
              type="button"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn('h-7 w-7', textBox.alignment === 'center' && 'bg-muted')}
              onClick={() => handleAlignmentChange('center')}
              type="button"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn('h-7 w-7', textBox.alignment === 'right' && 'bg-muted')}
              onClick={() => handleAlignmentChange('right')}
              type="button"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideTextBox;
