import React from 'react';
import { Button } from '@/components/ui/button';
import type { ActionButtonProps } from './types';

interface ActionButtonBoxProps {
  buttons: ActionButtonProps[];
  className?: string;
}

export const ActionButtonBox: React.FC<ActionButtonBoxProps> = ({
  buttons,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {buttons.map((button, index) => (
        <Button
          key={index}
          onClick={button.onClick}
          variant={
            button.variant === 'primary'
              ? 'default'
              : button.variant === 'secondary'
              ? 'secondary'
              : 'outline'
          }
          className={
            button.variant === 'primary'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : ''
          }
        >
          {button.icon && <span className="mr-2">{button.icon}</span>}
          {button.label}
        </Button>
      ))}
    </div>
  );
};


