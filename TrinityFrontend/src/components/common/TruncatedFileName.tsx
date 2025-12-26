import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { truncateFileName } from '@/utils/truncateFileName';

interface TruncatedFileNameProps {
  fileName: string | null | undefined;
  maxLength?: number;
  className?: string;
  as?: 'span' | 'p' | 'div';
  showTooltip?: boolean;
  minLengthToTruncate?: number;
}

/**
 * Component that displays a truncated file name with a tooltip showing the full name on hover
 * Small names (under 40 chars) are shown in full, large names are truncated to half + "..."
 */
export const TruncatedFileName: React.FC<TruncatedFileNameProps> = ({
  fileName,
  maxLength,
  className = '',
  as: Component = 'span',
  showTooltip = true,
  minLengthToTruncate = 40,
}) => {
  if (!fileName) return null;

  const truncated = truncateFileName(fileName, maxLength, minLengthToTruncate);
  // Only consider truncated if the original is longer than minLengthToTruncate
  const isTruncated = fileName.length > minLengthToTruncate && 
                      fileName.length > (maxLength ?? Math.floor(fileName.length / 2));

  if (!showTooltip || !isTruncated) {
    return <Component className={className}>{truncated}</Component>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Component className={`${className} cursor-help`}>{truncated}</Component>
        </TooltipTrigger>
        <TooltipContent className="max-w-md break-words">
          <p className="text-sm">{fileName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
