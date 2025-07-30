import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface Props {
  onSelect?: () => void;
  disabled?: boolean;
}

const UserManagementItem: React.FC<Props> = ({ onSelect, disabled }) => (
  <DropdownMenuItem onSelect={onSelect} disabled={disabled}>
    User Management
  </DropdownMenuItem>
);

export default UserManagementItem;
