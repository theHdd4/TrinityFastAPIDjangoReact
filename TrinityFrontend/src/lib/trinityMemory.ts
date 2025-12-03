export interface MemoryChatMessage {
  [key: string]: any;
}

export interface MemoryChatRecord {
  chat_id: string;
  messages: MemoryChatMessage[];
  metadata: Record<string, any>;
  total_messages: number;
  updated_at: string;
  truncated?: boolean;
  history_summary?: string;
}

export interface MemoryChatResponse {
  chatId: string;
  messages: MemoryChatMessage[];
  metadata: Record<string, any>;
  totalMessages: number;
  updatedAt: string;
  truncated?: boolean;
  historySummary?: string;
}

const defaultHeaders: HeadersInit = {
  'Content-Type': 'application/json',
};

const buildUrl = (baseUrl: string, path: string, params?: Record<string, string>) => {
  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  let url = `${normalized}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    const query = searchParams.toString();
    if (query) url += `?${query}`;
  }
  return url;
};

const getProjectContext = (): { client?: string; app?: string; project?: string } => {
  const resolveEnvValue = (env: Record<string, any> | null | undefined) => {
    if (!env) return {};
    return {
      client: env.CLIENT_NAME || env.client_name || env.client || undefined,
      app: env.APP_NAME || env.app_name || env.app || undefined,
      project: env.PROJECT_NAME || env.project_name || env.project || undefined,
    };
  };

  try {
    const envStr = typeof window !== 'undefined' ? localStorage.getItem('env') : null;
    if (envStr) {
      return resolveEnvValue(JSON.parse(envStr));
    }
  } catch (e) {
    console.warn('Failed to parse env context from localStorage:', e);
  }

  try {
    const projectStr = typeof window !== 'undefined' ? localStorage.getItem('current-project') : null;
    if (projectStr) {
      return resolveEnvValue(JSON.parse(projectStr));
    }
  } catch (e) {
    console.warn('Failed to parse current-project context from localStorage:', e);
  }

  return {};
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || response.statusText);
  }
  return response.json() as Promise<T>;
};

const safeFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
};

export const listMemoryChats = async (baseUrl: string): Promise<MemoryChatResponse[]> => {
  try {
    const context = getProjectContext();
    // CRITICAL: Request all messages (use a high limit to get full chat history)
    // Default message_limit is only 8, which causes chats to appear truncated
    const url = buildUrl(baseUrl, '/memory/chats', {
      client: context.client || '',
      app: context.app || '',
      project: context.project || '',
      include_messages: 'true',
      message_limit: '1000', // Request up to 1000 messages per chat to avoid truncation
    });
    const data = await handleResponse<{ chats: MemoryChatRecord[] }>(await safeFetch(url));
    return (data.chats || []).map((chat) => ({
      chatId: chat.chat_id,
      messages: chat.messages || [],
      metadata: chat.metadata || {},
      totalMessages: chat.total_messages ?? 0,
      updatedAt: chat.updated_at,
      truncated: chat.truncated,
      historySummary: chat.history_summary,
    }));
  } catch (error) {
    console.warn('Memory service unavailable, returning empty list:', error);
    return [];
  }
};

export const fetchMemoryChat = async (
  baseUrl: string,
  chatId: string,
  params?: { offset?: number; limit?: number }
): Promise<MemoryChatResponse> => {
  const searchParams = new URLSearchParams();
  if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  const url = buildUrl(baseUrl, `/memory/chats/${encodeURIComponent(chatId)}${query ? `?${query}` : ''}`);
  const chat = await handleResponse<{
    chat_id: string;
    messages: MemoryChatMessage[];
    metadata: Record<string, any>;
    total_messages: number;
    updated_at: string;
    truncated?: boolean;
  }>(await fetch(url));
  return {
    chatId: chat.chat_id,
    messages: chat.messages || [],
    metadata: chat.metadata || {},
    totalMessages: chat.total_messages ?? 0,
    updatedAt: chat.updated_at,
    truncated: chat.truncated,
  };
};

export const saveMemoryChat = async (
  baseUrl: string,
  chatId: string,
  payload: {
    messages?: MemoryChatMessage[];
    metadata?: Record<string, any>;
    append?: boolean;
    retainLast?: number | null;
  }
): Promise<MemoryChatResponse | null> => {
  try {
    const body = {
      messages: payload.messages ?? [],
      metadata: payload.metadata ?? {},
      append: Boolean(payload.append),
      retain_last: payload.retainLast ?? undefined,
    };

    const context = getProjectContext();
    const url = buildUrl(baseUrl, `/memory/chats/${encodeURIComponent(chatId)}`, {
      client: context.client || '',
      app: context.app || '',
      project: context.project || '',
    });
    const chat = await handleResponse<MemoryChatRecord>(
      await safeFetch(url, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(body),
      })
    );

    return {
      chatId: chat.chat_id,
      messages: chat.messages || [],
      metadata: chat.metadata || {},
      totalMessages: chat.total_messages ?? 0,
      updatedAt: chat.updated_at,
      truncated: chat.truncated,
    };
  } catch (error) {
    console.warn('Failed to save chat to memory service:', error);
    return null;
  }
};

export const deleteMemoryChat = async (baseUrl: string, chatId: string): Promise<void> => {
  const context = getProjectContext();
  const url = buildUrl(baseUrl, `/memory/chats/${encodeURIComponent(chatId)}`, {
    client: context.client || '',
    app: context.app || '',
    project: context.project || '',
  });
  const response = await safeFetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || `Failed to delete chat: ${response.status} ${response.statusText}`);
  }
};

export const deleteAllMemoryChats = async (baseUrl: string): Promise<{ deleted_count: number }> => {
  const context = getProjectContext();
  const url = buildUrl(baseUrl, '/memory/chats', {
    client: context.client || '',
    app: context.app || '',
    project: context.project || '',
  });
  const response = await safeFetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || `Failed to delete all chats: ${response.status} ${response.statusText}`);
  }
  return handleResponse<{ deleted_count: number; message: string }>(response).then(data => ({
    deleted_count: data.deleted_count
  }));
};

export const saveMemorySession = async (
  baseUrl: string,
  sessionId: string,
  payload: { data: Record<string, any>; metadata?: Record<string, any> }
): Promise<void> => {
  const url = buildUrl(baseUrl, `/memory/sessions/${encodeURIComponent(sessionId)}`);
  await handleResponse(
    await fetch(url, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({
        data: payload.data,
        metadata: payload.metadata ?? {},
      }),
    })
  );
};

export const deleteMemorySession = async (baseUrl: string, sessionId: string): Promise<void> => {
  const url = buildUrl(baseUrl, `/memory/sessions/${encodeURIComponent(sessionId)}`);
  await fetch(url, { method: 'DELETE' });
};

