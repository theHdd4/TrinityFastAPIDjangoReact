import { FEATURE_OVERVIEW_API } from './api';

type FetchDimensionMappingOptions = {
  objectName?: string;
  signal?: AbortSignal;
};

export type DimensionMappingConfig = {
  identifiers?: string[];
  measures?: string[];
  dimensions?: Record<string, string[]>;
  file_name?: string;
  [key: string]: any;
};

export type DimensionMappingResult = {
  mapping: Record<string, string[]>;
  config?: DimensionMappingConfig | null;
  source?: string;
};

export async function fetchDimensionMapping(
  options?: FetchDimensionMappingOptions,
): Promise<DimensionMappingResult> {
  const { objectName, signal } = options ?? {};
  try {
    const envStr = localStorage.getItem('env');
    if (!envStr) {
      console.warn('dimension mapping fetch skipped: no env');
      return { mapping: {} };
    }
    const env = JSON.parse(envStr);
    const payload = {
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
      object_name: objectName || undefined,
    };
    console.log('🔄 fetching dimension mapping for', payload);
    const res = await fetch(`${FEATURE_OVERVIEW_API}/dimension_mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      signal,
    });
    if (res.status === 404) {
      return { mapping: {} };
    }
    if (res.ok) {
      const data = await res.json();
      const mapping =
        (data && typeof data === 'object' && data.mapping && typeof data.mapping === 'object'
          ? data.mapping
          : {}) || {};
      const config =
        data && typeof data === 'object' && data.config && typeof data.config === 'object'
          ? data.config
          : undefined;
      const source =
        data && typeof data === 'object' && typeof data.source === 'string'
          ? data.source
          : undefined;
      return { mapping, config, source };
    }
  } catch (err) {
    console.warn('dimension mapping fetch failed', err);
  }
  return { mapping: {} };
}
