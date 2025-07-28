import { SESSION_API } from './api';

function buildSession(userId: number | string | null | undefined) {
  const envStr = localStorage.getItem('env');
  if (!envStr || userId === null || userId === undefined) return null;
  try {
    const env = JSON.parse(envStr);
    const sessionId = `session:${env.CLIENT_ID}:${userId}:${env.APP_ID}:${env.PROJECT_ID}`;
    const namespace = `${env.CLIENT_NAME}/${env.APP_NAME}/${env.PROJECT_NAME}`;
    return { sessionId, namespace };
  } catch {
    return null;
  }
}

export async function updateSessionState(
  userId: number | string | null | undefined,
  updates: Record<string, any>
) {
  const session = buildSession(userId);
  if (!session) {
    console.warn('No env or user id for session state update');
    return;
  }
  for (const [key, value] of Object.entries(updates)) {
    try {
      await fetch(`${SESSION_API}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_id: session.sessionId, key, value }),
      });
    } catch (err) {
      console.warn('session state update error', err);
    }
  }
}

export async function logSessionState(userId: number | string | null | undefined) {
  const session = buildSession(userId);
  if (!session) {
    console.warn('No env or user id for session state log');
    return;
  }
  try {
    const res = await fetch(
      `${SESSION_API}/state?session_id=${encodeURIComponent(session.sessionId)}`,
      { credentials: 'include' }
    );
    if (res.ok) {
      const data = await res.json();
      console.log('\uD83D\uDD11 redis namespace', session.namespace);
      console.log('\uD83C\uDF10 session id', session.sessionId);
      console.log('\uD83D\uDCCA session state', data.state);
    } else {
      console.warn('\u26A0\uFE0F failed to fetch session state', res.status);
    }
  } catch (err) {
    console.warn('session state retrieval error', err);
  }
}
