import { CORRELATION_API } from '@/lib/api';

export interface IdentifierFilter {
  column: string;
  values: string[];
}

export interface MeasureFilter {
  column: string;
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
  value?: number;
  min_value?: number;
  max_value?: number;
}

export interface FilterPayload {
  file_path: string;
  identifier_columns?: string[];
  measure_columns?: string[];
  identifier_filters?: IdentifierFilter[];
  measure_filters?: MeasureFilter[];
  limit?: number;
}

export interface FilterAndCorrelateRequest {
  file_path: string;
  identifier_columns?: string[];
  measure_columns?: string[];
  identifier_filters?: IdentifierFilter[];
  measure_filters?: MeasureFilter[];
  method: 'pearson' | 'spearman' | 'phi_coefficient' | 'cramers_v';
  columns?: string[];
  save_filtered?: boolean;
  include_preview?: boolean;
  preview_limit?: number;
  include_date_analysis?: boolean;
  date_column?: string;
  date_range_filter?: {
    start: string;
    end: string;
  };
}

export interface DateColumnInfo {
  column_name: string;
  min_date?: string;
  max_date?: string;
  format_detected: string;
  granularity: string;
  sample_values: string[];
  is_valid_date: boolean;
}

export interface DateAnalysisResponse {
  has_date_data: boolean;
  date_columns: DateColumnInfo[];
  overall_date_range?: {
    min_date: string;
    max_date: string;
  };
  recommended_granularity: string;
  date_format_detected: string;
}

export interface CorrelationResults {
  original_rows: number;
  filtered_rows: number;
  columns_used: string[];
  filters_applied: any;
  filtered_file_path?: string;
  correlation_method: string;
  correlation_results: any;
  correlation_file_path: string;
  preview_data?: any[];
  date_analysis?: DateAnalysisResponse;
  date_filtered_rows?: number;
  timestamp: string;
  processing_time_ms: number;
}

export interface BucketCheckResponse {
  exists: boolean;
  bucket_name: string;
  object_path: string;
  message: string;
}

export interface ColumnInfo {
  column: string;
  dtype: string;
  unique_count: number;
  null_count: number;
  sample_values: any[];
}

export interface DataPreview {
  file_path: string;
  shape: [number, number];
  columns: ColumnInfo[];
  preview: any[];
}

export class CorrelationAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = CORRELATION_API;
    console.log('🔗 CorrelationAPI initialized with base URL:', this.baseUrl);
  }

  async ping(): Promise<{ msg: string }> {
    const response = await fetch(`${this.baseUrl}/ping`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async checkFile(filePath: string): Promise<BucketCheckResponse> {
    const response = await fetch(`${this.baseUrl}/check-file/${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getColumns(validatorAtomId: string): Promise<{ identifiers: string[]; measures: string[] }> {
    const response = await fetch(`${this.baseUrl}/columns/${validatorAtomId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async filterData(payload: FilterPayload): Promise<any> {
    const response = await fetch(`${this.baseUrl}/filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async filterAndCorrelate(request: FilterAndCorrelateRequest): Promise<CorrelationResults> {
    const response = await fetch(`${this.baseUrl}/filter-and-correlate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getBuckets(): Promise<{ buckets: Array<{ name: string; creation_date: string }> }> {
    const response = await fetch(`${this.baseUrl}/buckets`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getBucketObjects(
    bucketName: string, 
    prefix = '', 
    limit = 100
  ): Promise<{ bucket: string; prefix: string; count: number; objects: any[] }> {
    const params = new URLSearchParams();
    if (prefix) params.append('prefix', prefix);
    if (limit !== 100) params.append('limit', limit.toString());
    
    const url = `${this.baseUrl}/bucket/${bucketName}/objects${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getColumnValues(
    filePath: string, 
    column: string, 
    limit = 100
  ): Promise<{ file_path: string; column: string; unique_values: any[]; count: number }> {
    const params = new URLSearchParams();
    params.append('column', column);
    if (limit !== 100) params.append('limit', limit.toString());
    
    const url = `${this.baseUrl}/column-values/${encodeURIComponent(filePath)}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getDataPreview(filePath: string): Promise<DataPreview> {
    const response = await fetch(`${this.baseUrl}/data-preview/${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async loadDataframe(filePath: string): Promise<{
    numericColumns: string[];
    categoricalColumns: string[];
    sampleData: any[];
    totalRows: number;
    totalColumns: number;
  }> {
    const response = await fetch(`${this.baseUrl}/load-dataframe/${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      throw new Error(`Failed to load dataframe: ${response.statusText}`);
    }
    return response.json();
  }
  
  async getDataframeValidator(filePath: string): Promise<{ validatorId: string }> {
    const response = await fetch(`${this.baseUrl}/dataframe-validator/${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      throw new Error(`Failed to get validator: ${response.statusText}`);
    }
    return response.json();
  }

  async analyzeDates(filePath: string): Promise<DateAnalysisResponse> {
    const response = await fetch(`${this.baseUrl}/analyze-dates/${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      throw new Error(`Failed to analyze dates: ${response.statusText}`);
    }
    return response.json();
  }

  async getTimeSeriesAxis(filePath: string, startDate?: string, endDate?: string): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const url = `${this.baseUrl}/time-series-axis/${encodeURIComponent(filePath)}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch time series axis: ${response.statusText}`);
    }
    return response.json();
  }

  async getHighestCorrelationPair(filePath: string): Promise<any> {
    const url = `${this.baseUrl}/highest-correlation-pair/${encodeURIComponent(filePath)}`;
    console.log('🔗 Fetching highest correlation pair from URL:', url);
    console.log('🔗 Encoded file path:', encodeURIComponent(filePath));
    console.log('🔗 Original file path:', filePath);
    const response = await fetch(url);
    if (!response.ok) {
      console.error('💥 HTTP Error:', response.status, response.statusText);
      console.error('💥 Full URL that failed:', url);
      throw new Error(`Failed to fetch highest correlation pair: ${response.statusText}`);
    }
    return response.json();
  }

  async getTimeSeriesData(filePath: string, request: {
    column1: string;
    column2: string;
    start_date?: string;
    end_date?: string;
    datetime_column?: string;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/time-series-data/${encodeURIComponent(filePath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch time series data: ${response.statusText}`);
    }
    return response.json();
  }
}

// Export a singleton instance
export const correlationAPI = new CorrelationAPI();

// Helper function for error handling
export const handleAPIError = (error: any): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
};
