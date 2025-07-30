import { FEATURE_OVERVIEW_API } from './api';

export async function fetchDimensionMapping(): Promise<Record<string, string[]>> {
  try {
    const saved = localStorage.getItem('current-project');
    const projectId = saved ? JSON.parse(saved).id : '';
    console.log('🔄 fetching dimension mapping for project', projectId);
    const res = await fetch(
      `${FEATURE_OVERVIEW_API}/dimension_mapping?project_id=${projectId}`,
      { credentials: 'include' }
    );
    if (res.ok) {
      const data = await res.json();
      return data.mapping || {};
    }
  } catch (err) {
    console.warn('dimension mapping fetch failed', err);
  }
  return {};
}
