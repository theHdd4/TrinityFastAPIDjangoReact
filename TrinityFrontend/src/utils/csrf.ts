/**
 * Get CSRF token from cookie
 * Django sets the csrftoken cookie automatically
 */
export const getCsrfToken = (): string | null => {
  const name = 'csrftoken';
  let cookieValue: string | null = null;
  
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      // Does this cookie string begin with the name we want?
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  
  return cookieValue;
};

/**
 * Get headers with CSRF token for fetch requests
 */
export const getCsrfHeaders = (additionalHeaders: Record<string, string> = {}): HeadersInit => {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    ...additionalHeaders
  };
  
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }
  
  return headers;
};

