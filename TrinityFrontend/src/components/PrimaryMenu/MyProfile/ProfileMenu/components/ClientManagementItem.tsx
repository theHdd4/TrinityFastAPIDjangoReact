import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

const ClientManagementItem: React.FC<{ onSelect: () => void }> = ({ onSelect }) => (
  <DropdownMenuItem onSelect={onSelect}>Client Management</DropdownMenuItem>
);

export default ClientManagementItem;
