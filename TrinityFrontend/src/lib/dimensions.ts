import { FEATURE_OVERVIEW_API } from './api';

export async function fetchDimensionMapping(): Promise<Record<string, string[]>> {
  try {
    console.log('🔄 fetching dimension mapping');
    const envStr = localStorage.getItem('env');
    let payload = { client_name: '', app_name: '', project_name: '' };
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        payload = {
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || ''
        };
        console.log('🔍 looking up mapping for', payload);
      } catch (err) {
        console.warn('⚠️ env parse failed for mapping lookup', err);
      }
    }
    console.log('📦 calling dimension_mapping with', payload);
    const res = await fetch(`${FEATURE_OVERVIEW_API}/dimension_mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.config) {
        try {
          localStorage.setItem('column-classifier-config', JSON.stringify(data.config));
        } catch {
          /* ignore */
        }
      }
      return data.mapping || {};
    }
  } catch (err) {
    console.warn('dimension mapping fetch failed', err);
  }
  return {};
}
