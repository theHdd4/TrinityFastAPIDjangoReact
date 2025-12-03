import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, Type, BarChart3, Lightbulb, HelpCircle, Quote, Blocks, LayoutGrid, Table2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';
import { ElementType } from './ElementDropdown';
import ElementRenderer from './ElementRenderer';

interface KPIDashboardCanvasProps {
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onDataUpload: (data: KPIDashboardData) => void;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
}

type LayoutType = '4-box' | '3-box' | '2-box' | '1-box';

interface LayoutBox {
  id: string;
  elementType?: ElementType;
  width?: number;
}

interface Layout {
  id: string;
  type: LayoutType;
  boxes: LayoutBox[];
  height?: number;
}

const KPIDashboardCanvas: React.FC<KPIDashboardCanvasProps> = ({
  data,
  settings,
  onDataUpload,
  onSettingsChange
}) => {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectKey, setSelectKey] = useState(0);

  const elementTypes: { value: ElementType; label: string; icon: React.ElementType; description: string }[] = [
    { value: 'text-box', label: 'Text Box', icon: Type, description: 'Rich text content' },
    { value: 'metric-card', label: 'Metric Card', icon: BarChart3, description: 'KPI with value & trend' },
    { value: 'insight-panel', label: 'Insight Panel', icon: Lightbulb, description: 'Key insights list' },
    { value: 'qa', label: 'Q&A Block', icon: HelpCircle, description: 'Question & answer' },
    { value: 'caption', label: 'Caption', icon: Quote, description: 'Descriptive caption' },
    { value: 'interactive-blocks', label: 'Interactive Block', icon: Blocks, description: 'Dynamic content' },
    { value: 'chart', label: 'Chart', icon: BarChart3, description: 'Data visualizations' },
    { value: 'table', label: 'Table', icon: Table2, description: 'Structured data display' },
    { value: 'image', label: 'Image', icon: ImageIcon, description: 'Visual content' },
  ];

  const layoutOptions: { value: LayoutType; label: string; columns: number }[] = [
    { value: '4-box', label: '4 Columns', columns: 4 },
    { value: '3-box', label: '3 Columns', columns: 3 },
    { value: '2-box', label: '2 Columns', columns: 2 },
    { value: '1-box', label: '1 Column', columns: 1 },
  ];

  const getBoxCount = (layoutType: LayoutType): number => {
    switch (layoutType) {
      case '4-box': return 4;
      case '3-box': return 3;
      case '2-box': return 2;
      case '1-box': return 1;
      default: return 1;
    }
  };

  const getDefaultWidth = (layoutType: LayoutType): number => {
    switch (layoutType) {
      case '4-box': return 3;
      case '3-box': return 4;
      case '2-box': return 6;
      case '1-box': return 12;
      default: return 12;
    }
  };

  const getFilledCount = (layout: Layout) => 
    layout.boxes.filter(b => b.elementType).length;

  const handleSelectLayout = (layoutType: LayoutType) => {
    const boxCount = getBoxCount(layoutType);
    const defaultWidth = getDefaultWidth(layoutType);
    const newLayout: Layout = {
      id: `layout-${Date.now()}`,
      type: layoutType,
      boxes: Array.from({ length: boxCount }, (_, idx) => ({
        id: `box-${Date.now()}-${idx}`,
        elementType: undefined,
        width: defaultWidth
      })),
      height: 220
    };
    setLayouts([...layouts, newLayout]);
    // Force reset the select dropdown to allow selecting the same option again
    setSelectKey(prev => prev + 1);
  };

  const handleElementSelect = (layoutId: string, boxId: string, elementType: ElementType) => {
    setLayouts(layouts.map(layout => {
      if (layout.id === layoutId) {
        return {
          ...layout,
          boxes: layout.boxes.map(box => 
            box.id === boxId ? { ...box, elementType } : box
          )
        };
      }
      return layout;
    }));
  };

  const handleDeleteLayout = (layoutId: string) => {
    setLayouts(layouts.filter(layout => layout.id !== layoutId));
  };

  const handleLayoutHeightChange = (layoutId: string, newHeight: number) => {
    const clampedHeight = Math.max(120, Math.min(800, newHeight));
    setLayouts(layouts.map(layout => 
      layout.id === layoutId ? { ...layout, height: clampedHeight } : layout
    ));
  };

  const handleResizeStart = (layoutId: string, startY: number, currentHeight: number) => {
    const startHeight = currentHeight || 220;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startY;
      const newHeight = startHeight + deltaY;
      handleLayoutHeightChange(layoutId, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="h-full w-full overflow-y-auto p-8 bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-3xl blur-2xl opacity-60" />
          <div className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-[0_8px_32px_-8px_hsl(var(--primary)/0.15),0_4px_16px_-4px_hsl(var(--foreground)/0.05)]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-inner">
                <LayoutGrid className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  Dashboard Layout
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Build your KPI dashboard by adding rows and selecting elements
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {layouts.length === 0 && (
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex flex-col items-center justify-center py-24 px-8 border-2 border-dashed border-border/60 rounded-2xl bg-gradient-to-br from-card/50 to-muted/20 backdrop-blur-sm shadow-[0_4px_24px_-8px_hsl(var(--foreground)/0.05)]">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.3)]">
                  <Plus className="w-10 h-10 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Start Building Your Dashboard</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
                Add rows to your dashboard using the options below. Each row can contain multiple elements for a flexible layout.
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                {layoutOptions.map(option => (
                  <Button
                    key={option.value}
                    variant="outline"
                    onClick={() => handleSelectLayout(option.value)}
                    className="gap-3 h-12 px-5 bg-card/80 hover:bg-primary/5 border-border/60 hover:border-primary/40 shadow-[0_4px_12px_-4px_hsl(var(--foreground)/0.08)] hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.2)] transition-all duration-300"
                  >
                    <div className="flex gap-1">
                      {Array.from({ length: option.columns }).map((_, i) => (
                        <div key={i} className="w-2.5 h-5 bg-primary/30 rounded-sm" />
                      ))}
                    </div>
                    <span className="font-medium">{option.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Layout Rows */}
        {layouts.length > 0 && (
          <div className="space-y-4">
            {layouts.map((layout, rowIndex) => (
              <div
                key={layout.id}
                className="group relative"
              >
                {/* Ambient glow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div 
                  className="relative bg-transparent border border-gray-200/30 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-1 flex flex-col"
                  style={{ height: `${layout.height || 220}px` }}
                >
                  {/* Delete button for the entire layout */}
                  <button
                    onClick={() => handleDeleteLayout(layout.id)}
                    className="absolute top-1 right-1 p-1.5 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 z-30"
                    title="Delete this layout"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500 hover:text-red-700" />
                  </button>

                  {/* Row Content */}
                  <div className="grid grid-cols-12 gap-2 flex-1" style={{ minHeight: 0 }}>
                    {layout.boxes.map((box) => (
                      <ElementBox
                        key={box.id}
                        box={box}
                        width={box.width || getDefaultWidth(layout.type)}
                        elementTypes={elementTypes}
                        onSelectElement={(type) => handleElementSelect(layout.id, box.id, type)}
                      />
                    ))}
                  </div>

                  {/* Resize handle for the entire layout at the bottom */}
                  <div
                    className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-gray-100/50 transition-colors z-20 flex items-center justify-center"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleResizeStart(layout.id, e.clientY, layout.height || 220);
                    }}
                    title="Drag to resize entire layout height"
                  >
                    <div className="h-0.5 w-10 bg-gray-800 rounded-full hover:bg-black transition-colors"></div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add Row Section */}
            <div className="relative">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
              <div className="relative flex justify-center">
                <div className="bg-background px-6 py-1">
                  <TooltipProvider>
                    <Select 
                      key={selectKey}
                      onValueChange={(value: LayoutType) => handleSelectLayout(value)}
                    >
                      <SelectTrigger className="w-[200px] h-11 bg-card hover:bg-primary/5 border-border/60 hover:border-primary/40 shadow-[0_4px_16px_-4px_hsl(var(--foreground)/0.1)] hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.2)] transition-all duration-300 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Plus className="w-4 h-4 text-primary" />
                          <span className="font-medium">Add New Row</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent className="shadow-[0_12px_40px_-12px_hsl(var(--foreground)/0.2)] border-border/60 rounded-xl">
                        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1">
                          Select Layout
                        </div>
                        {layoutOptions.map(option => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value} 
                            className="cursor-pointer rounded-lg mx-1 my-0.5"
                            disabled={false}
                          >
                            <div className="flex items-center gap-4 py-1">
                              <div className="flex gap-1 p-2 bg-muted/50 rounded-md">
                                {Array.from({ length: option.columns }).map((_, i) => (
                                  <div key={i} className="w-3 h-5 bg-primary/30 rounded-sm" />
                                ))}
                              </div>
                              <span className="font-medium">{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ElementBoxProps {
  box: LayoutBox;
  width: number;
  elementTypes: { value: ElementType; label: string; icon: React.ElementType; description: string }[];
  onSelectElement: (type: ElementType) => void;
}

const ElementBox: React.FC<ElementBoxProps> = ({ box, width, elementTypes, onSelectElement }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const selectedElement = elementTypes.find(e => e.value === box.elementType);

  // Handle double-click to enter edit mode
  const handleDoubleClick = () => {
    if (box.elementType) {
      setIsEditMode(true);
    }
  };

  // When an element is selected, exit edit mode
  const handleElementChange = (value: ElementType) => {
    onSelectElement(value);
    setIsEditMode(false);
  };

  // If element is selected and NOT in edit mode, show the full element
  if (box.elementType && !isEditMode) {
    return (
      <div 
        className="relative group/box cursor-pointer" 
        style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        onDoubleClick={handleDoubleClick}
        title="Double-click to change element"
      >
        {/* Ambient glow */}
        <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl blur-lg opacity-0 group-hover/box:opacity-100 transition-opacity duration-300" />
        
        {/* Full Element Display */}
        <div className="relative w-full h-full border-2 border-primary/40 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
          <ElementRenderer type={box.elementType} />
          
          {/* Hover overlay with hint */}
          <div className="absolute inset-0 bg-black/0 group-hover/box:bg-black/5 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover/box:opacity-100">
            <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg">
              <p className="text-xs font-medium text-gray-700">Double-click to change</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, show the dropdown (either no element or in edit mode)
  return (
    <div className="relative group/box" style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}>
      {/* Ambient glow for selected elements */}
      {box.elementType && (
        <div className="absolute -inset-1 bg-gradient-to-br from-yellow-100/50 to-yellow-50/30 rounded-xl blur-lg opacity-0 group-hover/box:opacity-100 transition-opacity duration-300" />
      )}
      
      <Select
        value={box.elementType || ''}
        onValueChange={handleElementChange}
        open={isEditMode ? true : undefined}
        onOpenChange={(open) => !open && setIsEditMode(false)}
      >
        <SelectTrigger 
          className={`
            relative w-full h-full flex flex-col items-start justify-start p-0 overflow-hidden
            border-2 rounded-xl transition-all duration-300
            ${box.elementType 
              ? 'border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 hover:border-yellow-300 shadow-[0_4px_16px_-4px_rgba(251,191,36,0.15)] hover:shadow-[0_8px_24px_-8px_rgba(251,191,36,0.25)]' 
              : 'border-dashed border-border/60 hover:border-yellow-300 bg-gradient-to-br from-card to-muted/20 hover:from-yellow-50/50 hover:to-amber-50/50 shadow-[0_2px_8px_-2px_hsl(var(--foreground)/0.05)] hover:shadow-[0_8px_20px_-8px_rgba(251,191,36,0.15)]'
            }
          `}
        >
          {/* Header bar */}
          <div className={`
            w-full flex items-center justify-between px-3 py-2.5 
            border-b transition-colors duration-300
            ${box.elementType 
              ? 'bg-yellow-100/50 border-yellow-200' 
              : 'bg-muted/30 border-border/40'
            }
          `}>
            {selectedElement ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-yellow-100 flex items-center justify-center">
                  <selectedElement.icon className="w-3.5 h-3.5 text-yellow-600" />
                </div>
                <span className="text-xs font-semibold text-gray-800">
                  {selectedElement.label}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground font-medium">Select element type...</span>
            )}
            <ChevronDown className={`w-4 h-4 transition-colors ${box.elementType ? 'text-yellow-600' : 'text-muted-foreground/60'}`} />
          </div>
          
          {/* Content area */}
          <div className="flex-1 w-full flex items-center justify-center p-4 min-h-0">
            {selectedElement ? (
              <div className="text-center">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center mx-auto mb-2 shadow-inner">
                  <selectedElement.icon className="w-5 h-5 text-yellow-600" />
                </div>
                <p className="text-[11px] text-gray-600 font-medium">{selectedElement.description}</p>
              </div>
            ) : (
              <div className="w-full h-full border border-dashed border-border/40 rounded-lg flex items-center justify-center bg-muted/10 min-h-0">
                <div className="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-muted-foreground/50" />
                </div>
              </div>
            )}
          </div>
        </SelectTrigger>

        <SelectContent className="w-[260px] shadow-[0_16px_48px_-12px_hsl(var(--foreground)/0.25)] border-border/60 rounded-xl p-1">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1">
            Select Element Type
          </div>
          {elementTypes.map(element => (
            <SelectItem key={element.value} value={element.value!} className="cursor-pointer rounded-lg my-0.5 py-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-100 to-yellow-50 flex items-center justify-center shadow-inner">
                  <element.icon className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{element.label}</p>
                  <p className="text-xs text-gray-600">{element.description}</p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default KPIDashboardCanvas;
