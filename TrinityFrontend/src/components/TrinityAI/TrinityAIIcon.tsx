import React from 'react';
import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface TrinityAIIconProps extends React.ComponentProps<'span'> {
  iconClassName?: string;
}

const TrinityAIIcon: React.FC<TrinityAIIconProps> = ({ className, iconClassName, ...props }) => {
  return (
    <span
      className={cn(
        'inline-flex h-3.5 w-3.5 items-center justify-center text-purple-500',
        className
      )}
      aria-hidden="true"
      {...props}
    >
      <Sparkles className={cn('h-full w-full', iconClassName)} />
    </span>
  );
};

export default TrinityAIIcon;
