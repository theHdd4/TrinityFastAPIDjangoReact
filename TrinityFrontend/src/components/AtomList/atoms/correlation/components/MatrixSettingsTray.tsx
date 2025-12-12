import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface MatrixSettings {
  theme: string;
  showAxisLabels: boolean;
  showDataLabels: boolean;
  showLegend: boolean;
  showGrid: boolean;
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
  isMobile?: boolean; // Mobile-only optimizations
}

const MatrixSettingsTray: React.FC<MatrixSettingsTrayProps> = ({
  open,
  position,
  onOpenChange,
  settings,
  onSave,
  isMobile = false, // Default to desktop behavior
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

  // MOBILE-ONLY: Prevent body scroll when menu is open (better focus)
  // Desktop: No scroll lock (page scrolls normally)
  useEffect(() => {
    if (!open || !isMobile) return;
    
    // Lock body scroll
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyWidth = document.body.style.width;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    
    // Also lock root container (for React apps)
    const rootContainer = document.getElementById('root');
    const originalRootOverflow = rootContainer?.style.overflow;
    if (rootContainer) {
      rootContainer.style.overflow = 'hidden';
    }
    
    // Prevent touch move on document (stops scrolling on mobile)
    const preventTouch = (e: TouchEvent) => {
      const target = e.target as Element;
      // Allow scrolling within menu itself
      if (target.closest('.matrix-settings-menu') || target.closest('.color-submenu')) {
        return;
      }
      e.preventDefault();
    };
    
    document.addEventListener('touchmove', preventTouch, { passive: false });
    
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.width = originalBodyWidth;
      if (rootContainer && originalRootOverflow !== undefined) {
        rootContainer.style.overflow = originalRootOverflow;
      }
      document.removeEventListener('touchmove', preventTouch);
    };
  }, [open, isMobile]);

  if (!open || !position) return null;

  const handleColorThemeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;
    const spacing = 4;
    
    // MOBILE-ONLY: Compact submenu width (160px vs 220px)
    // Desktop keeps original 220px
    const submenuWidth = isMobile 
      ? Math.min(160, viewportWidth - (padding * 2)) // Mobile: compact 160px (was 180px)
      : 220; // Desktop: unchanged
    
    const submenuMaxHeight = isMobile 
      ? Math.min(220, viewportHeight - (padding * 2)) // Mobile: compact (was 240px)
      : 280;
    
    let x: number;
    let y: number = rect.top;
    
    // Horizontal positioning (same logic for both mobile and desktop)
    x = rect.right + spacing;
    
    // Check if would overflow right edge
    if (x + submenuWidth > viewportWidth - padding) {
      // Try left side
      x = rect.left - submenuWidth - spacing;
      
      // If still overflows, position at right edge with padding
      if (x < padding) {
        x = viewportWidth - submenuWidth - padding;
      }
    }
    
    // MOBILE-ONLY: Enhanced vertical positioning
    // Desktop keeps simple top alignment
    if (isMobile) {
      // Try positioning below menu item (better for mobile thumb reach)
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (spaceBelow >= submenuMaxHeight + padding) {
        y = rect.bottom + spacing;
      } else if (spaceAbove >= submenuMaxHeight + padding) {
        y = rect.top - submenuMaxHeight - spacing;
      } else {
        y = viewportHeight - submenuMaxHeight - padding;
      }
    } else {
      // Desktop: Keep original simple positioning
      if (window.innerWidth - rect.right < submenuWidth + 10) {
        // Already handled above
      }
    }
    
    setColorSubmenuPos({ x, y });
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
      className="fixed z-[100000] bg-white border border-gray-200 rounded-lg shadow-lg matrix-settings-menu"
      style={{ 
        left: position.x, 
        top: position.y,
        // MOBILE-ONLY: Compact sizing and scrollable
        // Desktop keeps original py-2 min-w-48
        ...(isMobile ? {
          padding: '0.25rem 0',
          width: 'min(170px, calc(100vw - 20px))', // Compact 170px (was 200px) - matches position calc
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto' as const,
        } : {
          padding: '0.5rem 0',
          width: '240px', // Explicit width to match position calculation
        })
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Color Theme Option */}
      <button
        className={`w-full text-left hover:bg-gray-50 flex items-center text-gray-700 relative ${
          isMobile ? 'px-2 py-1 text-xs gap-1' : 'px-4 py-2 text-sm gap-3'
        }`}
        onClick={handleColorThemeClick}
      >
        <svg className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
        </svg>
        <span>Color Theme</span>
        <svg className={`ml-auto ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Axis Labels Toggle */}
      <button
        className={`w-full text-left hover:bg-gray-50 flex items-center text-gray-700 ${
          isMobile ? 'px-2 py-1 text-xs gap-1' : 'px-4 py-2 text-sm gap-3'
        }`}
        onClick={() =>
          updateSettings({ showAxisLabels: !localSettings.showAxisLabels })
        }
      >
        <svg className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span>Axis Labels</span>
        <div className="ml-auto">
          <div
            className={`rounded border ${
              isMobile ? 'w-2.5 h-2' : 'w-4 h-3'
            } ${
              localSettings.showAxisLabels
                ? 'bg-blue-500 border-blue-500'
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            {localSettings.showAxisLabels && (
              <svg className={isMobile ? 'w-2.5 h-2' : 'w-4 h-3'} fill="currentColor" viewBox="0 0 20 20">
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
        className={`w-full text-left hover:bg-gray-50 flex items-center text-gray-700 ${
          isMobile ? 'px-2 py-1 text-xs gap-1' : 'px-4 py-2 text-sm gap-3'
        }`}
        onClick={() =>
          updateSettings({ showDataLabels: !localSettings.showDataLabels })
        }
      >
        <svg className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Data Labels</span>
        <div className="ml-auto">
          <div
            className={`rounded border ${
              isMobile ? 'w-2.5 h-2' : 'w-4 h-3'
            } ${
              localSettings.showDataLabels
                ? 'bg-blue-500 border-blue-500'
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            {localSettings.showDataLabels && (
              <svg className={isMobile ? 'w-2.5 h-2' : 'w-4 h-3'} fill="currentColor" viewBox="0 0 20 20">
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
        className={`w-full text-left hover:bg-gray-50 flex items-center text-gray-700 ${
          isMobile ? 'px-2 py-1 text-xs gap-1' : 'px-4 py-2 text-sm gap-3'
        }`}
        onClick={() =>
          updateSettings({ showLegend: !localSettings.showLegend })
        }
      >
        <svg className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span>Legend</span>
        <div className="ml-auto">
          <div
            className={`rounded border ${
              isMobile ? 'w-2.5 h-2' : 'w-4 h-3'
            } ${
              localSettings.showLegend
                ? 'bg-blue-500 border-blue-500'
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            {localSettings.showLegend && (
              <svg className={isMobile ? 'w-2.5 h-2' : 'w-4 h-3'} fill="currentColor" viewBox="0 0 20 20">
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
          className="fixed z-[100001] bg-white border border-gray-300 rounded-lg shadow-xl color-submenu"
          style={{
            left: colorSubmenuPos.x,
            top: colorSubmenuPos.y,
            // MOBILE-ONLY: Compact, adaptive sizing
            // Desktop keeps original 220px width
            ...(isMobile ? {
              width: 'min(160px, calc(100vw - 20px))', // Compact 160px (was 180px) - matches position calc
              maxHeight: 'min(220px, calc(100vh - 40px))',
              overflowY: 'auto' as const,
              padding: '0.375rem', // Reduced padding (was 0.5rem)
            } : {
              width: '220px', // Explicit width to match position calculation
              maxHeight: '280px',
              overflowY: 'auto' as const,
              padding: '0.75rem',
            })
          }}
        >
          {/* Header - Mobile-adaptive */}
          <div className={`font-semibold text-gray-700 border-b border-gray-200 ${
            isMobile ? 'px-1 py-0.5 text-xs mb-1.5' : 'px-2 py-2 text-sm mb-3'
          }`}>
            Color Theme
          </div>

          {/* KEY CHANGE: 5 columns on mobile, 8 on desktop */}
          <div className={`grid ${
            isMobile ? 'grid-cols-5 gap-1' : 'grid-cols-8 gap-1.5'
          }`}>
            {Object.entries(COLOR_THEMES).map(([key, theme]) => (
              <button
                key={key}
                className={`rounded-md border-2 transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                  isMobile ? 'w-4 h-4' : 'w-6 h-6'
                } ${
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

          {/* Footer - Mobile-adaptive */}
          <div className={`border-t border-gray-200 ${
            isMobile ? 'mt-1.5 pt-1' : 'mt-3 pt-2'
          }`}>
            <div className={`text-gray-500 ${
              isMobile ? 'text-[11px] px-1' : 'text-xs px-2'
            }`}>
              Click a color to select the theme
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  // Mobile overlay for better UX (dims background, prevents interaction)
  const overlay = isMobile && open ? createPortal(
    <div 
      className="fixed inset-0 bg-black/20 z-[99999] backdrop-blur-[2px]"
      onClick={() => onOpenChange(false)}
      style={{ touchAction: 'none' }}
    />,
    document.body
  ) : null;

  return (
    <>
      {overlay}
      {createPortal(menu, document.body)}
      {colorSubmenu}
    </>
  );
};

export default MatrixSettingsTray;

