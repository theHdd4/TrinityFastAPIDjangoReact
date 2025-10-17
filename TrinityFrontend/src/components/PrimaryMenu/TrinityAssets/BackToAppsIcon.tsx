import React from 'react';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackToAppsIconProps {
  className?: string;
}

const BackToAppsIcon: React.FC<BackToAppsIconProps> = ({ className }) => (
  <LogOut
    className={cn('w-4 h-4 text-black', className)}
    style={{ transform: 'scaleX(-1)' }}
  />
);

export default BackToAppsIcon;
