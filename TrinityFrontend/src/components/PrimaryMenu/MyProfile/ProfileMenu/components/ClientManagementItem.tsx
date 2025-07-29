import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface Props {
  onSelect?: () => void;
  disabled?: boolean;
}

const ClientManagementItem: React.FC<Props> = ({ onSelect, disabled }) => (
  <DropdownMenuItem onSelect={onSelect} disabled={disabled}>
    Client Management
  </DropdownMenuItem>
);

export default ClientManagementItem;
