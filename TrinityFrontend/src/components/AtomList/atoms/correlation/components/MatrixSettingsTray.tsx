import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface MatrixSettings {
  theme: string;
  showAxisLabels: boolean;
  showDataLabels: boolean;
  showLegend: boolean;
}

// Reuse color themes from Explore/ChartMaker atoms
export const COLOR_THEMES: Record<string, { name: string; primary: string; secondary: string; tertiary: string; }> = {
  default: {
    name: 'Default',
    primary: '#41C185', // Trinity green
    secondary: '#458EE2', // Trinity blue
    tertiary: '#E0E7FF',
  },
  multicolor: {
    name: 'Multicolor 1',
    primary: '#6366f1',
    secondary: '#FF8042',
    tertiary: '#FFBB28',
  },
  blue: {
    name: 'Blue',
    primary: '#3b82f6',
    secondary: '#60a5fa',
    tertiary: '#dbeafe',
  },
  green: {
    name: 'Green',
    primary: '#10b981',
    secondary: '#6ee7b7',
    tertiary: '#d1fae5',
  },
  purple: {
    name: 'Purple',
    primary: '#8b5cf6',
    secondary: '#c4b5fd',
    tertiary: '#ede9fe',
  },
  orange: {
    name: 'Orange',
    primary: '#f59e0b',
    secondary: '#fcd34d',
    tertiary: '#fef3c7',
  },
  red: {
    name: 'Red',
    primary: '#ef4444',
    secondary: '#f87171',
    tertiary: '#fecaca',
  },
  teal: {
    name: 'Teal',
    primary: '#14b8a6',
    secondary: '#5eead4',
    tertiary: '#ccfbf1',
  },
  pink: {
    name: 'Pink',
    primary: '#ec4899',
    secondary: '#f9a8d4',
    tertiary: '#fce7f3',
  },
  gray: {
    name: 'Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
  },
  yellow: {
    name: 'Yellow',
    primary: '#facc15',
    secondary: '#fde047',
    tertiary: '#fef9c3',
  },
};

interface MatrixSettingsTrayProps {
  open: boolean;
  position: { x: number; y: number } | null;
  onOpenChange: (open: boolean) => void;
  settings: MatrixSettings;
  onSave: (settings: MatrixSettings) => void;
}

const MatrixSettingsTray: React.FC<MatrixSettingsTrayProps> = ({
  open,
  position,
  onOpenChange,
  settings,
  onSave,
}) => {
  const [localSettings, setLocalSettings] = useState<MatrixSettings>(settings);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const [colorSubmenuPos, setColorSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Close when clicking outside the tray
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      const outsideMenu = !target.closest('.matrix-settings-menu');
      const outsideSubmenu = !target.closest('.color-submenu');
      if (outsideMenu && outsideSubmenu) {
        onOpenChange(false);
        setShowColorSubmenu(false);
      }
    };

    if (open || showColorSubmenu) {
      document.addEventListener('mousedown', handleOutside, false);
      return () => {
        document.removeEventListener('mousedown', handleOutside, false);
      };
    }
  }, [open, showColorSubmenu, onOpenChange]);

  if (!open || !position) return null;

  const handleColorThemeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const submenuWidth = 220;
    const spacing = 4;
    let x = rect.right + spacing;
    if (window.innerWidth - rect.right < submenuWidth + 10) {
      x = rect.left - submenuWidth - spacing;
    }
    setColorSubmenuPos({ x, y: rect.top });
    setShowColorSubmenu(!showColorSubmenu);
  };
  const updateSettings = (updates: Partial<MatrixSettings>) => {
    setLocalSettings(prev => {
      const next = { ...prev, ...updates };
      onSave(next);
      return next;
    });
  };

  const menu = (
    <div
      className="fixed z-[100000] bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48 matrix-settings-menu"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Color Theme Option */}
      <button
        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 relative"
        onClick={handleColorThemeClick}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
        </svg>
        <span>Color Theme</span>
        <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Axis Labels Toggle */}
      <button
        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
        onClick={() =>
          updateSettings({ showAxisLabels: !localSettings.showAxisLabels })
        }
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span>Axis Labels</span>
        <div className="ml-auto">
          <div
            className={`w-4 h-3 rounded border ${
              localSettings.showAxisLabels
                ? 'bg-blue-500 border-blue-500'
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            {localSettings.showAxisLabels && (
              <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Data Labels Toggle */}
      <button
        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
        onClick={() =>
          updateSettings({ showDataLabels: !localSettings.showDataLabels })
        }
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Data Labels</span>
        <div className="ml-auto">
          <div
            className={`w-4 h-3 rounded border ${
              localSettings.showDataLabels
                ? 'bg-blue-500 border-blue-500'
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            {localSettings.showDataLabels && (
              <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Legend Toggle */}
      <button
        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
        onClick={() =>
          updateSettings({ showLegend: !localSettings.showLegend })
        }
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span>Legend</span>
        <div className="ml-auto">
          <div
            className={`w-4 h-3 rounded border ${
              localSettings.showLegend
                ? 'bg-blue-500 border-blue-500'
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            {localSettings.showLegend && (
              <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* No explicit save action - settings persist immediately */}
    </div>
  );

  const colorSubmenu = showColorSubmenu
    ? createPortal(
        <div
          className="fixed z-[100001] bg-white border border-gray-300 rounded-lg shadow-xl p-3 color-submenu"
          style={{
            left: colorSubmenuPos.x,
            top: colorSubmenuPos.y,
            minWidth: '220px',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-3">
            Color Theme
          </div>

          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(COLOR_THEMES).map(([key, theme]) => (
              <button
                key={key}
                className={`w-6 h-6 rounded-md border-2 transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                  localSettings.theme === key
                    ? 'border-blue-500 shadow-lg ring-2 ring-blue-200 ring-opacity-50'
                    : 'border-gray-300 hover:border-gray-400 hover:shadow-md'
                }`}
                onClick={() => {
                  updateSettings({ theme: key });
                  setShowColorSubmenu(false);
                }}
                title={theme.name}
              >
                <div
                  className="w-full h-full rounded-sm"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                  }}
                />
              </button>
            ))}
          </div>

          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500 px-2">
              Click a color to select the theme
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {createPortal(menu, document.body)}
      {colorSubmenu}
    </>
  );
};

export default MatrixSettingsTray;

