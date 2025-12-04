import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotificationMenu: React.FC = () => (
  <Button variant="ghost" size="sm" className="p-2">
    <Bell className="w-5 h-5 text-gray-600" />
  </Button>
);

export default NotificationMenu;
