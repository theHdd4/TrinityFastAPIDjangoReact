export const ACCOUNTS_API =
  import.meta.env.VITE_ACCOUNTS_API || 'http://localhost:8000/api/accounts';

export const REGISTRY_API =
  import.meta.env.VITE_REGISTRY_API || 'http://localhost:8000/api/registry';

export const TENANTS_API =
  import.meta.env.VITE_TENANTS_API || 'http://localhost:8000/api/tenants';

export const TEXT_API =
  import.meta.env.VITE_TEXT_API || 'http://localhost:8001/api/t';

export const CARD_API =
  import.meta.env.VITE_CARD_API || 'http://localhost:8001/api';

export const SUBSCRIPTIONS_API =
  import.meta.env.VITE_SUBSCRIPTIONS_API ||
  'http://localhost:8000/api/subscriptions';
