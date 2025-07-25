import { FEATURE_OVERVIEW_API } from './api';

export async function fetchDimensionMapping(): Promise<Record<string, string[]>> {
  try {
    console.log('🔄 fetching dimension mapping');
    const envStr = localStorage.getItem('env');
    let projectId = 0;
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        projectId = parseInt(env.PROJECT_ID || '0', 10);
        console.log('🔍 looking up mapping for project', projectId);
      } catch (err) {
        console.warn('⚠️ env parse failed for mapping lookup', err);
      }
    }
    const payload = { project_id: projectId };
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
