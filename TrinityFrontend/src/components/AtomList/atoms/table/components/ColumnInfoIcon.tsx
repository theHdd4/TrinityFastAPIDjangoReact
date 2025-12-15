import React, { useState } from 'react';
import { Info, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface ColumnMetadata {
  is_created: boolean;
  operation_type?: string;
  input_columns?: string[];
  parameters?: Record<string, any>;
  formula?: string;
  created_column_name?: string;
}

interface ColumnInfoIconProps {
  metadata: ColumnMetadata;
}

export const ColumnInfoIcon: React.FC<ColumnInfoIconProps> = ({ metadata }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Debug: Log what metadata is received
  console.log('🔍 [ColumnInfoIcon] Received metadata:', {
    metadata,
    is_created: metadata?.is_created,
    has_formula: !!metadata?.formula,
    formula: metadata?.formula
  });

  if (!metadata || !metadata.is_created || !metadata.formula) {
    console.log('❌ [ColumnInfoIcon] Not rendering - missing required data:', {
      hasMetadata: !!metadata,
      is_created: metadata?.is_created,
      hasFormula: !!metadata?.formula
    });
    return null;
  }
  
  console.log('✅ [ColumnInfoIcon] Rendering icon for column');

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDialogOpen(true);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-100 text-blue-600 hover:text-blue-700 transition-colors"
            aria-label="Column creation info"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm font-medium">Click to see how this column was created</p>
          <p className="text-xs mt-1 text-gray-600">{metadata.formula}</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              Column Creation Details
            </DialogTitle>
            <DialogDescription>
              Information about how this column was created via metric operations
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Formula */}
            <div>
              <label className="text-sm font-semibold text-gray-700">Formula:</label>
              <div className="mt-1 p-2 bg-blue-50 rounded border border-blue-200">
                <code className="text-sm text-blue-900">{metadata.formula}</code>
              </div>
            </div>

            {/* Operation Type */}
            {metadata.operation_type && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Operation Type:</label>
                <div className="mt-1">
                  <Badge variant="outline" className="text-sm">
                    {metadata.operation_type}
                  </Badge>
                </div>
              </div>
            )}

            {/* Input Columns */}
            {metadata.input_columns && metadata.input_columns.length > 0 && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Input Columns:</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {metadata.input_columns.map((col, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Parameters */}
            {metadata.parameters && Object.keys(metadata.parameters).length > 0 && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Parameters:</label>
                <div className="mt-1 p-2 bg-gray-50 rounded border">
                  <div className="space-y-1">
                    {Object.entries(metadata.parameters).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium text-gray-700">{key}:</span>{' '}
                        <span className="text-gray-600">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

