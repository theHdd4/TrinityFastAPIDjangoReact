import React from 'react';
import { getAllThemes, getThemesByCategory, TableTheme } from './tableThemes';
import { cn } from '@/lib/utils';

interface ThemeSelectorProps {
  selectedTheme: string;
  onThemeChange: (themeId: string) => void;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ selectedTheme, onThemeChange }) => {
  const lightThemes = getThemesByCategory('light');
  const mediumThemes = getThemesByCategory('medium');
  const darkThemes = getThemesByCategory('dark');

  const renderThemePreview = (theme: TableTheme) => {
    return (
      <button
        key={theme.id}
        onClick={() => onThemeChange(theme.id)}
        className={cn(
          "p-2 rounded border-2 transition-all text-left",
          selectedTheme === theme.id 
            ? "border-teal-500 shadow-lg bg-teal-50" 
            : "border-gray-200 hover:border-gray-300"
        )}
      >
        <div className="text-xs mb-1 font-medium">{theme.name}</div>
        <div className="space-y-0.5">
          {/* Header preview */}
          <div 
            style={{ 
              backgroundColor: theme.colors.headerBg, 
              color: theme.colors.headerText 
            }} 
            className="h-3 px-1 text-[8px] flex items-center rounded-t"
          >
            Header
          </div>
          {/* Row previews */}
          <div 
            style={{ 
              backgroundColor: theme.colors.oddRowBg,
              borderColor: theme.colors.borderColor,
              borderWidth: '1px',
              borderStyle: 'solid'
            }} 
            className="h-2 rounded-sm"
          />
          <div 
            style={{ 
              backgroundColor: theme.colors.evenRowBg,
              borderColor: theme.colors.borderColor,
              borderWidth: '1px',
              borderStyle: 'solid'
            }} 
            className="h-2 rounded-sm"
          />
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Light Themes */}
      <div>
        <h4 className="text-xs font-medium text-gray-600 mb-2">Light Themes</h4>
        <div className="grid grid-cols-2 gap-2">
          {lightThemes.map(renderThemePreview)}
        </div>
      </div>

      {/* Medium Themes */}
      <div>
        <h4 className="text-xs font-medium text-gray-600 mb-2">Medium Themes</h4>
        <div className="grid grid-cols-2 gap-2">
          {mediumThemes.map(renderThemePreview)}
        </div>
      </div>

      {/* Dark Themes */}
      <div>
        <h4 className="text-xs font-medium text-gray-600 mb-2">Dark Themes</h4>
        <div className="grid grid-cols-2 gap-2">
          {darkThemes.map(renderThemePreview)}
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;



