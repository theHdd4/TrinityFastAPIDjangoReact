import React, { useEffect, useRef } from 'react';
import DataUploadAtom from '@/components/AtomList/atoms/data-upload/DataUploadAtom';

interface EmptyStateCardProps {
  cardId: string;
  atomId: string;
}

/**
 * EmptyStateCard - Wrapper around DataUploadAtom for scenario 1 (no files uploaded).
 * Reuses all functionality from DataUploadAtom but overrides the text:
 * - "To begin your analysis, drag and drop files or click to upload" 
 * - "csv or excel"
 */
export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  atomId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateText = () => {
      if (!containerRef.current) return;

      // Find all paragraph elements that might contain the text
      const paragraphs = containerRef.current.querySelectorAll('p');
      
      paragraphs.forEach((p) => {
        const text = p.textContent || '';
        
        // Normal mode: Update main instruction text
        if (text.includes('Drag and drop files or click to upload') && !text.includes('To begin your analysis')) {
          p.textContent = 'To begin your analysis, drag and drop files or click to upload';
        }
        
        // Normal mode: Update secondary text
        if (text.includes('Upload CSV or Excel files directly')) {
          p.textContent = 'csv or excel';
        }
        
        // Guided mode: Update main instruction
        if (text.trim() === 'Drag and drop files') {
          p.textContent = 'To begin your analysis, drag and drop files or click to upload';
        }
        
        // Guided mode: Update secondary text
        if (text.trim() === 'or click to browse') {
          p.textContent = 'csv or excel';
        }
      });
    };

    // Use MutationObserver to catch dynamically rendered content
    const observer = new MutationObserver(() => {
      updateText();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      
      // Initial updates with delays to catch async renders
      const timeouts = [
        setTimeout(updateText, 50),
        setTimeout(updateText, 200),
        setTimeout(updateText, 500),
        setTimeout(updateText, 1000),
      ];

      return () => {
        observer.disconnect();
        timeouts.forEach(clearTimeout);
      };
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <DataUploadAtom atomId={atomId} />
    </div>
  );
};
