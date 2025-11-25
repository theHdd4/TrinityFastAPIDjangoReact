import React, { useEffect, useRef } from 'react';
import { CardTextBoxData, CardTextBoxSettings } from './types';

interface CardTextBoxCanvasProps {
  data: CardTextBoxData;
  settings: CardTextBoxSettings;
  onTextChange: (data: CardTextBoxData) => void;
}

const CardTextBoxCanvas: React.FC<CardTextBoxCanvasProps> = ({ data, settings, onTextChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== data.html) {
      editorRef.current.innerHTML = data.html;
    }
  }, [data.html]);

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText;
    onTextChange({ text, html });
  };

  const getListStyle = () => {
    if (settings.listType === 'bullet') return 'list-disc pl-8';
    if (settings.listType === 'number') return 'list-decimal pl-8';
    return '';
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-background/40 rounded-lg border border-dashed border-border">
      <div className="w-full">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          suppressContentEditableWarning
          className={`
            w-full min-h-[180px] p-4 
            border-2 border-dashed border-border rounded-lg
            focus:outline-none focus:border-primary
            transition-colors duration-200
            bg-white shadow-sm text-sm
            ${getListStyle()}
          `}
          style={{
            fontFamily: settings.fontFamily,
            fontSize: `${settings.fontSize}px`,
            fontWeight: settings.bold ? 'bold' : 'normal',
            fontStyle: settings.italic ? 'italic' : 'normal',
            textDecoration: `${settings.underline ? 'underline' : ''} ${settings.strikethrough ? 'line-through' : ''}`.trim(),
            textAlign: settings.textAlign,
            color: settings.textColor,
            backgroundColor: settings.backgroundColor,
          }}
        />

        <div className="mt-3 text-xs text-muted-foreground text-center">
          Click to edit text. Use the controls on the right to format it.
        </div>
      </div>
    </div>
  );
};

export default CardTextBoxCanvas;
