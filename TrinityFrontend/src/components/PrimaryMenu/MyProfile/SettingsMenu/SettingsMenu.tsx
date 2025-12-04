import React from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import WorkspacePreferences from './components/WorkspacePreferences';
import Integrations from './components/Integrations';
import ApiKeys from './components/ApiKeys';
import PrivacySecurity from './components/PrivacySecurity';

const SettingsMenu: React.FC = () => (
  <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="p-2">
          <Settings className="w-5 h-5 text-gray-600" />
        </Button>
      </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <WorkspacePreferences />
      <Integrations />
      <ApiKeys />
      <PrivacySecurity />
    </DropdownMenuContent>
  </DropdownMenu>
);

export default SettingsMenu;
