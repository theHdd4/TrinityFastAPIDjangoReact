import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Palette,
  Sparkles,
  Move,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { SlideTextBox, TextBoxPosition } from './types';
import { DEFAULT_TEXT_BOX_TEXT, FONT_OPTIONS } from './constants';

interface ExhibitionTextBoxProps {
  data: SlideTextBox;
  isEditable?: boolean;
  onTextChange: (id: string, text: string) => void;
  onChange: (id: string, updates: Partial<SlideTextBox>) => void;
  onPositionChange: (id: string, position: TextBoxPosition) => void;
  onInteract?: () => void;
  onDelete?: (id: string) => void;
}

export interface TextBoxProps {
  id: string;
  initialText?: string;
  initialX?: number;
  initialY?: number;
  initialFontSize?: number;
  initialFontFamily?: string;
  initialBold?: boolean;
  initialItalic?: boolean;
  initialUnderline?: boolean;
  initialStrikethrough?: boolean;
  initialAlign?: SlideTextBox['align'];
  initialColor?: string;
  isEditable?: boolean;
  onUpdate?: (id: string, text: string) => void;
  onStyleChange?: (id: string, updates: Partial<SlideTextBox>) => void;
  onPositionChange?: (id: string, position: TextBoxPosition) => void;
  onDelete?: (id: string) => void;
  onInteract?: () => void;
}

type FormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const initialFormatState: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
};

