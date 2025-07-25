import { FEATURE_OVERVIEW_API } from './api';

export async function fetchDimensionMapping(): Promise<Record<string, string[]>> {
  try {
    console.log('🔄 fetching dimension mapping');
    const envStr = localStorage.getItem('env');
    let projectId: number | null = null;
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        const key = `${env.CLIENT_NAME || ''}/${env.APP_NAME || ''}/${env.PROJECT_NAME || ''}/column_classifier_config`;
        console.log('🔍 looking up mapping with key', key);
        projectId = env.PROJECT_ID ? parseInt(env.PROJECT_ID, 10) : null;
      } catch (err) {
        console.warn('⚠️ env parse failed for mapping lookup', err);
      }
    }
    const res = await fetch(`${FEATURE_OVERVIEW_API}/dimension_mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ project_id: projectId })
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
