import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import TextBoxToolbar from './TextBoxToolbar';
import { DEFAULT_TEXT_BOX_TEXT, extractTextBoxFormatting } from './constants';
import type { TextBoxFormatting } from './types';

interface SlideTextBoxObjectProps {
  id: string;
  canEdit: boolean;
  props: Record<string, unknown> | undefined;
  isEditing: boolean;
  isSelected: boolean;
  editingValue: string;
  onBeginEditing: () => void;
  onCommitEditing: () => void;
  onCancelEditing: () => void;
  onEditingChange: (value: string) => void;
  onUpdateFormatting: (updates: Partial<TextBoxFormatting>) => void;
  onDelete?: () => void;
  onInteract: () => void;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
}

const clampFontSize = (value: number) => Math.min(Math.max(value, 8), 200);

export const SlideTextBoxObject: React.FC<SlideTextBoxObjectProps> = ({
  id,
  canEdit,
  props,
  isEditing,
  isSelected,
  editingValue,
  onBeginEditing,
  onCommitEditing,
  onCancelEditing,
  onEditingChange,
  onUpdateFormatting,
  onDelete,
  onInteract,
  onToolbarStateChange,
}) => {
  const textRef = useRef<HTMLDivElement | null>(null);
  const formatting = useMemo(() => extractTextBoxFormatting(props), [props]);
  const [localFormatting, setLocalFormatting] = useState<TextBoxFormatting>(formatting);

  useEffect(() => {
    setLocalFormatting(formatting);
  }, [formatting]);

  useEffect(() => {
    if (!textRef.current) {
      return;
    }

    const target = isEditing ? editingValue : localFormatting.text;
    if (textRef.current.innerHTML !== target) {
      textRef.current.innerHTML = target;
    }

    if (isEditing) {
      requestAnimationFrame(() => {
        textRef.current?.focus();
      });
    }
  }, [editingValue, isEditing, localFormatting.text]);

  const handleInput = useCallback(() => {
    if (!textRef.current) {
      return;
    }
    onEditingChange(textRef.current.innerHTML);
  }, [onEditingChange]);

  const handleBlur = useCallback(() => {
    if (!isEditing) {
      return;
    }
    onCommitEditing();
  }, [isEditing, onCommitEditing]);

  const runCommand = useCallback(
    (command: string) => {
      if (!canEdit) {
        return;
      }
      if (typeof document !== 'undefined' && document.queryCommandSupported?.(command)) {
        textRef.current?.focus();
        document.execCommand(command, false);
        handleInput();
      }
    },
    [canEdit, handleInput],
  );

  const updateFormatting = useCallback(
    (updates: Partial<TextBoxFormatting>) => {
      setLocalFormatting(prev => ({ ...prev, ...updates }));
      onUpdateFormatting(updates);
      onInteract();
    },
    [onInteract, onUpdateFormatting],
  );

  const handleToggle = useCallback(
    (key: keyof Pick<TextBoxFormatting, 'bold' | 'italic' | 'underline' | 'strikethrough'>) => {
      updateFormatting({ [key]: !localFormatting[key] } as Partial<TextBoxFormatting>);
    },
    [localFormatting, updateFormatting],
  );

  const handleAlign = useCallback(
    (align: TextBoxFormatting['align']) => {
      updateFormatting({ align });
    },
    [updateFormatting],
  );

  const handleFontFamily = useCallback(
    (fontFamily: string) => {
      updateFormatting({ fontFamily });
    },
    [updateFormatting],
  );

  const handleColor = useCallback(
    (color: string) => {
      updateFormatting({ color });
    },
    [updateFormatting],
  );

  const handleIncreaseFontSize = useCallback(() => {
    updateFormatting({ fontSize: clampFontSize(localFormatting.fontSize + 2) });
  }, [localFormatting.fontSize, updateFormatting]);

  const handleDecreaseFontSize = useCallback(() => {
    updateFormatting({ fontSize: clampFontSize(localFormatting.fontSize - 2) });
  }, [localFormatting.fontSize, updateFormatting]);

  const handleDoubleClick = () => {
    if (!canEdit) {
      return;
    }
    onInteract();
    onBeginEditing();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditing) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelEditing();
    }
  };

  const toolbar = useMemo(
    () => (
      <TextBoxToolbar
        fontFamily={localFormatting.fontFamily}
        onFontFamilyChange={handleFontFamily}
        fontSize={localFormatting.fontSize}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        bold={localFormatting.bold}
        italic={localFormatting.italic}
        underline={localFormatting.underline}
        strikethrough={localFormatting.strikethrough}
        onToggleBold={() => handleToggle('bold')}
        onToggleItalic={() => handleToggle('italic')}
        onToggleUnderline={() => handleToggle('underline')}
        onToggleStrikethrough={() => handleToggle('strikethrough')}
        align={localFormatting.align}
        onAlign={handleAlign}
        onBulletedList={() => runCommand('insertUnorderedList')}
        onNumberedList={() => runCommand('insertOrderedList')}
        color={localFormatting.color}
        onColorChange={handleColor}
        onRequestEffects={() => {}}
        onRequestAnimate={() => {}}
        onRequestPosition={() => {}}
        onDelete={onDelete}
      />
    ),
    [
      handleAlign,
      handleColor,
      handleDecreaseFontSize,
      handleFontFamily,
      handleIncreaseFontSize,
      handleToggle,
      localFormatting.align,
      localFormatting.bold,
      localFormatting.color,
      localFormatting.fontFamily,
      localFormatting.fontSize,
      localFormatting.italic,
      localFormatting.strikethrough,
      localFormatting.underline,
      onDelete,
      runCommand,
    ],
  );

  useEffect(() => {
    if (!canEdit) {
      onToolbarStateChange(id, null);
      return () => {
        onToolbarStateChange(id, null);
      };
    }

    const shouldShow = isSelected || isEditing;
    onToolbarStateChange(id, shouldShow ? toolbar : null);

    return () => {
      onToolbarStateChange(id, null);
    };
  }, [canEdit, id, isEditing, isSelected, onToolbarStateChange, toolbar]);

  const content = (
    <div
      className={cn(
        'h-full w-full overflow-hidden rounded-2xl border border-transparent bg-background/95 p-3 transition-colors',
        canEdit && !isEditing && 'hover:border-border/80',
        isEditing && 'border-primary shadow-lg',
      )}
      onDoubleClick={handleDoubleClick}
      onPointerDown={event => {
        if (isEditing) {
          event.stopPropagation();
        }
      }}
      onContextMenu={event => {
        if (canEdit) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={textRef}
        className={cn(
          'h-full w-full overflow-auto outline-none empty:before:absolute empty:before:left-3 empty:before:top-3 empty:before:text-sm empty:before:text-muted-foreground/70 empty:before:content-[attr(data-placeholder)]',
          canEdit ? 'cursor-text' : 'cursor-default select-none',
        )}
        contentEditable={canEdit && isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        data-placeholder={DEFAULT_TEXT_BOX_TEXT}
        style={{
          fontSize: `${localFormatting.fontSize}px`,
          fontFamily: localFormatting.fontFamily,
          fontWeight: localFormatting.bold ? 'bold' : 'normal',
          fontStyle: localFormatting.italic ? 'italic' : 'normal',
          textDecoration: `${localFormatting.underline ? 'underline' : ''} ${
            localFormatting.strikethrough ? 'line-through' : ''
          }`.trim(),
          textAlign: localFormatting.align,
          color: localFormatting.color,
        }}
      />
      {!canEdit && localFormatting.text.trim().length === 0 && (
        <span className="text-sm text-muted-foreground/70">{DEFAULT_TEXT_BOX_TEXT}</span>
      )}
    </div>
  );

  return content;
};

export default SlideTextBoxObject;
