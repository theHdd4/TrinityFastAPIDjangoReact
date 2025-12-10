import { DASHBOARD_API } from '@/lib/api';

export interface DashboardLayoutResponse {
  client_name: string;
  app_name: string;
  project_name: string;
  cards: any[];
  updated_at?: string;
}

const logDashboardRequest = (action: string, url: string, init: RequestInit) => {
  if (typeof window === 'undefined') return;

  const { method = 'GET', credentials } = init;
  const hasBody = Boolean(init.body);

  console.info(`[Dashboard API] ${action}`, {
    url,
    method,
    credentials,
    hasBody,
    origin: window.location.origin,
  });
};

const logDashboardFailure = (action: string, error: unknown) => {
  if (typeof window === 'undefined') return;
  console.error(`[Dashboard API] ${action} failed`, error);
};

export async function fetchSharedDashboardLayout(
  token: string,
): Promise<DashboardLayoutResponse | null> {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const requestUrl = `${DASHBOARD_API}/shared/${encodeURIComponent(trimmed)}`;
  const requestInit: RequestInit = {
    method: 'GET',
    credentials: 'omit',
  };

  logDashboardRequest('Fetching shared dashboard layout', requestUrl, requestInit);

  const response = await fetch(requestUrl, requestInit);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    logDashboardFailure('Fetching shared dashboard layout', message);
    throw new Error(message || 'Failed to fetch shared dashboard layout');
  }

  return response.json() as Promise<DashboardLayoutResponse>;
}




