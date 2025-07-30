import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface Props {
  user: { username: string } | null;
  profile: { avatar_url: string; bio: string } | null;
}

const UserInfo: React.FC<Props> = ({ user, profile }) => (
  <DropdownMenuItem disabled className="cursor-default">
    <div className="flex items-center space-x-2">
      <Avatar className="w-6 h-6">
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
        <AvatarFallback>
          {user?.username ? user.username.charAt(0).toUpperCase() : '?'}
        </AvatarFallback>
      </Avatar>
      <div className="text-left">
        <div className="text-sm font-medium">{user?.username}</div>
        <div className="text-xs text-gray-500">{profile?.bio || 'No bio'}</div>
      </div>
    </div>
  </DropdownMenuItem>
);

export default UserInfo;
