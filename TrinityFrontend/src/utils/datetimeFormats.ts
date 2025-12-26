/**
 * Comprehensive list of datetime format options for manual selection
 * Matches the 40+ formats tested in the backend detect-datetime-format endpoint
 */

export interface DateTimeFormatOption {
  value: string;
  label: string;
  example?: string;
}

export const DATETIME_FORMAT_OPTIONS: DateTimeFormatOption[] = [
  // Date-only formats with dash separator
  { value: '%Y-%m-%d', label: '%Y-%m-%d', example: '2024-12-31' },
  { value: '%d-%m-%Y', label: '%d-%m-%Y', example: '31-12-2024' },
  { value: '%m-%d-%Y', label: '%m-%d-%Y', example: '12-31-2024' },
  
  // Date-only formats with slash separator
  { value: '%Y/%m/%d', label: '%Y/%m/%d', example: '2024/12/31' },
  { value: '%d/%m/%Y', label: '%d/%m/%Y', example: '31/12/2024' },
  { value: '%m/%d/%Y', label: '%m/%d/%Y', example: '12/31/2024' },
  
  // Date-only formats with dot separator
  { value: '%Y.%m.%d', label: '%Y.%m.%d', example: '2024.12.31' },
  { value: '%d.%m.%Y', label: '%d.%m.%Y', example: '31.12.2024' },
  { value: '%m.%d.%Y', label: '%m.%d.%Y', example: '12.31.2024' },
  
  // Two-digit year formats with dash
  { value: '%d-%m-%y', label: '%d-%m-%y', example: '31-12-24' },
  { value: '%m-%d-%y', label: '%m-%d-%y', example: '12-31-24' },
  { value: '%y-%m-%d', label: '%y-%m-%d', example: '24-12-31' },
  
  // Two-digit year formats with slash
  { value: '%d/%m/%y', label: '%d/%m/%y', example: '31/12/24' },
  { value: '%m/%d/%y', label: '%m/%d/%y', example: '12/31/24' },
  { value: '%y/%m/%d', label: '%y/%m/%d', example: '24/12/31' },
  
  // Two-digit year formats with dot
  { value: '%d.%m.%y', label: '%d.%m.%y', example: '31.12.24' },
  { value: '%m.%d.%y', label: '%m.%d.%y', example: '12.31.24' },
  
  // Date with time (hours:minutes:seconds) - dash separator
  { value: '%Y-%m-%d %H:%M:%S', label: '%Y-%m-%d %H:%M:%S', example: '2024-12-31 23:59:59' },
  { value: '%d-%m-%Y %H:%M:%S', label: '%d-%m-%Y %H:%M:%S', example: '31-12-2024 23:59:59' },
  { value: '%m-%d-%Y %H:%M:%S', label: '%m-%d-%Y %H:%M:%S', example: '12-31-2024 23:59:59' },
  
  // Date with time (hours:minutes:seconds) - slash separator
  { value: '%Y/%m/%d %H:%M:%S', label: '%Y/%m/%d %H:%M:%S', example: '2024/12/31 23:59:59' },
  { value: '%d/%m/%Y %H:%M:%S', label: '%d/%m/%Y %H:%M:%S', example: '31/12/2024 23:59:59' },
  { value: '%m/%d/%Y %H:%M:%S', label: '%m/%d/%Y %H:%M:%S', example: '12/31/2024 23:59:59' },
  
  // Date with time (hours:minutes:seconds) - dot separator
  { value: '%Y.%m.%d %H:%M:%S', label: '%Y.%m.%d %H:%M:%S', example: '2024.12.31 23:59:59' },
  { value: '%d.%m.%Y %H:%M:%S', label: '%d.%m.%Y %H:%M:%S', example: '31.12.2024 23:59:59' },
  
  // Date with time (hours:minutes only) - dash separator
  { value: '%Y-%m-%d %H:%M', label: '%Y-%m-%d %H:%M', example: '2024-12-31 23:59' },
  { value: '%d-%m-%Y %H:%M', label: '%d-%m-%Y %H:%M', example: '31-12-2024 23:59' },
  { value: '%m-%d-%Y %H:%M', label: '%m-%d-%Y %H:%M', example: '12-31-2024 23:59' },
  
  // Date with time (hours:minutes only) - slash separator
  { value: '%Y/%m/%d %H:%M', label: '%Y/%m/%d %H:%M', example: '2024/12/31 23:59' },
  { value: '%d/%m/%Y %H:%M', label: '%d/%m/%Y %H:%M', example: '31/12/2024 23:59' },
  { value: '%m/%d/%Y %H:%M', label: '%m/%d/%Y %H:%M', example: '12/31/2024 23:59' },
  
  // ISO 8601 formats
  { value: '%Y-%m-%dT%H:%M:%S', label: '%Y-%m-%dT%H:%M:%S', example: '2024-12-31T23:59:59' },
  { value: '%Y-%m-%dT%H:%M:%S.%f', label: '%Y-%m-%dT%H:%M:%S.%f', example: '2024-12-31T23:59:59.123456' },
  { value: '%Y-%m-%dT%H:%M:%SZ', label: '%Y-%m-%dT%H:%M:%SZ', example: '2024-12-31T23:59:59Z' },
  { value: '%Y-%m-%dT%H:%M:%S%z', label: '%Y-%m-%dT%H:%M:%S%z', example: '2024-12-31T23:59:59+00:00' },
  { value: '%Y-%m-%dT%H:%M:%S.%f%z', label: '%Y-%m-%dT%H:%M:%S.%f%z', example: '2024-12-31T23:59:59.123456+00:00' },
  
  // Compact formats (no separators)
  { value: '%Y%m%d', label: '%Y%m%d', example: '20241231' },
  { value: '%d%m%Y', label: '%d%m%Y', example: '31122024' },
  { value: '%m%d%Y', label: '%m%d%Y', example: '12312024' },
  { value: '%Y%m%d %H%M%S', label: '%Y%m%d %H%M%S', example: '20241231 235959' },
  
  // Text-based month formats (full month names)
  { value: '%d %B %Y', label: '%d %B %Y', example: '31 December 2024' },
  { value: '%B %d, %Y', label: '%B %d, %Y', example: 'December 31, 2024' },
  { value: '%d-%B-%Y', label: '%d-%B-%Y', example: '31-December-2024' },
  { value: '%B %d %Y', label: '%B %d %Y', example: 'December 31 2024' },
  
  // Text-based month formats (abbreviated month names)
  { value: '%d %b %Y', label: '%d %b %Y', example: '31 Dec 2024' },
  { value: '%b %d, %Y', label: '%b %d, %Y', example: 'Dec 31, 2024' },
  { value: '%d-%b-%Y', label: '%d-%b-%Y', example: '31-Dec-2024' },
  { value: '%b %d %Y', label: '%b %d %Y', example: 'Dec 31 2024' },
  
  // Text formats with time
  { value: '%d %B %Y %H:%M:%S', label: '%d %B %Y %H:%M:%S', example: '31 December 2024 23:59:59' },
  { value: '%B %d, %Y %H:%M:%S', label: '%B %d, %Y %H:%M:%S', example: 'December 31, 2024 23:59:59' },
  { value: '%d %b %Y %H:%M:%S', label: '%d %b %Y %H:%M:%S', example: '31 Dec 2024 23:59:59' },
];

/**
 * Get format option by value
 */
export function getFormatOptionByValue(value: string): DateTimeFormatOption | undefined {
  return DATETIME_FORMAT_OPTIONS.find(opt => opt.value === value);
}

/**
 * Format label with example for display
 */
export function formatLabelWithExample(option: DateTimeFormatOption): string {
  if (option.example) {
    return `${option.label} (${option.example})`;
  }
  return option.label;
}
