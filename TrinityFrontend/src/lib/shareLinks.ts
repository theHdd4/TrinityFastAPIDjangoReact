import { SHARE_LINKS_API } from '@/lib/api';

interface CreateExhibitionShareLinkPayload {
  client_name: string;
  app_name: string;
  project_name: string;
  expires_in?: number | null;
}

export interface ExhibitionShareLinkResponse {
  token: string;
  share_url: string;
  expires_at: string | null;
}

export async function createExhibitionShareLink(
  payload: CreateExhibitionShareLinkPayload,
): Promise<ExhibitionShareLinkResponse> {
  const response = await fetch(`${SHARE_LINKS_API}/exhibition/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = 'Unable to create exhibition share link';
    try {
      const data = await response.json();
      detail = typeof data?.detail === 'string' ? data.detail : detail;
    } catch {
      const text = await response.text();
      if (text) {
        detail = text;
      }
    }
    throw new Error(detail);
  }

  const data = (await response.json()) as ExhibitionShareLinkResponse;
  return data;
}

interface CreateDashboardShareLinkPayload {
  client_name: string;
  app_name: string;
  project_name: string;
  expires_in?: number | null;
}

export interface DashboardShareLinkResponse {
  token: string;
  share_url: string;
  expires_at: string | null;
}

export async function createDashboardShareLink(
  payload: CreateDashboardShareLinkPayload,
): Promise<DashboardShareLinkResponse> {
  const response = await fetch(`${SHARE_LINKS_API}/dashboard/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = 'Unable to create dashboard share link';
    try {
      const data = await response.json();
      detail = typeof data?.detail === 'string' ? data.detail : detail;
    } catch {
      const text = await response.text();
      if (text) {
        detail = text;
      }
    }
    throw new Error(detail);
  }

  const data = (await response.json()) as DashboardShareLinkResponse;
  return data;
}