import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import TextBoxToolbar from './TextBoxToolbar';
import type { SlideTextBox, TextBoxPosition } from './types';
import { DEFAULT_TEXT_BOX_TEXT } from './constants';

interface ExhibitionTextBoxProps {
  data: SlideTextBox;
  isEditable?: boolean;
  onTextChange: (id: string, text: string) => void;
  onChange: (id: string, updates: Partial<SlideTextBox>) => void;
  onPositionChange: (id: string, position: TextBoxPosition) => void;
  onInteract?: () => void;
  onDelete?: (id: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
  const [bold, setBold] = useState<boolean>(data.bold);
  const [italic, setItalic] = useState<boolean>(data.italic);
  const [underline, setUnderline] = useState<boolean>(data.underline);
  const [strikethrough, setStrikethrough] = useState<boolean>(data.strikethrough);
  const [align, setAlign] = useState(data.align);
  const [color, setColor] = useState<string>(data.color);
  const [isEditing, setIsEditing] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState<TextBoxPosition>({ x: data.x, y: data.y });
  const [position, setPosition] = useState<TextBoxPosition>({ x: data.x, y: data.y });

  const runCommand = (command: string) => {
    if (!isEditable || typeof document === 'undefined') {
      return;
    }
    if (document.queryCommandSupported?.(command)) {
      textRef.current?.focus();
      document.execCommand(command, false);
    }
  };

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
    setBold(data.bold);
  }, [data.bold]);

  useEffect(() => {
    setItalic(data.italic);
  }, [data.italic]);

  useEffect(() => {
    setUnderline(data.underline);
  }, [data.underline]);

  useEffect(() => {
    setStrikethrough(data.strikethrough);
  }, [data.strikethrough]);

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

  const handleDoubleClick = () => {
    if (!isEditable) {
      return;
    }
    setIsEditing(true);
    setIsActive(true);
    onInteract?.();

    requestAnimationFrame(() => {
      textRef.current?.focus();
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
    if (event.target instanceof HTMLElement && textRef.current?.contains(event.target) && event.target !== event.currentTarget) {
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

  const hasEditableSelection = useCallback(() => {
    if (typeof window === 'undefined' || !textRef.current) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return false;
    }

    const { anchorNode, focusNode } = selection;

    return isNodeWithinText(anchorNode) && isNodeWithinText(focusNode);
  }, [isNodeWithinText]);

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditable) {
      return;
    }

    const validSelection = hasEditableSelection();
    if (!validSelection) {
      setShowToolbar(false);
      event.preventDefault();
      return;
    }

    setIsActive(true);
    setShowToolbar(true);
    onInteract?.();
    event.preventDefault();
  };

  const increaseFontSize = () => {
    setFontSize(prev => {
      const next = clamp(prev + 2, 8, 200);
      onChange(data.id, { fontSize: next });
      return next;
    });
  };

  const decreaseFontSize = () => {
    setFontSize(prev => {
      const next = clamp(prev - 2, 8, 200);
      onChange(data.id, { fontSize: next });
      return next;
    });
  };

  const toggleBold = () => {
    setBold(prev => {
      const next = !prev;
      onChange(data.id, { bold: next });
      return next;
    });
  };

  const toggleItalic = () => {
    setItalic(prev => {
      const next = !prev;
      onChange(data.id, { italic: next });
      return next;
    });
  };

  const toggleUnderline = () => {
    setUnderline(prev => {
      const next = !prev;
      onChange(data.id, { underline: next });
      return next;
    });
  };

  const toggleStrikethrough = () => {
    setStrikethrough(prev => {
      const next = !prev;
      onChange(data.id, { strikethrough: next });
      return next;
    });
  };

  const handleAlign = (nextAlign: typeof align) => {
    setAlign(nextAlign);
    onChange(data.id, { align: nextAlign });
  };

  const handleFontFamilyChange = (nextFont: string) => {
    setFontFamily(nextFont);
    onChange(data.id, { fontFamily: nextFont });
  };

  const handleColorChange = (nextColor: string) => {
    setColor(nextColor);
    onChange(data.id, { color: nextColor });
  };

  const handleDelete = () => {
    onDelete?.(data.id);
  };

  useEffect(() => {
    if (textRef.current && textRef.current.innerHTML !== text) {
      textRef.current.innerHTML = text;
    }
  }, [text]);

  const containerStyles = useMemo(
    () => ({
      left: position.x,
      top: position.y,
      zIndex: showToolbar || isActive ? 1000 : 20,
    }),
    [position.x, position.y, isActive, showToolbar],
  );

  const textDecoration = useMemo(() => {
    const decorations: string[] = [];
    if (underline) {
      decorations.push('underline');
    }
    if (strikethrough) {
      decorations.push('line-through');
    }
    return decorations.join(' ');
  }, [underline, strikethrough]);

  const toolbarProps = {
    fontFamily,
    onFontFamilyChange: handleFontFamilyChange,
    fontSize,
    onIncreaseFontSize: increaseFontSize,
    onDecreaseFontSize: decreaseFontSize,
    bold,
    italic,
    underline,
    strikethrough,
    onToggleBold: toggleBold,
    onToggleItalic: toggleItalic,
    onToggleUnderline: toggleUnderline,
    onToggleStrikethrough: toggleStrikethrough,
    align,
    onAlign: handleAlign,
    onBulletedList: () => runCommand('insertUnorderedList'),
    onNumberedList: () => runCommand('insertOrderedList'),
    color,
    onColorChange: handleColorChange,
    onRequestEffects: () => {},
    onRequestAnimate: () => {},
    onRequestPosition: () => {},
    onDelete: handleDelete,
  } as const;

  return (
    <div
      className={cn('absolute group', isDragging && 'cursor-move opacity-60')}
      style={containerStyles}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {showToolbar && isEditable && !isDragging && (
        <TextBoxToolbar {...toolbarProps} />
      )}

      <div
        ref={textRef}
        className={cn(
          'min-w-[200px] min-h-[40px] p-3 rounded border-2 transition-all outline-none bg-background/80 backdrop-blur',
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
          fontWeight: bold ? 'bold' : 'normal',
          fontStyle: italic ? 'italic' : 'normal',
          textDecoration,
          textAlign: align,
          color,
          userSelect: isEditable ? undefined : 'none',
        }}
        data-placeholder={DEFAULT_TEXT_BOX_TEXT}
      />
    </div>
  );
};

export default ExhibitionTextBox;
