import React from 'react';
import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

import './TrinityAIIcon.css';

export interface TrinityAIIconProps extends React.ComponentProps<'span'> {
  iconClassName?: string;
}

const TrinityAIIcon: React.FC<TrinityAIIconProps> = ({ className, iconClassName, ...props }) => {
  return (
    <span
      className={cn(
        'trinity-ai-icon h-4 w-4 text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.55)]',
        className
      )}
      aria-hidden="true"
      {...props}
    >
      <Sparkles className={cn('trinity-ai-icon__sparkles h-full w-full', iconClassName)} />
    </span>
  );
};

export default TrinityAIIcon;
