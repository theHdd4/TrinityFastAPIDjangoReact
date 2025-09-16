import { FEATURE_OVERVIEW_API } from './api';

export async function fetchDimensionMapping(
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  try {
    const envStr = localStorage.getItem('env');
    if (!envStr) {
      console.warn('dimension mapping fetch skipped: no env');
      return {};
    }
    const env = JSON.parse(envStr);
    const payload = {
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
    };
    console.log('🔄 fetching dimension mapping for', payload);
    const res = await fetch(`${FEATURE_OVERVIEW_API}/dimension_mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      return data.mapping || {};
    }
  } catch (err) {
    console.warn('dimension mapping fetch failed', err);
  }
  return {};
}
