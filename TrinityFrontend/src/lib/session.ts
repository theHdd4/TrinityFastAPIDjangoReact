import { SESSION_API } from './api';

export async function logSessionState(userId: number | string | null | undefined) {
  const envStr = localStorage.getItem('env');
  if (!envStr || userId === null || userId === undefined) {
    console.warn('No env or user id for session state log');
    return;
  }
  try {
    const env = JSON.parse(envStr);
    const sessionId = `session:${env.CLIENT_ID}:${userId}:${env.APP_ID}:${env.PROJECT_ID}`;
    const namespace = `${env.CLIENT_NAME}/${env.APP_NAME}/${env.PROJECT_NAME}`;
    const res = await fetch(
      `${SESSION_API}/state?session_id=${encodeURIComponent(sessionId)}`,
      { credentials: 'include' }
    );
    if (res.ok) {
      const data = await res.json();
      console.log('\uD83D\uDD11 redis namespace', namespace);
      console.log('\uD83D\uDCCA session state', data.state);
    } else {
      console.warn('\u26A0\uFE0F failed to fetch session state', res.status);
    }
  } catch (err) {
    console.warn('session state retrieval error', err);
  }
}
