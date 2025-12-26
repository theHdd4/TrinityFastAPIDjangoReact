/**
 * Truncates a file name to show half the name followed by "..." only for long names
 * Small names (under 40 characters) are shown in full
 * @param fileName - The file name to truncate
 * @param maxLength - Maximum length before truncation (optional, defaults to half of fileName length for names > 40 chars)
 * @param minLengthToTruncate - Minimum length before truncation is applied (default: 40)
 * @returns Truncated file name with ellipsis if needed, or full name if short
 */
export function truncateFileName(
  fileName: string | null | undefined, 
  maxLength?: number,
  minLengthToTruncate: number = 40
): string {
  if (!fileName) return '';
  
  // For small names, don't truncate - return full name
  if (fileName.length <= minLengthToTruncate) {
    return fileName;
  }
  
  // For large names, truncate to half (or specified maxLength)
  const truncateLength = maxLength ?? Math.floor(fileName.length / 2);
  
  if (fileName.length <= truncateLength) {
    return fileName;
  }
  
  return fileName.substring(0, truncateLength) + '...';
}

