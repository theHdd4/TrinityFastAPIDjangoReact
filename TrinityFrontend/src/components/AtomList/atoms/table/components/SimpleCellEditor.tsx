import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';

interface SimpleCellEditorProps {
  value: string;
  isEditing: boolean;
  onValueChange: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: () => void; // Add onClick prop for entering edit mode
  textAlign?: 'left' | 'center' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

const SimpleCellEditor: React.FC<SimpleCellEditorProps> = ({
  value,
  isEditing,
  onValueChange,
  onCommit,
  onCancel,
  onFocus,
  onBlur,
  onClick,
  textAlign = 'left',
  className,
  style,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCommittingRef = useRef(false); // Track if commit is in progress to prevent double commits
  
  // Focus and select text when editing starts - use useLayoutEffect for immediate focus
  useLayoutEffect(() => {
    if (isEditing && inputRef.current) {
      // Immediate focus and selection when entering edit mode
      inputRef.current.focus();
      // Select all text so user can immediately replace it (Excel-like behavior)
      inputRef.current.select();
    }
  }, [isEditing]); // Only depend on isEditing to avoid reselecting while typing
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={cn("w-full h-full text-xs outline-none border-none bg-transparent", className)}
        style={{
          padding: '2px 4px',
          margin: 0,
          textAlign,
          boxSizing: 'border-box',
          ...style,
        }}
        value={value}
        autoFocus
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onCommit(e.target.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Tab') {
            // Commit before tabbing
            onCommit(e.target.value);
            // Don't prevent default - let Tab work normally
          }
        }}
        onFocus={(e) => {
          // Select all text when input receives focus (Excel-like behavior)
          // This ensures text is selected even if useLayoutEffect didn't fire
          requestAnimationFrame(() => {
            e.target.select();
          });
          onFocus?.();
        }}
        onBlur={(e) => {
          // Prevent double commits
          if (isCommittingRef.current) {
            return;
          }
          
          // Check if focus is moving to another cell input
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (relatedTarget && relatedTarget.tagName === 'INPUT' && relatedTarget.getAttribute('type') === 'text') {
            // Focus moving to another input, don't commit yet
            return;
          }
          
          // Commit immediately without delay to prevent race conditions
          isCommittingRef.current = true;
          const valueToCommit = e.target.value;
          
          // Use requestAnimationFrame to ensure blur completes, but without delay
          requestAnimationFrame(() => {
            onCommit(valueToCommit);
            onBlur?.();
            // Reset commit flag after a brief delay to allow state updates
            setTimeout(() => {
              isCommittingRef.current = false;
            }, 50);
          });
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  
  // Display mode
  return (
    <div
      className={cn("text-xs overflow-hidden flex items-center cursor-pointer", className)}
      style={{
        padding: '2px 4px',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        justifyContent: textAlign === 'left' ? 'flex-start' : 
                      textAlign === 'center' ? 'center' : 'flex-end',
        ...style,
      }}
      title={value || ''}
      onClick={(e) => {
        // Call onClick handler to enter edit mode
        if (onClick) {
          e.stopPropagation(); // Prevent bubbling to avoid double-calling
          onClick();
        }
      }}
    >
      {value || ''}
    </div>
  );
};

export default SimpleCellEditor;

