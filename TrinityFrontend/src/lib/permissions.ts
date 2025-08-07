export type AppPermission =
  | 'workflow:edit'
  | 'laboratory:edit'
  | 'exhibition:edit'
  | 'project:create';

const rolePermissions: Record<string, AppPermission[]> = {
  admin: ['workflow:edit', 'laboratory:edit', 'exhibition:edit', 'project:create'],
  editor: ['workflow:edit', 'laboratory:edit', 'exhibition:edit', 'project:create'],
  viewer: [],
};

export const hasPermission = (
  role: string | undefined,
  permission: AppPermission,
): boolean => {
  if (!role) return false;
  return (rolePermissions[role.toLowerCase()] || []).includes(permission);
};
