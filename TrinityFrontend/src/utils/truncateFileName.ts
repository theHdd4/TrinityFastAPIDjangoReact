/**
 * Truncates a file name to a maximum length, showing the first part followed by "..."
 * @param fileName - The file name to truncate
 * @param maxLength - Maximum length before truncation (default: 15)
 * @returns Truncated file name with ellipsis if needed
 */
export function truncateFileName(fileName: string | null | undefined, maxLength: number = 15): string {
  if (!fileName) return '';
  
  if (fileName.length <= maxLength) {
    return fileName;
  }
  
  return fileName.substring(0, maxLength) + '...';
}
