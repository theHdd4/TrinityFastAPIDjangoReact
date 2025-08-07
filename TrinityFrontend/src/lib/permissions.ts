export type AppPermission =
  | 'workflow:edit'
  | 'laboratory:edit'
  | 'exhibition:edit';

const rolePermissions: Record<string, AppPermission[]> = {
  admin: ['workflow:edit', 'laboratory:edit', 'exhibition:edit'],
  editor: ['workflow:edit', 'laboratory:edit', 'exhibition:edit'],
  viewer: [],
};

export const hasPermission = (
  role: string | undefined,
  permission: AppPermission,
): boolean => {
  if (!role) return false;
  return (rolePermissions[role.toLowerCase()] || []).includes(permission);
};
