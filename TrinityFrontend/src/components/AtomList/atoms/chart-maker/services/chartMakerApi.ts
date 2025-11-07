import { CHART_MAKER_API } from '@/lib/api';

export interface UploadCSVResponse {
  file_id: string;
  columns: string[];
  numeric_columns: string[];
  categorical_columns: string[];
  unique_values: Record<string, string[]>;
  sample_data: Record<string, any>[];
  row_count: number;
}

export interface ColumnResponse {
  numeric_columns: string[];
  categorical_columns: string[];
}

export interface AllColumnsResponse {
  columns: string[];
}

export interface UniqueValuesResponse {
  values: Record<string, string[]>;
}

export interface FilterResponse {
  filtered_data: Record<string, any>[];
}

export interface ChartTrace {
  x_column: string;
  y_column: string;
  name?: string;
  chart_type?: "line" | "bar" | "area" | "pie" | "scatter";
  aggregation?: "sum" | "mean" | "count" | "min" | "max";
  color?: string;
  filters?: Record<string, string[]>;  // Trace-specific filters
  legend_field?: string;  // Field to segregate values by (like channel, region, etc.)
}

export interface ChartRequest {
  file_id: string;
  chart_type: "line" | "bar" | "area" | "pie" | "scatter";
  traces: ChartTrace[];
  title?: string;
  filters?: Record<string, string[]>;
  filtered_data?: Record<string, any>[];
}

export interface RechartsConfig {
  chart_type: string;
  data: Record<string, any>[];
  traces: any[];
  title?: string;
  x_axis?: any;
  y_axis?: any;
  legend?: any;
  tooltip?: any;
  responsive?: any;
}

export interface ChartResponse {
  chart_id: string;
  chart_config: RechartsConfig;
  data_summary: Record<string, any>;
}

class ChartMakerApiService {
  private baseUrl = CHART_MAKER_API;

  constructor() {
  }

  async uploadFile(file: File): Promise<UploadCSVResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload-csv`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to upload file');
    }

    return response.json();
  }

  async uploadCSV(file: File): Promise<UploadCSVResponse> {
    // For backward compatibility
    return this.uploadFile(file);
  }

  async uploadArrow(file: File): Promise<UploadCSVResponse> {
    // For explicit Arrow uploads
    return this.uploadFile(file);
  }

  async loadSavedDataframe(objectName: string): Promise<UploadCSVResponse> {
    // Direct API call to load saved dataframe without download/upload cycle
    const response = await fetch(`${this.baseUrl}/load-saved-dataframe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ object_name: objectName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load saved dataframe');
    }

    return response.json();
  }

  async getAllColumns(fileId: string): Promise<AllColumnsResponse> {
    const response = await fetch(`${this.baseUrl}/get-all-columns/${fileId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get all columns');
    }

    return response.json();
  }

  async getColumns(fileId: string): Promise<ColumnResponse> {
    const response = await fetch(`${this.baseUrl}/columns/${fileId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get columns');
    }

    return response.json();
  }

  async getUniqueValues(fileId: string, columns: string[]): Promise<UniqueValuesResponse> {
    const response = await fetch(`${this.baseUrl}/unique-values/${fileId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(columns),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get unique values');
    }

    const result = await response.json();
    return result;
  }

  async filterData(fileId: string, filters: Record<string, string[]>): Promise<FilterResponse> {
    const response = await fetch(`${this.baseUrl}/filter-data/${fileId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(filters),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to filter data');
    }

    return response.json();
  }

  async getSampleData(fileId: string, n: number = 10): Promise<{ sample_data: Record<string, any>[] }> {
    const response = await fetch(`${this.baseUrl}/sample-data/${fileId}?n=${n}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get sample data');
    }

    return response.json();
  }

  async generateChart(request: ChartRequest): Promise<ChartResponse> {
    const response = await fetch(`${this.baseUrl}/charts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to generate chart');
    }

    return response.json();
  }
}

export const chartMakerApi = new ChartMakerApiService();