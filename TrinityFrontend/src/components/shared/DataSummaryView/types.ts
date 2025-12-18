/**
 * TypeScript interfaces for DataSummaryView component
 */

export interface ColumnMetadata {
  is_created: boolean;
  operation_type?: string;
  input_columns?: string[];
  parameters?: Record<string, any>;
  formula?: string;
  created_column_name?: string;
}

export interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
  metadata?: ColumnMetadata;
}

export interface DataSummaryResponse {
  status: string;
  cardinality: ColumnInfo[];
  metadata_available?: boolean;
  total_columns?: number;
  derived_columns?: number;
  error?: string;
}

export interface DataSummaryViewProps {
  objectName: string;
  atomId?: string;
  
  // Styling (atom-specific)
  borderColor?: string;
  
  // Features
  includeMetadata?: boolean;
  showSettings?: boolean;
  
  // Custom header
  title?: string;
  subtitle?: string;
  subtitleClickable?: boolean;
  onSubtitleClick?: () => void;
  controls?: React.ReactNode;
  
  // Table state
  defaultMinimized?: boolean;
}