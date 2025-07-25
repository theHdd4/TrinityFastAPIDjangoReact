import { FEATURE_OVERVIEW_API } from './api';

export async function fetchDimensionMapping(): Promise<Record<string, string[]>> {
  try {
    console.log('🔄 fetching dimension mapping');
    const envStr = localStorage.getItem('env');
    let client = '';
    let app = '';
    let project = '';
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        client = env.CLIENT_NAME || '';
        app = env.APP_NAME || '';
        project = env.PROJECT_NAME || '';
        const key = `${client}/${app}/${project}/column_classifier_config`;
        console.log('🔍 looking up mapping with key', key);
      } catch (err) {
        console.warn('⚠️ env parse failed for mapping lookup', err);
      }
    }
    const payload = { client_name: client, app_name: app, project_name: project };
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
