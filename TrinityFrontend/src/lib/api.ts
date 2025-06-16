const backendOrigin =
  import.meta.env.VITE_BACKEND_ORIGIN ||
  (typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:8000');

export const ACCOUNTS_API =
  import.meta.env.VITE_ACCOUNTS_API || `${backendOrigin}/api/accounts`;

export const REGISTRY_API =
  import.meta.env.VITE_REGISTRY_API || `${backendOrigin}/api/registry`;

export const TENANTS_API =
  import.meta.env.VITE_TENANTS_API || `${backendOrigin}/api/tenants`;

export const TEXT_API =
  import.meta.env.VITE_TEXT_API || `${backendOrigin.replace(/:8000$/, ':8001')}/api/t`;

export const CARD_API =
  import.meta.env.VITE_CARD_API || `${backendOrigin.replace(/:8000$/, ':8001')}/api`;

export const SUBSCRIPTIONS_API =
  import.meta.env.VITE_SUBSCRIPTIONS_API || `${backendOrigin}/api/subscriptions`;
