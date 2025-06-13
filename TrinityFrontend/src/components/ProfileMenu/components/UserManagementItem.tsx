import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

const UserManagementItem: React.FC<{ onSelect: () => void }> = ({ onSelect }) => (
  <DropdownMenuItem onSelect={onSelect}>User Management</DropdownMenuItem>
);

export default UserManagementItem;
