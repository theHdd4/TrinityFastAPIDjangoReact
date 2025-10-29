import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import TextBoxToolbar from './TextBoxToolbar';
import { DEFAULT_TEXT_BOX_TEXT, extractTextBoxFormatting } from './constants';
import { resolveFontFamily } from './fontLoading';
import type { TextBoxFormatting, TextStylePreset } from './types';

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
  onRequestPositionPanel?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

const clampFontSize = (value: number) => Math.min(Math.max(value, 8), 200);

const LIST_LINE_SEPARATOR = /\r?\n/;
const BULLET_PATTERN = /^\s*[•-]\s+/;
const NUMBERED_PATTERN = /^\s*\d+[.)]?\s+/;

const decodeHtmlEntities = (value: string): string => {
  if (typeof window === 'undefined') {
    return value;
  }

  const textarea = window.document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const htmlToPlainText = (rawValue: string): string => {
  if (!rawValue) {
    return '';
  }

  let working = rawValue
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  working = working.replace(/\u00a0/g, ' ');
  working = decodeHtmlEntities(working);

  while (working.endsWith('\n')) {
    working = working.slice(0, -1);
  }

  return working;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const plainTextToHtml = (value: string): string => {
  if (!value) {
    return '';
  }

  return value
    .split(LIST_LINE_SEPARATOR)
    .map(line => {
      if (line.length === 0) {
        return '<div><br></div>';
      }
      return `<div>${escapeHtml(line)}</div>`;
    })
    .join('');
};

const stripListPrefix = (line: string): string => {
  if (BULLET_PATTERN.test(line)) {
    return line.replace(BULLET_PATTERN, '');
  }
  if (NUMBERED_PATTERN.test(line)) {
    return line.replace(NUMBERED_PATTERN, '');
  }
  return line;
};

const toggleBulletedListContent = (value: string): string => {
  const lines = value.split(LIST_LINE_SEPARATOR);
  const isBulleted = lines.every(line => line.trim().length === 0 || BULLET_PATTERN.test(line));

  if (isBulleted) {
    return lines.map(line => line.replace(BULLET_PATTERN, '')).join('\n');
  }

  return lines
    .map(line => {
      const base = stripListPrefix(line).trimStart();
      return base.length > 0 ? `• ${base}` : '• ';
    })
    .join('\n');
};

const toggleNumberedListContent = (value: string): string => {
  const lines = value.split(LIST_LINE_SEPARATOR);
  const isNumbered = lines.every(line => line.trim().length === 0 || NUMBERED_PATTERN.test(line));

  if (isNumbered) {
    return lines.map(line => line.replace(NUMBERED_PATTERN, '')).join('\n');
  }

  return lines
    .map((line, index) => {
      const base = stripListPrefix(line).trimStart();
      const prefix = `${index + 1}. `;
      return base.length > 0 ? `${prefix}${base}` : prefix;
    })
    .join('\n');
};

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
  onRequestPositionPanel,
}) => {
  const textRef = useRef<HTMLDivElement | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
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

  useEffect(() => {
    if (!isEditing || typeof document === 'undefined') {
      selectionRangeRef.current = null;
      return;
    }

    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !textRef.current) {
        return;
      }

      if (textRef.current.contains(anchorNode)) {
        selectionRangeRef.current = selection.getRangeAt(0);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [isEditing]);

  const restoreSelection = useCallback(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const selection = document.getSelection();
    if (!selection || !selectionRangeRef.current) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(selectionRangeRef.current);
  }, []);

  const hasEditableSelection = useCallback(() => {
    const range = selectionRangeRef.current;
    return Boolean(range && !range.collapsed);
  }, []);

  const runCommand = useCallback(
    (command: string, value?: string) => {
      if (!canEdit || typeof document === 'undefined') {
        return false;
      }

      try {
        if (document.queryCommandSupported && !document.queryCommandSupported(command)) {
          return false;
        }
      } catch {
        // Ignore queryCommandSupported errors and attempt to run the command.
      }

      textRef.current?.focus();
      restoreSelection();

      let executed = false;

      try {
        executed = document.execCommand(command, false, value ?? undefined);
      } catch {
        executed = false;
      }

      if (executed) {
        handleInput();
      }

      return executed;
    },
    [canEdit, handleInput, restoreSelection],
  );

  const applyFontSizeToSelection = useCallback(
    (nextSize: number) => {
      if (!isEditing || typeof document === 'undefined' || !hasEditableSelection()) {
        return false;
      }

      textRef.current?.focus();
      restoreSelection();

      try {
        document.execCommand('fontSize', false, '7');
      } catch {
        return false;
      }

      const container = textRef.current;
      if (!container) {
        return false;
      }

      const targets = Array.from(container.querySelectorAll('font[size="7"]'));
      if (targets.length === 0) {
        return false;
      }

      targets.forEach(node => {
        const span = document.createElement('span');
        span.style.fontSize = `${nextSize}px`;
        span.innerHTML = node.innerHTML;
        node.replaceWith(span);
      });

      handleInput();
      return true;
    },
    [handleInput, hasEditableSelection, isEditing, restoreSelection],
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
      if (isEditing && hasEditableSelection()) {
        const commandMap: Record<'bold' | 'italic' | 'underline' | 'strikethrough', string> = {
          bold: 'bold',
          italic: 'italic',
          underline: 'underline',
          strikethrough: 'strikeThrough',
        };

        const command = commandMap[key];
        const executed = runCommand(command);

        if (executed) {
          onInteract();
          return;
        }
      }

      updateFormatting({ [key]: !localFormatting[key] } as Partial<TextBoxFormatting>);
    },
    [hasEditableSelection, isEditing, localFormatting, onInteract, runCommand, updateFormatting],
  );

  const handleAlign = useCallback(
    (align: TextBoxFormatting['align']) => {
      if (isEditing) {
        const command =
          align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft';
        runCommand(command);
      }

      updateFormatting({ align });
    },
    [isEditing, runCommand, updateFormatting],
  );

  const focusEditableSurface = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    requestAnimationFrame(() => {
      const node = textRef.current;
      if (!node) {
        return;
      }

      node.focus();

      const selection = window.getSelection();
      if (!selection) {
        return;
      }

      const range = window.document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      selectionRangeRef.current = range;
    });
  }, []);

  const applyListTransformation = useCallback(
    (transformer: (value: string) => string) => {
      const source = isEditing ? editingValue : localFormatting.text;
      const plain = htmlToPlainText(source);
      const transformed = transformer(plain);
      const nextValue = plainTextToHtml(transformed);

      if (nextValue === source) {
        return;
      }

      if (isEditing) {
        onInteract();
        if (textRef.current) {
          textRef.current.innerHTML = nextValue;
        }
        onEditingChange(nextValue);
        focusEditableSurface();
        return;
      }

      updateFormatting({ text: nextValue });
    },
    [
      editingValue,
      focusEditableSurface,
      isEditing,
      localFormatting.text,
      onEditingChange,
      onInteract,
      updateFormatting,
    ],
  );

  const handleBulletedList = useCallback(() => {
    applyListTransformation(toggleBulletedListContent);
  }, [applyListTransformation]);

  const handleNumberedList = useCallback(() => {
    applyListTransformation(toggleNumberedListContent);
  }, [applyListTransformation]);

  const handleFontFamily = useCallback(
    (fontFamily: string) => {
      if (isEditing && hasEditableSelection()) {
        const executed = runCommand('fontName', fontFamily);
        if (executed) {
          onInteract();
          return;
        }
      }

      updateFormatting({ fontFamily });
    },
    [hasEditableSelection, isEditing, onInteract, runCommand, updateFormatting],
  );

  const handleColor = useCallback(
    (color: string) => {
      if (isEditing && hasEditableSelection()) {
        const executed = runCommand('foreColor', color);
        if (executed) {
          onInteract();
          return;
        }
      }

      updateFormatting({ color });
    },
    [hasEditableSelection, isEditing, onInteract, runCommand, updateFormatting],
  );

  const handleIncreaseFontSize = useCallback(() => {
    const next = clampFontSize(localFormatting.fontSize + 2);
    if (applyFontSizeToSelection(next)) {
      onInteract();
      return;
    }

    updateFormatting({ fontSize: next });
  }, [applyFontSizeToSelection, localFormatting.fontSize, onInteract, updateFormatting]);

  const handleDecreaseFontSize = useCallback(() => {
    const next = clampFontSize(localFormatting.fontSize - 2);
    if (applyFontSizeToSelection(next)) {
      onInteract();
      return;
    }

    updateFormatting({ fontSize: next });
  }, [applyFontSizeToSelection, localFormatting.fontSize, onInteract, updateFormatting]);

  const handleApplyTextStyle = useCallback(
    (preset: TextStylePreset) => {
      const updates: Partial<TextBoxFormatting> = {
        fontSize: clampFontSize(preset.fontSize),
      };

      if (typeof preset.bold === 'boolean') {
        updates.bold = preset.bold;
      }
      if (typeof preset.italic === 'boolean') {
        updates.italic = preset.italic;
      }
      if (typeof preset.underline === 'boolean') {
        updates.underline = preset.underline;
      }
      if (typeof preset.strikethrough === 'boolean') {
        updates.strikethrough = preset.strikethrough;
      }

      updateFormatting(updates);
    },
    [updateFormatting],
  );

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

  const cssFontFamily = useMemo(
    () => resolveFontFamily(localFormatting.fontFamily),
    [localFormatting.fontFamily],
  );

  const toolbar = useMemo(
    () => (
      <TextBoxToolbar
        fontFamily={localFormatting.fontFamily}
        onFontFamilyChange={handleFontFamily}
        fontSize={localFormatting.fontSize}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        onApplyTextStyle={handleApplyTextStyle}
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
        onBulletedList={handleBulletedList}
        onNumberedList={handleNumberedList}
        color={localFormatting.color}
        onColorChange={handleColor}
        onRequestEffects={() => {}}
        onRequestAnimate={() => {}}
        onRequestPosition={() => onRequestPositionPanel?.()}
        onDelete={onDelete}
      />
    ),
    [
      handleAlign,
      handleBulletedList,
      handleColor,
      handleDecreaseFontSize,
      handleApplyTextStyle,
      handleFontFamily,
      handleNumberedList,
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
      onRequestPositionPanel,
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
        'h-full w-full overflow-hidden rounded-[22px] border border-transparent bg-transparent px-3 py-2 transition-colors',
        isEditing ? 'border-yellow-400 shadow-lg' : 'focus-within:border-yellow-400 focus-within:shadow-lg',
      )}
      onDoubleClick={handleDoubleClick}
      onPointerDown={event => {
        if (isEditing) {
          event.stopPropagation();
        }
      }}
      onContextMenu={event => {
        if (!canEdit) {
          return;
        }
        onContextMenu?.(event);
      }}
    >
      <div
        ref={textRef}
        className={cn(
          'relative h-full w-full outline-none empty:before:absolute empty:before:left-3 empty:before:top-2 empty:before:text-sm empty:before:text-muted-foreground/70 empty:before:content-[attr(data-placeholder)]',
          canEdit ? 'cursor-text' : 'cursor-default select-none',
          canEdit && (isSelected || isEditing) ? 'overflow-auto' : 'overflow-hidden',
        )}
        contentEditable={canEdit && isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        data-placeholder={DEFAULT_TEXT_BOX_TEXT}
        data-textbox-editable={canEdit && isEditing ? 'true' : undefined}
        style={{
          fontSize: `${localFormatting.fontSize}px`,
          fontFamily: cssFontFamily,
          fontWeight: localFormatting.bold ? 'bold' : 'normal',
          fontStyle: localFormatting.italic ? 'italic' : 'normal',
          textDecoration: `${localFormatting.underline ? 'underline' : ''} ${
            localFormatting.strikethrough ? 'line-through' : ''
          }`.trim(),
          textAlign: localFormatting.align,
          color: localFormatting.color,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
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
