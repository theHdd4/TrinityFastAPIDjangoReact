import React from 'react';
import { Label } from '@/components/ui/label';

export interface BorderStyleConfig {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  insideHorizontal: boolean;
  insideVertical: boolean;
  header: boolean;
}

interface BorderStyleSelectorProps {
  value: BorderStyleConfig | string; // Can be object or legacy string format
  onChange: (value: BorderStyleConfig) => void;
}

/**
 * Convert legacy string format to BorderStyleConfig
 */
const stringToBorderConfig = (str: string): BorderStyleConfig => {
  switch (str) {
    case 'all':
      return {
        top: true,
        bottom: true,
        left: true,
        right: true,
        insideHorizontal: true,
        insideVertical: true,
        header: true,
      };
    case 'none':
      return {
        top: false,
        bottom: false,
        left: false,
        right: false,
        insideHorizontal: false,
        insideVertical: false,
        header: false,
      };
    case 'outside':
      return {
        top: true,
        bottom: true,
        left: true,
        right: true,
        insideHorizontal: false,
        insideVertical: false,
        header: false,
      };
    case 'horizontal':
      return {
        top: false,
        bottom: false,
        left: false,
        right: false,
        insideHorizontal: true,
        insideVertical: false,
        header: true,
      };
    case 'vertical':
      return {
        top: false,
        bottom: false,
        left: false,
        right: false,
        insideHorizontal: false,
        insideVertical: true,
        header: false,
      };
    case 'header':
      return {
        top: false,
        bottom: false,
        left: false,
        right: false,
        insideHorizontal: false,
        insideVertical: false,
        header: true,
      };
    default:
      return {
        top: true,
        bottom: true,
        left: true,
        right: true,
        insideHorizontal: true,
        insideVertical: true,
        header: true,
      };
  }
};

/**
 * Visual Grid Border Style Selector (Excel-style)
 * Click on borders to toggle them on/off
 */
const BorderStyleSelector: React.FC<BorderStyleSelectorProps> = ({ value, onChange }) => {
  // Convert value to BorderStyleConfig
  const config: BorderStyleConfig = typeof value === 'string' 
    ? stringToBorderConfig(value)
    : (typeof value === 'object' && value !== null && !Array.isArray(value))
    ? (value as BorderStyleConfig)
    : stringToBorderConfig('all'); // Default fallback

  const toggleBorder = (key: keyof BorderStyleConfig) => {
    onChange({
      ...config,
      [key]: !config[key],
    });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm">Border Style</Label>
      
      {/* Visual Grid */}
      <div className="relative w-full max-w-xs mx-auto">
        {/* Grid Container */}
        <div className="relative border-2 border-gray-300 rounded bg-white" style={{ aspectRatio: '4/3' }}>
          {/* Header Border (Top) */}
          <div
            onClick={() => toggleBorder('header')}
            className={`absolute top-0 left-0 right-0 h-2 cursor-pointer transition-colors ${
              config.header ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Header Border"
          />
          
          {/* Top Border */}
          <div
            onClick={() => toggleBorder('top')}
            className={`absolute top-2 left-0 right-0 h-1 cursor-pointer transition-colors ${
              config.top ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Top Border"
          />
          
          {/* Bottom Border */}
          <div
            onClick={() => toggleBorder('bottom')}
            className={`absolute bottom-0 left-0 right-0 h-1 cursor-pointer transition-colors ${
              config.bottom ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Bottom Border"
          />
          
          {/* Left Border */}
          <div
            onClick={() => toggleBorder('left')}
            className={`absolute top-0 bottom-0 left-0 w-1 cursor-pointer transition-colors ${
              config.left ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Left Border"
          />
          
          {/* Right Border */}
          <div
            onClick={() => toggleBorder('right')}
            className={`absolute top-0 bottom-0 right-0 w-1 cursor-pointer transition-colors ${
              config.right ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Right Border"
          />
          
          {/* Inside Horizontal Border (middle) */}
          <div
            onClick={() => toggleBorder('insideHorizontal')}
            className={`absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 cursor-pointer transition-colors ${
              config.insideHorizontal ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Inside Horizontal Borders"
          />
          
          {/* Inside Vertical Border (middle) */}
          <div
            onClick={() => toggleBorder('insideVertical')}
            className={`absolute top-0 bottom-0 left-1/2 w-1 -translate-x-1/2 cursor-pointer transition-colors ${
              config.insideVertical ? 'bg-teal-500' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Inside Vertical Borders"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.top ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Top</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.bottom ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Bottom</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.left ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Left</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.right ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Right</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.insideHorizontal ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Inside H</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.insideVertical ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Inside V</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${config.header ? 'bg-teal-500' : 'bg-gray-200 border border-gray-300'}`} />
          <span>Header</span>
        </div>
      </div>
    </div>
  );
};

export default BorderStyleSelector;

