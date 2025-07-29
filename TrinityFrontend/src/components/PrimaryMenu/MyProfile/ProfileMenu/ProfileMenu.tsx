import React from 'react';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import UserInfo from './components/UserInfo';
import UserManagementItem from './components/UserManagementItem';
import ClientManagementItem from './components/ClientManagementItem';
import BillingPlansItem from './components/BillingPlansItem';
import ProfileInformationItem from './components/ProfileInformationItem';

const ProfileMenu: React.FC = () => {
  const { logout, user, profile } = useAuth();
  const canManage =
    user?.role === 'admin' ||
    user?.role === 'architect' ||
    user?.is_staff;
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="p-2">
          <User className="w-4 h-4 text-gray-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <UserInfo user={user} profile={profile} />
        <ProfileInformationItem />
        <UserManagementItem
          onSelect={() => navigate('/users')}
          disabled={!canManage}
        />
        <ClientManagementItem
          onSelect={() => navigate('/clients')}
          disabled={!canManage}
        />
        <BillingPlansItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout}>Sign Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProfileMenu;
