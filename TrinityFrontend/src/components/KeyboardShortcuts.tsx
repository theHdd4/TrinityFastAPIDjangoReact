import React from 'react';
import { useSearchShortcut } from '@/hooks/useSearchShortcut';

const KeyboardShortcuts: React.FC = () => {
  useSearchShortcut();
  return null; // This component doesn't render anything
};

export default KeyboardShortcuts;
