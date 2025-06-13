import React from 'react';
import { LogOut } from 'lucide-react';

interface BackToAppsIconProps {
  className?: string;
}

const BackToAppsIcon: React.FC<BackToAppsIconProps> = ({ className = 'w-4 h-4' }) => (
  <LogOut
    className={`${className} text-black`}
    style={{ transform: 'scaleX(-1)' }}
  />
);

export default BackToAppsIcon;