export const ExhibitionTextBox: React.FC<ExhibitionTextBoxProps> = ({
  data,
  isEditable = true,
  onTextChange,
  onChange,
  onPositionChange,
  onInteract,
  onDelete,
}) => {
  const textRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState<string>(data.text);
  const [fontSize, setFontSize] = useState<number>(data.fontSize);
  const [fontFamily, setFontFamily] = useState<string>(data.fontFamily);
  const [align, setAlign] = useState<SlideTextBox['align']>(data.align);
  const [color, setColor] = useState<string>(data.color);
  const [isEditing, setIsEditing] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState<TextBoxPosition>({
    x: data.x,
    y: data.y,
  });
  const [position, setPosition] = useState<TextBoxPosition>({
    x: data.x,
    y: data.y,
  });
  const [formatState, setFormatState] = useState<FormatState>({
    bold: data.bold,
    italic: data.italic,
    underline: data.underline,
    strikethrough: data.strikethrough,
  });

  useEffect(() => {
    setFormatState({
      bold: data.bold,
      italic: data.italic,
      underline: data.underline,
      strikethrough: data.strikethrough,
    });
  }, [data.bold, data.italic, data.strikethrough, data.underline]);

  const isNodeWithinText = useCallback(
    (node: Node | null): boolean => {
      if (!node || !textRef.current) {
        return false;
      }

      if (node === textRef.current) {
        return true;
      }

      if (node instanceof Element) {
        return textRef.current.contains(node);
      }

      return isNodeWithinText(node.parentNode);
    },
    [],
  );

  const getSelectionInfo = useCallback(() => {
    if (typeof window === 'undefined' || !textRef.current) {
      return {
        selection: null as Selection | null,
        isInside: false,
        hasSelection: false,
      };
    }

    const selection = window.getSelection();
    if (!selection) {
      return { selection: null, isInside: false, hasSelection: false };
    }

    const anchorInside = isNodeWithinText(selection.anchorNode);
    const focusInside = isNodeWithinText(selection.focusNode);
    const isInside = anchorInside && focusInside;

    return {
      selection,
      isInside,
      hasSelection: isInside && !selection.isCollapsed,
    };
  }, [isNodeWithinText]);

  const readFormatState = useCallback((): FormatState => {
    if (typeof document === 'undefined') {
      return initialFormatState;
    }

    return {
      bold: document.queryCommandState?.('bold') ?? false,
      italic: document.queryCommandState?.('italic') ?? false,
      underline: document.queryCommandState?.('underline') ?? false,
      strikethrough: document.queryCommandState?.('strikeThrough') ?? false,
    };
  }, []);

  const focusText = useCallback(() => {
    if (!textRef.current) {
      return;
    }

    if (document.activeElement !== textRef.current) {
      textRef.current.focus();
    }
  }, []);

  const refreshFormatState = useCallback(
    (persistBase = false) => {
      if (!isEditable) {
        return;
      }

      const { selection, isInside } = getSelectionInfo();
      if (!selection || !isInside) {
        setFormatState(prev => ({ ...prev }));
        return;
      }

      const next = readFormatState();
      setFormatState(next);

      if (persistBase && selection.isCollapsed) {
        onChange(data.id, next);
      }
    },
    [data.id, getSelectionInfo, isEditable, onChange, readFormatState],
  );

  const applyCommand = useCallback(
    (command: string, value?: string, persistBase = false) => {
      if (!isEditable || typeof document === 'undefined') {
        return;
      }

      const { isInside, hasSelection } = getSelectionInfo();
      if (!isInside) {
        focusText();
      } else {
        focusText();
      }

      if (document.queryCommandSupported && !document.queryCommandSupported(command)) {
        return;
      }

      if (value !== undefined) {
        document.execCommand(command, false, value);
      } else {
        document.execCommand(command, false);
      }

      refreshFormatState(persistBase || (isInside && !hasSelection));
    },
    [focusText, getSelectionInfo, isEditable, refreshFormatState],
  );

  useEffect(() => {
    setText(data.text);
  }, [data.text]);

  useEffect(() => {
    setFontSize(data.fontSize);
  }, [data.fontSize]);

  useEffect(() => {
    setFontFamily(data.fontFamily);
  }, [data.fontFamily]);

  useEffect(() => {
    setAlign(data.align);
  }, [data.align]);

  useEffect(() => {
    setColor(data.color);
  }, [data.color]);

  useEffect(() => {
    setPosition({ x: data.x, y: data.y });
  }, [data.x, data.y]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (textRef.current && textRef.current.contains(target)) {
        return;
      }

      setIsActive(false);
      setShowToolbar(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      setPosition(prev => ({
        x: event.clientX - dragOrigin.x,
        y: event.clientY - dragOrigin.y,
      }));
    };

    const handleUp = (event: MouseEvent) => {
      setIsDragging(false);
      const clamped: TextBoxPosition = {
        x: clamp(event.clientX - dragOrigin.x, 0, Number.MAX_SAFE_INTEGER),
        y: clamp(event.clientY - dragOrigin.y, 0, Number.MAX_SAFE_INTEGER),
      };
      setPosition(clamped);
      onPositionChange(data.id, clamped);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, dragOrigin, data.id, onPositionChange]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const handleSelectionChange = () => {
      refreshFormatState(false);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [isEditing, refreshFormatState]);

  useEffect(() => {
    if (textRef.current && textRef.current.innerHTML !== text) {
      textRef.current.innerHTML = text;
    }
  }, [text]);

  const handleDoubleClick = () => {
    if (!isEditable) {
      return;
    }

    setIsEditing(true);
    setIsActive(true);
    setShowToolbar(true);
    onInteract?.();

    requestAnimationFrame(() => {
      focusText();
      refreshFormatState(false);
    });
  };

  const handleBlur = () => {
    setIsEditing(false);
    setShowToolbar(false);

    if (textRef.current) {
      const html = textRef.current.innerHTML.trim();
      setText(html);
      onTextChange(data.id, html);
    }
  };

  const handleInput = () => {
    if (textRef.current) {
      setText(textRef.current.innerHTML);
    }
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditable) {
      return;
    }

    if (isEditing) {
      return;
    }

    if (
      event.target instanceof HTMLElement &&
      textRef.current?.contains(event.target) &&
      event.target !== event.currentTarget
    ) {
      return;
    }

    setIsActive(true);
    setIsDragging(true);
    setDragOrigin({
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    });
    onInteract?.();
    event.preventDefault();
  };

  const handleClick = () => {
    if (!isEditable) {
      return;
    }

    setIsActive(true);
    onInteract?.();
  };

  const increaseFontSize = () => {
    if (!isEditable) {
      return;
    }

    setFontSize(prev => {
      const next = clamp(prev + 2, 8, 200);
      onChange(data.id, { fontSize: next });
      return next;
    });
  };

  const decreaseFontSize = () => {
    if (!isEditable) {
      return;
    }

    setFontSize(prev => {
      const next = clamp(prev - 2, 8, 200);
      onChange(data.id, { fontSize: next });
      return next;
    });
  };

  const handleFontFamilyChange = (font: string) => {
    if (!isEditable) {
      return;
    }

    setFontFamily(font);
    onChange(data.id, { fontFamily: font });
  };

  const handleAlignChange = (nextAlign: SlideTextBox['align']) => {
    if (!isEditable) {
      return;
    }

    setAlign(nextAlign);
    onChange(data.id, { align: nextAlign });

    const commandMap: Record<SlideTextBox['align'], string> = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
    };

    applyCommand(commandMap[nextAlign]);
  };

  const handleColorChange = (nextColor: string) => {
    if (!isEditable) {
      return;
    }

    setColor(nextColor);
    const { hasSelection, isInside } = getSelectionInfo();
    if (isInside) {
      applyCommand('foreColor', nextColor, !hasSelection);
    }

    onChange(data.id, { color: nextColor });
  };

  const handleContextMenuOpen = (open: boolean) => {
    if (!isEditable) {
      return;
    }

    if (open) {
      setIsActive(true);
      setShowToolbar(true);
      setIsEditing(true);
      onInteract?.();
      requestAnimationFrame(() => {
        focusText();
        refreshFormatState(false);
      });
    }
  };

  const containerStyles = useMemo(
    () => ({
      left: position.x,
      top: position.y,
      zIndex: showToolbar || isActive ? 2000 : 20,
    }),
    [position.x, position.y, isActive, showToolbar],
  );

  const toolbar = (
    <div className="bg-background border border-border rounded-lg shadow-lg p-1 flex items-center gap-1 z-[2000]">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
            {fontFamily}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <div className="space-y-1">
            {FONT_OPTIONS.map(option => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleFontFamilyChange(option)}
                style={{ fontFamily: option }}
                type="button"
              >
                {option}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={decreaseFontSize}
        type="button"
      >
        -
      </Button>
      <span className="text-sm font-medium w-8 text-center">{fontSize}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={increaseFontSize}
        type="button"
      >
        +
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant={formatState.bold ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => applyCommand('bold', undefined, true)}
        type="button"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant={formatState.italic ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => applyCommand('italic', undefined, true)}
        type="button"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant={formatState.underline ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => applyCommand('underline', undefined, true)}
        type="button"
      >
        <Underline className="h-4 w-4" />
      </Button>
      <Button
        variant={formatState.strikethrough ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => applyCommand('strikeThrough', undefined, true)}
        type="button"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant={align === 'left' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => handleAlignChange('left')}
        type="button"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        variant={align === 'center' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => handleAlignChange('center')}
        type="button"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        variant={align === 'right' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => handleAlignChange('right')}
        type="button"
      >
        <AlignRight className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => applyCommand('insertUnorderedList')}
        type="button"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => applyCommand('insertOrderedList')}
        type="button"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <input
            type="color"
            value={color}
            onChange={event => handleColorChange(event.target.value)}
            className="w-32 h-8 cursor-pointer"
          />
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" type="button">
        Effects
      </Button>
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" type="button">
        <Sparkles className="h-3 w-3 text-purple-500" />
        Animate
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" type="button">
        <Move className="h-3 w-3" />
        Position
      </Button>

      {onDelete && (
        <>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive"
            onClick={() => onDelete(data.id)}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <ContextMenu onOpenChange={handleContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          className={cn('absolute group', isDragging && 'cursor-move opacity-60')}
          style={containerStyles}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
        >
          {showToolbar && isEditable && !isDragging && (
            <div className="absolute -top-14 left-0" style={{ zIndex: 2000 }}>
              {toolbar}
            </div>
          )}

          <div
            ref={textRef}
            className={cn(
              'min-w-[200px] min-h-[40px] p-3 rounded border-2 transition-all outline-none bg-background/90 backdrop-blur',
              isEditing
                ? 'border-primary shadow-lg'
                : isActive
                ? 'border-primary/50 cursor-move'
                : 'border-transparent hover:border-border cursor-move',
              isDragging && 'pointer-events-none',
            )}
            contentEditable={isEditable && isEditing}
            suppressContentEditableWarning
            onDoubleClick={handleDoubleClick}
            onBlur={handleBlur}
            onInput={handleInput}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily,
              textAlign: align,
              color,
            }}
            data-placeholder={DEFAULT_TEXT_BOX_TEXT}
          />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="hidden" />
    </ContextMenu>
  );
};

export const TextBox: React.FC<TextBoxProps> = ({
  id,
  initialText = DEFAULT_TEXT_BOX_TEXT,
  initialX = 100,
  initialY = 100,
  initialFontSize = 16,
  initialFontFamily = FONT_OPTIONS[0],
  initialBold = false,
  initialItalic = false,
  initialUnderline = false,
  initialStrikethrough = false,
  initialAlign = 'left',
  initialColor = '#000000',
  isEditable = true,
  onUpdate,
  onStyleChange,
  onPositionChange,
  onDelete,
  onInteract,
}) => {
  const [boxData, setBoxData] = useState<SlideTextBox>(() => ({
    id,
    text: initialText,
    x: initialX,
    y: initialY,
    fontSize: initialFontSize,
    fontFamily: initialFontFamily,
    bold: initialBold,
    italic: initialItalic,
    underline: initialUnderline,
    strikethrough: initialStrikethrough,
    align: initialAlign,
    color: initialColor,
  }));

  useEffect(() => {
    setBoxData(prev => (prev.text === initialText ? prev : { ...prev, text: initialText }));
  }, [initialText]);

  useEffect(() => {
    setBoxData(prev => (prev.x === initialX && prev.y === initialY ? prev : { ...prev, x: initialX, y: initialY }));
  }, [initialX, initialY]);

  useEffect(() => {
    setBoxData(prev =>
      prev.fontSize === initialFontSize ? prev : { ...prev, fontSize: initialFontSize },
    );
  }, [initialFontSize]);

  useEffect(() => {
    setBoxData(prev =>
      prev.fontFamily === initialFontFamily ? prev : { ...prev, fontFamily: initialFontFamily },
    );
  }, [initialFontFamily]);

  useEffect(() => {
    setBoxData(prev => (prev.align === initialAlign ? prev : { ...prev, align: initialAlign }));
  }, [initialAlign]);

  useEffect(() => {
    setBoxData(prev => (prev.color === initialColor ? prev : { ...prev, color: initialColor }));
  }, [initialColor]);

  useEffect(() => {
    setBoxData(prev => (prev.bold === initialBold ? prev : { ...prev, bold: initialBold }));
  }, [initialBold]);

  useEffect(() => {
    setBoxData(prev => (prev.italic === initialItalic ? prev : { ...prev, italic: initialItalic }));
  }, [initialItalic]);

  useEffect(() => {
    setBoxData(prev =>
      prev.underline === initialUnderline ? prev : { ...prev, underline: initialUnderline },
    );
  }, [initialUnderline]);

  useEffect(() => {
    setBoxData(prev =>
      prev.strikethrough === initialStrikethrough
        ? prev
        : { ...prev, strikethrough: initialStrikethrough },
    );
  }, [initialStrikethrough]);

  const handleStyleChange = (boxId: string, updates: Partial<SlideTextBox>) => {
    setBoxData(prev => ({ ...prev, ...updates }));
    onStyleChange?.(boxId, updates);
  };

  const handleTextChange = (boxId: string, nextText: string) => {
    setBoxData(prev => (prev.text === nextText ? prev : { ...prev, text: nextText }));
    onUpdate?.(boxId, nextText);
  };

  const handlePositionChange = (boxId: string, position: TextBoxPosition) => {
    setBoxData(prev => ({ ...prev, ...position }));
    onPositionChange?.(boxId, position);
  };

  return (
    <ExhibitionTextBox
      data={boxData}
      isEditable={isEditable}
      onTextChange={handleTextChange}
      onChange={handleStyleChange}
      onPositionChange={handlePositionChange}
      onDelete={onDelete}
      onInteract={onInteract}
    />
  );
};

export default ExhibitionTextBox;
