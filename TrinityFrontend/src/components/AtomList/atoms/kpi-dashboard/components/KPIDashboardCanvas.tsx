import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, Type, BarChart3, Lightbulb, HelpCircle, Quote, Blocks, LayoutGrid, Table2, ImageIcon, Zap, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';
import { ElementType } from './ElementDropdown';
import ElementRenderer from './ElementRenderer';
import { TextBoxToolbar } from '@/components/LaboratoryMode/components/CanvasArea/text-box/TextBoxToolbar';
import { TEXT_STYLE_OPTIONS, getTextStyleProperties } from '@/components/LaboratoryMode/components/CanvasArea/text-box/constants';
import type { TextStylePreset } from '@/components/LaboratoryMode/components/CanvasArea/text-box/types';

interface KPIDashboardCanvasProps {
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onDataUpload: (data: KPIDashboardData) => void;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
}

type LayoutType = '4-box' | '3-box' | '2-box' | '1-box';
type TextStyleOption = 'header' | 'sub-header' | 'paragraph';

interface LayoutBox {
  id: string;
  elementType?: ElementType;
  width?: number;
  // Text box properties
  text?: string;
  textStyle?: TextStyleOption;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  isTextSaved?: boolean; // Track if text is in "saved" (preview-only) mode
  // Insights panel properties
  insightsHeading?: string;
  insightsContent?: string;
  isInsightsSaved?: boolean;
  // Q&A properties
  qaQuestionContent?: string;
  qaAnswerContent?: string;
  isQASaved?: boolean;
  qaHasBeenInteracted?: boolean;
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
            box.id === boxId 
              ? { 
                  ...box, 
                  elementType,
                  // Initialize text box with defaults if it's a text-box
                  ...(elementType === 'text-box' ? {
                    text: box.text || '',
                    textStyle: box.textStyle || 'paragraph',
                    fontSize: box.fontSize || 18,
                    fontFamily: box.fontFamily || 'DM Sans',
                    bold: box.bold || false,
                    italic: box.italic || false,
                    underline: box.underline || false,
                    strikethrough: box.strikethrough || false,
                    align: box.align || 'left',
                    color: box.color || '#6B7280',
                    backgroundColor: box.backgroundColor || 'transparent'
                  } : elementType === 'insight-panel' ? {
                    insightsHeading: box.insightsHeading || 'KEY INSIGHTS',
                    insightsContent: box.insightsContent || '<div style="display: flex; align-items: flex-start; margin-bottom: 8px;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="margin-right: 8px; margin-top: 2px; flex-shrink: 0;"><circle cx="10" cy="10" r="9" stroke="#1A73E8" stroke-width="2" fill="none"/><path d="M6 10L8.5 12.5L14 7" stroke="#1A73E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span contenteditable="true" style="outline: none;">Your first insight here</span></div>',
                    isInsightsSaved: box.isInsightsSaved || false,
                    backgroundColor: box.backgroundColor || 'linear-gradient(135deg, #EBF4FF 0%, #E0F2FE 50%, #DBEAFE 100%)'
                  } : {})
                } 
              : box
          )
        };
      }
      return layout;
    }));
  };

  const handleTextBoxUpdate = (layoutId: string, boxId: string, updates: Partial<LayoutBox>) => {
    setLayouts(layouts.map(layout => {
      if (layout.id === layoutId) {
        return {
          ...layout,
          boxes: layout.boxes.map(box => 
            box.id === boxId ? { ...box, ...updates } : box
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
      <div className="w-full space-y-6">
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
          <div className="space-y-4" style={{ paddingTop: '80px' }}>
            {layouts.map((layout, rowIndex) => (
              <div
                key={layout.id}
                className="group relative"
              >
                {/* Ambient glow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div 
                  className="relative bg-transparent border border-gray-200/30 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-1 flex flex-col"
                  style={{ height: `${layout.height || 220}px`, overflow: 'visible' }}
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
                  <div className="grid grid-cols-12 gap-2" style={{ height: 'calc(100% - 8px)', overflow: 'visible' }}>
                    {layout.boxes.map((box) => (
                      <ElementBox
                        key={box.id}
                        box={box}
                        width={box.width || getDefaultWidth(layout.type)}
                        elementTypes={elementTypes}
                        onSelectElement={(type) => handleElementSelect(layout.id, box.id, type)}
                        onTextBoxUpdate={(updates) => handleTextBoxUpdate(layout.id, box.id, updates)}
                      />
                    ))}
                  </div>

                  {/* Resize handle for the entire layout at the bottom */}
                  <div
                    className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-gray-100/50 transition-colors flex items-center justify-center"
                    style={{ zIndex: 10001 }}
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
  onTextBoxUpdate: (updates: Partial<LayoutBox>) => void;
}

const ElementBox: React.FC<ElementBoxProps> = ({ box, width, elementTypes, onSelectElement, onTextBoxUpdate }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showTextBoxToolbar, setShowTextBoxToolbar] = useState(false);
  const [showInsightsToolbar, setShowInsightsToolbar] = useState(false);
  const [currentCursorStyle, setCurrentCursorStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  const [headingCursorStyle, setHeadingCursorStyle] = useState<TextStyleOption>('header');
  const [contentCursorStyle, setContentCursorStyle] = useState<TextStyleOption>('paragraph');
  // Q&A formatting states - Question
  const [qaQuestionBold, setQAQuestionBold] = useState(false);
  const [qaQuestionItalic, setQAQuestionItalic] = useState(false);
  const [qaQuestionUnderline, setQAQuestionUnderline] = useState(false);
  const [qaQuestionStrikethrough, setQAQuestionStrikethrough] = useState(false);
  const [qaQuestionFontSize, setQAQuestionFontSize] = useState(16);
  const [qaQuestionTextStyle, setQAQuestionTextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  // Q&A formatting states - Answer
  const [qaAnswerBold, setQAAnswerBold] = useState(false);
  const [qaAnswerItalic, setQAAnswerItalic] = useState(false);
  const [qaAnswerUnderline, setQAAnswerUnderline] = useState(false);
  const [qaAnswerStrikethrough, setQAAnswerStrikethrough] = useState(false);
  const [qaAnswerFontSize, setQAAnswerFontSize] = useState(16);
  const [qaAnswerTextStyle, setQAAnswerTextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  // Active Q&A field
  const [activeQAField, setActiveQAField] = useState<'question' | 'answer' | null>(null);
  // Insights formatting states
  const [insightsBold, setInsightsBold] = useState(false);
  const [insightsItalic, setInsightsItalic] = useState(false);
  const [insightsUnderline, setInsightsUnderline] = useState(false);
  const [insightsStrikethrough, setInsightsStrikethrough] = useState(false);
  const [insightsFontSize, setInsightsFontSize] = useState(16);
  const [insightsTextStyle, setInsightsTextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  
  const textRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const qaQuestionRef = useRef<HTMLDivElement>(null);
  const qaAnswerRef = useRef<HTMLDivElement>(null);
  
  const selectedElement = elementTypes.find(e => e.value === box.elementType);
  
  // Track cursor position and update current style
  const updateCursorStyleFromSelection = () => {
    if (!textRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === 3 ? container.parentElement : container as HTMLElement;
    
    if (element && textRef.current.contains(element)) {
      const computedStyle = window.getComputedStyle(element);
      const fontSize = parseInt(computedStyle.fontSize);
      
      // Detect which style based on font size
      if (fontSize >= 34) {
        setCurrentCursorStyle('header');
      } else if (fontSize >= 20) {
        setCurrentCursorStyle('sub-header');
      } else {
        setCurrentCursorStyle('paragraph');
      }
    }
  };

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

  // Handle text content update
  useEffect(() => {
    if (box.elementType === 'text-box' && textRef.current && !isEditing && !box.isTextSaved) {
      const content = box.text || '';
      if (textRef.current.innerHTML !== content) {
        textRef.current.innerHTML = content;
      }
    }
  }, [box.text, box.elementType, isEditing, box.isTextSaved]);

  // Sync current cursor style with box style changes
  useEffect(() => {
    if (box.textStyle) {
      setCurrentCursorStyle(box.textStyle);
    }
  }, [box.textStyle]);

  // Initialize content HTML for insights panel and Q&A
  useEffect(() => {
    if (box.elementType === 'insight-panel' && contentRef.current && box.insightsContent !== undefined && !isEditing) {
      if (contentRef.current.innerHTML !== box.insightsContent) {
        contentRef.current.innerHTML = box.insightsContent;
      }
    }
    if (box.elementType === 'qa' && qaQuestionRef.current && box.qaQuestionContent !== undefined && !isEditing) {
      if (qaQuestionRef.current.innerHTML !== box.qaQuestionContent) {
        qaQuestionRef.current.innerHTML = box.qaQuestionContent;
      }
    }
    if (box.elementType === 'qa' && qaAnswerRef.current && box.qaAnswerContent !== undefined && !isEditing && activeQAField !== 'answer') {
      if (qaAnswerRef.current.innerHTML !== box.qaAnswerContent) {
        qaAnswerRef.current.innerHTML = box.qaAnswerContent;
      }
    }
  }, [box.insightsContent, box.qaQuestionContent, box.qaAnswerContent, box.elementType, isEditing, activeQAField]);

  // If element is selected and NOT in edit mode, show the full element
  if (box.elementType && !isEditMode) {
    // Special handling for text-box - show editable interface with full toolbar
    if (box.elementType === 'text-box') {
      const handleTextInput = () => {
        if (textRef.current) {
          onTextBoxUpdate({ text: textRef.current.innerHTML });
        }
      };

      const handleStyleChange = (style: TextStyleOption) => {
        const styleProps = getTextStyleProperties(style);
        onTextBoxUpdate({
          textStyle: style,
          ...styleProps
        });
      };

      const handleApplyTextStyle = (preset: TextStylePreset) => {
        onTextBoxUpdate({
          fontSize: preset.fontSize,
          bold: preset.bold || false,
          italic: preset.italic || false,
          underline: preset.underline || false,
          strikethrough: preset.strikethrough || false,
        });
      };

      const handleSave = () => {
        onTextBoxUpdate({ isTextSaved: true });
      };

      const handleEdit = () => {
        onTextBoxUpdate({ isTextSaved: false });
      };

      // Preview mode - show only the formatted text (no header, no buttons)
      if (box.isTextSaved) {
        return (
          <div 
            className="relative group/box" 
            style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
            onDoubleClick={handleEdit}
            title="Double-click to edit"
          >
            <div className="relative w-full h-full rounded-xl overflow-hidden bg-white">
              {/* Display formatted text only - no borders, no headers */}
              <div 
                className="w-full h-full p-4 overflow-auto cursor-pointer hover:bg-gray-50/50 transition-colors"
                style={{
                  fontSize: `${box.fontSize || 18}px`,
                  fontFamily: box.fontFamily || 'DM Sans, sans-serif',
                  fontWeight: (box.bold || box.textStyle === 'header' || box.textStyle === 'sub-header') ? 'bold' : 'normal',
                  fontStyle: box.italic ? 'italic' : 'normal',
                  textDecoration: `${box.underline ? 'underline' : ''} ${box.strikethrough ? 'line-through' : ''}`.trim(),
                  textAlign: box.align || 'left',
                  color: box.color || (box.textStyle === 'paragraph' ? '#6B7280' : '#111827'),
                  backgroundColor: box.backgroundColor || 'transparent',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  letterSpacing: '-0.01em',
                  lineHeight: '1.2',
                }}
                dangerouslySetInnerHTML={{ __html: box.text || 'No text entered' }}
              />
            </div>
          </div>
        );
      }
      
      // Edit mode - toolbar HOVERING above, text box separate below
      
      // Helper functions for selection-based formatting
      const applyFormatToSelection = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        handleTextInput(); // Save changes
      };

      // Get default size based on current style
      const getDefaultSizeForStyle = (style?: TextStyleOption): number => {
        switch (style) {
          case 'header': return 36;
          case 'sub-header': return 22;
          case 'paragraph': return 18;
          default: return 18;
        }
      };

      const handleStyleChangeForSelection = (style: TextStyleOption) => {
        const defaultSize = getDefaultSizeForStyle(style);
        const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
        const isBold = style === 'header' || style === 'sub-header';
        
        console.log('Style changed to:', style, 'Size:', defaultSize, 'Bold:', isBold);
        
        // Update the current cursor style
        setCurrentCursorStyle(style);
        
        // Update the default style for new text
        onTextBoxUpdate({ 
          textStyle: style,
          fontSize: defaultSize,
          color: defaultColor,
          bold: isBold
        });
        
        // Focus the text editor and apply style at cursor position
        if (textRef.current) {
          textRef.current.focus();
          
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          
          // If there's selected text, apply formatting to it
          if (selection.toString()) {
            // Wrap selected text in a span with the new style
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = 'DM Sans, sans-serif';
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            
            // Move cursor to end of span
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            // No selection, just cursor - insert a styled span for upcoming text
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = 'DM Sans, sans-serif';
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            span.setAttribute('data-style', style);
            span.innerHTML = '&nbsp;'; // Non-breaking space to hold the style
            
            range.insertNode(span);
            
            // Move cursor inside the span
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          
          handleTextInput();
        }
      };

      const currentDefaultSize = getDefaultSizeForStyle(box.textStyle);
      
      return (
        <div 
          className="relative group/box" 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >
          {/* Toolbar - visible only when text box is focused */}
          {showTextBoxToolbar && (
            <div className="absolute left-0 right-0 flex items-center gap-2 bg-white rounded-lg shadow-2xl p-2 border border-gray-200" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
            <div className="flex-1 overflow-x-auto">
              <TextBoxToolbar
                textStyle={currentCursorStyle}
                onTextStyleChange={handleStyleChangeForSelection}
                fontFamily={box.fontFamily || 'DM Sans'}
                onFontFamilyChange={(font) => applyFormatToSelection('fontName', font)}
                fontSize={box.fontSize || currentDefaultSize}
                onIncreaseFontSize={() => {
                  const selection = window.getSelection();
                  if (selection && selection.toString()) {
                    // If text is selected, increase size of selection
                    const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || currentDefaultSize;
                    applyFormatToSelection('fontSize', `${currentSize + 1}px`);
                  } else {
                    // Manually increase from current size
                    onTextBoxUpdate({ fontSize: (box.fontSize || currentDefaultSize) + 1 });
                  }
                }}
                onDecreaseFontSize={() => {
                  const selection = window.getSelection();
                  if (selection && selection.toString()) {
                    // If text is selected, decrease size of selection
                    const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || currentDefaultSize;
                    applyFormatToSelection('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                  } else {
                    // Manually decrease from current size
                    onTextBoxUpdate({ fontSize: Math.max((box.fontSize || currentDefaultSize) - 1, 8) });
                  }
                }}
                onApplyTextStyle={handleApplyTextStyle}
                bold={box.bold || false}
                italic={box.italic || false}
                underline={box.underline || false}
                strikethrough={box.strikethrough || false}
                onToggleBold={() => applyFormatToSelection('bold')}
                onToggleItalic={() => applyFormatToSelection('italic')}
                onToggleUnderline={() => applyFormatToSelection('underline')}
                onToggleStrikethrough={() => applyFormatToSelection('strikeThrough')}
                align={box.align || 'left'}
                onAlign={(align) => {
                  applyFormatToSelection('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'));
                }}
                color={box.color || '#111827'}
                onColorChange={(color) => applyFormatToSelection('foreColor', color)}
                backgroundColor={box.backgroundColor || 'transparent'}
                onBackgroundColorChange={(backgroundColor) => applyFormatToSelection('backColor', backgroundColor)}
                onDelete={handleDoubleClick}
              />
            </div>
            </div>
          )}
          
          {/* Text box ONLY - no border, completely separate from toolbar */}
          <div className="w-full h-full rounded-xl overflow-hidden bg-white relative">
            {/* Custom formatted placeholder - only showing Header and Sub-Header styles */}
            {(!box.text || box.text === '') && (
              <div className="absolute inset-0 p-4 pointer-events-none">
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827', fontFamily: 'DM Sans', marginBottom: '4px', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                  Click Header to apply this style
                </div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111827', fontFamily: 'DM Sans', marginBottom: '6px', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                  Click Sub-Header to apply this style
                </div>
              </div>
            )}
            
            <div 
              ref={textRef}
              contentEditable
              className="kpi-text-editor w-full h-full p-4 overflow-auto outline-none cursor-text relative z-10"
              style={{
                fontFamily: box.fontFamily || 'DM Sans, sans-serif',
                backgroundColor: box.backgroundColor || 'transparent',
                minHeight: '50px',
                letterSpacing: '-0.01em',
                lineHeight: '1.2',
              }}
              onInput={handleTextInput}
              onFocus={(e) => {
                setIsEditing(true);
                setShowTextBoxToolbar(true);
              }}
              onBlur={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                  setIsEditing(false);
                  setShowTextBoxToolbar(false);
                }
              }}
              onClick={updateCursorStyleFromSelection}
              onKeyUp={updateCursorStyleFromSelection}
              onKeyDown={(e) => {
                // Apply current style to new text being typed
                if (e.key.length === 1 || e.key === 'Enter') {
                  const selection = window.getSelection();
                  if (!selection || selection.rangeCount === 0) return;
                  
                  const range = selection.getRangeAt(0);
                  const container = range.commonAncestorContainer;
                  
                  // Check if we're typing in an unstyled area
                  if (container === textRef.current || (container.parentElement === textRef.current && container.nodeType === 3)) {
                    // We're in the root, need to apply styling
                    setTimeout(() => {
                      const sel = window.getSelection();
                      if (!sel || sel.rangeCount === 0) return;
                      
                      const r = sel.getRangeAt(0);
                      const node = r.commonAncestorContainer;
                      
                      if (node.nodeType === 3 && node.parentElement === textRef.current) {
                        // Wrap the text node in a styled span
                        const span = document.createElement('span');
                        const styleToUse = box.textStyle || 'paragraph';
                        const size = getDefaultSizeForStyle(styleToUse);
                        const color = styleToUse === 'paragraph' ? '#6B7280' : '#111827';
                        const bold = styleToUse === 'header' || styleToUse === 'sub-header';
                        
                        span.style.fontSize = `${size}px`;
                        span.style.color = color;
                        span.style.fontWeight = bold ? 'bold' : 'normal';
                        span.style.fontFamily = 'DM Sans, sans-serif';
                        span.style.letterSpacing = '-0.01em';
                        span.style.lineHeight = '1.2';
                        
                        const parent = node.parentElement;
                        if (parent) {
                          parent.insertBefore(span, node);
                          span.appendChild(node);
                        }
                        
                        handleTextInput();
                      }
                    }, 10);
                  }
                }
              }}
              suppressContentEditableWarning
            />
          </div>
        </div>
      );
    }

    // Special handling for insight-panel - editable heading and content with bullets
    if (box.elementType === 'insight-panel') {
      // Ensure default values are set
      const insightsHeading = box.insightsHeading ?? 'KEY INSIGHTS';
      const insightsContent = box.insightsContent ?? '';
      const isInsightsSaved = box.isInsightsSaved ?? false;
      const backgroundColor = box.backgroundColor || 'linear-gradient(135deg, #EBF4FF 0%, #E0F2FE 50%, #DBEAFE 100%)';
      const contentFontFamily = box.fontFamily || 'DM Sans';

      const handleContentInput = () => {
        if (contentRef.current) {
          onTextBoxUpdate({ insightsContent: contentRef.current.innerHTML });
        }
      };

      const handleSaveInsights = () => {
        onTextBoxUpdate({ isInsightsSaved: true });
      };

      const handleEditInsights = () => {
        onTextBoxUpdate({ isInsightsSaved: false });
      };

      // EXACT same format apply as text-box
      // Update toolbar state based on cursor position
      const updateInsightsFormatState = () => {
        if (!contentRef.current) return;
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.nodeType === 3 
          ? range.commonAncestorContainer.parentElement 
          : range.commonAncestorContainer as HTMLElement;
        
        if (element && contentRef.current.contains(element)) {
          const computedStyle = window.getComputedStyle(element);
          
          // Update font size
          const fontSize = parseInt(computedStyle.fontSize) || 16;
          setInsightsFontSize(fontSize);
          
          // Detect text style based on font size (same as text-box)
          if (fontSize >= 34) {
            setInsightsTextStyle('header');
          } else if (fontSize >= 20) {
            setInsightsTextStyle('sub-header');
          } else {
            setInsightsTextStyle('paragraph');
          }
          
          // Update bold
          const fontWeight = computedStyle.fontWeight;
          setInsightsBold(fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 600);
          
          // Update italic
          setInsightsItalic(computedStyle.fontStyle === 'italic');
          
          // Update underline and strikethrough
          const textDecoration = computedStyle.textDecoration;
          setInsightsUnderline(textDecoration.includes('underline'));
          setInsightsStrikethrough(textDecoration.includes('line-through'));
        }
      };

      const applyFormatToContent = (command: string, value?: string) => {
        // Ensure content is focused before executing command
        if (contentRef.current) {
          contentRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleContentInput(); // Save changes immediately
        // Update toolbar state after formatting
        setTimeout(updateInsightsFormatState, 10);
      };

      // Get current font size for the toolbar display
      const getCurrentContentSize = (): number => {
        return insightsFontSize;
      };

      // Get default size based on style - same as text-box
      const getDefaultSizeForInsightsStyle = (style?: TextStyleOption): number => {
        switch (style) {
          case 'header': return 36;
          case 'sub-header': return 22;
          case 'paragraph': return 18;
          default: return 18;
        }
      };

      // Handle style change for Insights - EXACT same as text-box
      const handleInsightsStyleChangeForSelection = (style: TextStyleOption) => {
        const defaultSize = getDefaultSizeForInsightsStyle(style);
        const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
        const isBold = style === 'header' || style === 'sub-header';
        
        // Update the current cursor style
        setInsightsTextStyle(style);
        setInsightsFontSize(defaultSize);
        setInsightsBold(isBold);
        
        // Update the default style for new text
        onTextBoxUpdate({ 
          textStyle: style,
          fontSize: defaultSize,
          color: defaultColor,
          bold: isBold
        });
        
        // Focus the text editor and apply style at cursor position
        if (contentRef.current) {
          contentRef.current.focus();
          
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          
          // If there's selected text, apply formatting to it
          if (selection.toString()) {
            // Wrap selected text in a span with the new style
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = `${contentFontFamily}, sans-serif`;
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            
            // Move cursor to end of span
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            // No selection, just cursor - insert a styled span for upcoming text
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = `${contentFontFamily}, sans-serif`;
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            span.setAttribute('data-style', style);
            span.innerHTML = '&nbsp;'; // Non-breaking space to hold the style
            
            range.insertNode(span);
            
            // Move cursor inside the span
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          
          handleContentInput();
          setTimeout(updateInsightsFormatState, 10);
        }
      };


      // Preview mode - show only formatted insights
      if (isInsightsSaved) {
        return (
          <div 
            className="relative group/box" 
            style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
            onDoubleClick={handleEditInsights}
            title="Double-click to edit"
          >
            <div 
              className="relative w-full h-full rounded-xl overflow-hidden p-6 shadow-md border border-blue-200"
              style={{
                background: backgroundColor
              }}
            >
              {/* Icon and Heading */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center shadow-md">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div 
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: '#1E40AF',
                    fontFamily: 'DM Sans, sans-serif',
                    letterSpacing: '0.05em',
                  }}
                  dangerouslySetInnerHTML={{ __html: insightsHeading || 'KEY INSIGHTS' }}
                />
              </div>

              {/* Content with bullets */}
              <div 
                style={{
                  fontSize: '16px',
                  color: '#111827',
                  fontFamily: 'DM Sans, sans-serif',
                  lineHeight: '1.6',
                }}
                dangerouslySetInnerHTML={{ __html: insightsContent || '<p>Put your insights here</p>' }}
              />
            </div>
          </div>
        );
      }

      // Edit mode - show editable heading and content
      return (
        <div 
          className="relative group/box flex flex-col gap-3" 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >

          {/* Toolbar - visible only when content is focused */}
          {showInsightsToolbar && (
            <div className="absolute left-0 right-0 flex flex-col gap-2" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              {/* Formatting toolbar with background color included */}
              <div className="flex items-center gap-2 bg-white rounded-lg shadow-xl p-2 border border-gray-200">
                <div className="flex-1 overflow-x-auto">
                <TextBoxToolbar
                  textStyle={insightsTextStyle}
                  onTextStyleChange={handleInsightsStyleChangeForSelection}
                  fontFamily={contentFontFamily}
                  onFontFamilyChange={(font) => {
                    applyFormatToContent('fontName', font);
                    onTextBoxUpdate({ fontFamily: font });
                  }}
                    fontSize={insightsFontSize}
                    onIncreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || insightsFontSize;
                        applyFormatToContent('fontSize', `${currentSize + 1}px`);
                      } else {
                        const newSize = insightsFontSize + 1;
                        setInsightsFontSize(newSize);
                        if (contentRef.current) {
                          contentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = contentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleContentInput();
                        }
                      }
                    }}
                    onDecreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || insightsFontSize;
                        applyFormatToContent('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      } else {
                        const newSize = Math.max(insightsFontSize - 1, 8);
                        setInsightsFontSize(newSize);
                        if (contentRef.current) {
                          contentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = contentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleContentInput();
                        }
                      }
                    }}
                    onApplyTextStyle={() => {}}
                    bold={insightsBold}
                    italic={insightsItalic}
                    underline={insightsUnderline}
                    strikethrough={insightsStrikethrough}
                    onToggleBold={() => applyFormatToContent('bold')}
                    onToggleItalic={() => applyFormatToContent('italic')}
                    onToggleUnderline={() => applyFormatToContent('underline')}
                    onToggleStrikethrough={() => applyFormatToContent('strikeThrough')}
                    align="left"
                    onAlign={(align) => applyFormatToContent('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'))}
                    onBulletedList={() => applyFormatToContent('insertUnorderedList')}
                    onNumberedList={() => applyFormatToContent('insertOrderedList')}
                    color="#111827"
                    onColorChange={(color) => applyFormatToContent('foreColor', color)}
                    backgroundColor={backgroundColor}
                    onBackgroundColorChange={(bg) => onTextBoxUpdate({ backgroundColor: bg })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Insights Panel Card */}
          <div className="relative w-full flex-1" style={{ minHeight: 0 }}>
            {/* Change button (top right corner) */}
            <button
              onClick={handleDoubleClick}
              className="absolute -top-2 -right-2 z-20 px-3 py-1 bg-white rounded-full shadow-md border border-gray-200 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Change
            </button>

            <div 
              className="w-full h-full rounded-xl overflow-hidden p-6 shadow-lg border-2 border-blue-300"
              style={{
                background: backgroundColor
              }}
            >
              {/* Icon and Simple Heading */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center shadow-md shrink-0">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <input
                  type="text"
                  value={insightsHeading}
                  onChange={(e) => onTextBoxUpdate({ insightsHeading: e.target.value })}
                  className="flex-1 outline-none cursor-text bg-transparent border-none"
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: '#1E40AF',
                    fontFamily: 'DM Sans, sans-serif',
                    letterSpacing: '0.05em',
                  }}
                  placeholder="KEY INSIGHTS"
                />
              </div>

              {/* Editable Content with Blue Tick Bullets */}
              <div className="relative">
                <div 
                  ref={contentRef}
                  contentEditable
                  className="outline-none cursor-text relative z-10"
                  style={{
                    fontFamily: `${contentFontFamily}, sans-serif`,
                    backgroundColor: 'transparent',
                    minHeight: '50px',
                    fontSize: '16px',
                    lineHeight: '1.8',
                  }}
                  onInput={handleContentInput}
                  onFocus={() => {
                    setIsEditing(true);
                    setShowInsightsToolbar(true);
                    updateInsightsFormatState();
                  }}
                  onBlur={(e) => {
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                      setIsEditing(false);
                      setShowInsightsToolbar(false);
                    }
                  }}
                  onClick={updateInsightsFormatState}
                  onKeyUp={updateInsightsFormatState}
                  onMouseUp={updateInsightsFormatState}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      
                      const selection = window.getSelection();
                      if (!selection || selection.rangeCount === 0) return;
                      
                      const range = selection.getRangeAt(0);
                      
                      // Create new tick bullet line
                      const newLineDiv = document.createElement('div');
                      newLineDiv.style.display = 'flex';
                      newLineDiv.style.alignItems = 'flex-start';
                      newLineDiv.style.marginBottom = '8px';
                      
                      // Create SVG tick icon
                      const svgNS = "http://www.w3.org/2000/svg";
                      const svg = document.createElementNS(svgNS, 'svg');
                      svg.setAttribute('width', '20');
                      svg.setAttribute('height', '20');
                      svg.setAttribute('viewBox', '0 0 20 20');
                      svg.setAttribute('fill', 'none');
                      svg.style.marginRight = '8px';
                      svg.style.marginTop = '2px';
                      svg.style.flexShrink = '0';
                      svg.style.pointerEvents = 'none';
                      
                      const circle = document.createElementNS(svgNS, 'circle');
                      circle.setAttribute('cx', '10');
                      circle.setAttribute('cy', '10');
                      circle.setAttribute('r', '9');
                      circle.setAttribute('stroke', '#1A73E8');
                      circle.setAttribute('stroke-width', '2');
                      circle.setAttribute('fill', 'none');
                      
                      const path = document.createElementNS(svgNS, 'path');
                      path.setAttribute('d', 'M6 10L8.5 12.5L14 7');
                      path.setAttribute('stroke', '#1A73E8');
                      path.setAttribute('stroke-width', '2');
                      path.setAttribute('stroke-linecap', 'round');
                      path.setAttribute('stroke-linejoin', 'round');
                      path.setAttribute('fill', 'none');
                      
                      svg.appendChild(circle);
                      svg.appendChild(path);
                      
                      // Create text span
                      const textSpan = document.createElement('span');
                      textSpan.innerHTML = '&nbsp;';
                      textSpan.style.flex = '1';
                      
                      newLineDiv.appendChild(svg);
                      newLineDiv.appendChild(textSpan);
                      
                      // Insert the new line after current line
                      const currentNode = range.startContainer;
                      let currentLine = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode as HTMLElement;
                      
                      // Find the parent div (tick bullet line)
                      while (currentLine && currentLine !== contentRef.current && currentLine.parentElement !== contentRef.current) {
                        currentLine = currentLine.parentElement;
                      }
                      
                      if (currentLine && currentLine.parentElement === contentRef.current) {
                        // Insert after current line
                        currentLine.parentNode?.insertBefore(newLineDiv, currentLine.nextSibling);
                      } else {
                        // Fallback: append to end
                        contentRef.current?.appendChild(newLineDiv);
                      }
                      
                      // Position cursor in the text span
                      const newRange = document.createRange();
                      newRange.setStart(textSpan.firstChild || textSpan, 0);
                      newRange.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(newRange);
                      
                      handleContentInput();
                    } else if (e.key === 'Backspace') {
                      // Prevent deleting the first tick bullet
                      const allDivs = contentRef.current?.querySelectorAll('div[style*="display: flex"]');
                      if (allDivs && allDivs.length === 1) {
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                          const range = selection.getRangeAt(0);
                          const currentNode = range.startContainer;
                          
                          // Check if we're at the start of the first tick's text
                          if (range.startOffset === 0 || (currentNode.textContent === '\u00A0' && range.startOffset <= 1)) {
                            e.preventDefault();
                            return;
                          }
                        }
                      }
                    }
                  }}
                  suppressContentEditableWarning
                />
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Special handling for Q&A - Two separate text boxes for Question and Answer
    if (box.elementType === 'qa') {
      const qaQuestionContent = box.qaQuestionContent ?? '';
      const qaAnswerContent = box.qaAnswerContent ?? '';
      const isQASaved = box.isQASaved ?? false;
      const qaFontFamily = box.fontFamily || 'DM Sans';
      const qaHasBeenInteracted = box.qaHasBeenInteracted ?? false;

      const handleQuestionInput = () => {
        if (qaQuestionRef.current) {
          onTextBoxUpdate({ qaQuestionContent: qaQuestionRef.current.innerHTML });
        }
      };

      const handleAnswerInput = () => {
        if (qaAnswerRef.current) {
          onTextBoxUpdate({ qaAnswerContent: qaAnswerRef.current.innerHTML });
        }
      };

      const applyFormatToQuestion = (command: string, value?: string) => {
        if (qaQuestionRef.current) {
          qaQuestionRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleQuestionInput();
      };

      const applyFormatToAnswer = (command: string, value?: string) => {
        if (qaAnswerRef.current) {
          qaAnswerRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleAnswerInput();
      };

      // Single container with both Question and Answer sections (always editable)
      return (
        <div 
          className="relative group/box" 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >
          {/* Change button (top right corner) */}
          <button
            onClick={handleDoubleClick}
            className="absolute -top-2 -right-2 z-20 px-3 py-1 bg-white rounded-full shadow-md border border-gray-200 text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors"
          >
            Change
          </button>

          {/* Toolbar - only show when a field is active */}
          {activeQAField && (
            <div className="absolute left-0 right-0 flex items-center gap-2 bg-white rounded-lg shadow-2xl p-2 border border-gray-200" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              <div className="flex-1 overflow-x-auto">
                <TextBoxToolbar
                  textStyle={activeQAField === 'question' ? qaQuestionTextStyle : qaAnswerTextStyle}
                  onTextStyleChange={() => {}}
                  fontFamily={qaFontFamily}
                  onFontFamilyChange={(font) => {
                    if (activeQAField === 'question') {
                      applyFormatToQuestion('fontName', font);
                    } else {
                      applyFormatToAnswer('fontName', font);
                    }
                    onTextBoxUpdate({ fontFamily: font });
                  }}
                  fontSize={activeQAField === 'question' ? qaQuestionFontSize : qaAnswerFontSize}
                  onIncreaseFontSize={() => {
                    const selection = window.getSelection();
                    if (selection && selection.toString()) {
                      const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || (activeQAField === 'question' ? qaQuestionFontSize : qaAnswerFontSize);
                      if (activeQAField === 'question') {
                        applyFormatToQuestion('fontSize', `${currentSize + 1}px`);
                      } else {
                        applyFormatToAnswer('fontSize', `${currentSize + 1}px`);
                      }
                    }
                  }}
                  onDecreaseFontSize={() => {
                    const selection = window.getSelection();
                    if (selection && selection.toString()) {
                      const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || (activeQAField === 'question' ? qaQuestionFontSize : qaAnswerFontSize);
                      if (activeQAField === 'question') {
                        applyFormatToQuestion('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      } else {
                        applyFormatToAnswer('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      }
                    }
                  }}
                  onApplyTextStyle={() => {}}
                  bold={activeQAField === 'question' ? qaQuestionBold : qaAnswerBold}
                  italic={activeQAField === 'question' ? qaQuestionItalic : qaAnswerItalic}
                  underline={activeQAField === 'question' ? qaQuestionUnderline : qaAnswerUnderline}
                  strikethrough={activeQAField === 'question' ? qaQuestionStrikethrough : qaAnswerStrikethrough}
                  onToggleBold={() => activeQAField === 'question' ? applyFormatToQuestion('bold') : applyFormatToAnswer('bold')}
                  onToggleItalic={() => activeQAField === 'question' ? applyFormatToQuestion('italic') : applyFormatToAnswer('italic')}
                  onToggleUnderline={() => activeQAField === 'question' ? applyFormatToQuestion('underline') : applyFormatToAnswer('underline')}
                  onToggleStrikethrough={() => activeQAField === 'question' ? applyFormatToQuestion('strikeThrough') : applyFormatToAnswer('strikeThrough')}
                  align="left"
                  onAlign={(align) => activeQAField === 'question' ? applyFormatToQuestion('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right')) : applyFormatToAnswer('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'))}
                  onBulletedList={() => activeQAField === 'question' ? applyFormatToQuestion('insertUnorderedList') : applyFormatToAnswer('insertUnorderedList')}
                  onNumberedList={() => activeQAField === 'question' ? applyFormatToQuestion('insertOrderedList') : applyFormatToAnswer('insertOrderedList')}
                  color="#111827"
                  onColorChange={(color) => activeQAField === 'question' ? applyFormatToQuestion('foreColor', color) : applyFormatToAnswer('foreColor', color)}
                  backgroundColor="transparent"
                  onBackgroundColorChange={(bg) => activeQAField === 'question' ? applyFormatToQuestion('backColor', bg) : applyFormatToAnswer('backColor', bg)}
                />
              </div>
            </div>
          )}

          {/* Q&A Container - Both Question and Answer with left purple accent bar */}
          <div className="w-full h-full flex gap-3">
            {/* Left Purple Accent Bar */}
            <div className="w-1 bg-gradient-to-b from-purple-400 via-purple-500 to-purple-600 rounded-full" style={{ minHeight: '100%' }}></div>
            
            {/* Q&A Content */}
            <div className="flex-1 flex flex-col gap-3">
            {/* Question Section */}
            <div className="rounded-xl overflow-hidden bg-white shadow-md border border-gray-200">
              <div className="p-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center shadow-md shrink-0">
                    <HelpCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 relative">
                    {(!qaQuestionContent || qaQuestionContent === '' || qaQuestionContent === '<br>') && (
                      <div 
                        className="absolute inset-0 pointer-events-none text-gray-400"
                        style={{
                          fontSize: '22px',
                          fontFamily: 'DM Sans, sans-serif',
                        }}
                      >
                        Question
                      </div>
                    )}
                    <div 
                      ref={qaQuestionRef}
                      contentEditable
                      className="outline-none cursor-text relative z-10 text-gray-800"
                      style={{
                        fontFamily: `${qaFontFamily}, sans-serif`,
                        backgroundColor: 'transparent',
                        minHeight: '40px',
                        fontSize: '22px',
                        lineHeight: '1.6',
                        fontWeight: 'bold',
                      }}
                      onInput={handleQuestionInput}
                    onFocus={() => {
                      setIsEditing(true);
                      setActiveQAField('question');
                      onTextBoxUpdate({ qaHasBeenInteracted: true });
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                        setIsEditing(false);
                        setActiveQAField(null);
                      }
                    }}
                      suppressContentEditableWarning
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Answer Section - Visible initially, hides only if empty after interaction */}
            {(!qaHasBeenInteracted || (qaAnswerContent && qaAnswerContent !== '' && qaAnswerContent !== '<br>') || activeQAField !== null) && (
              <div 
                className="rounded-xl overflow-hidden bg-white shadow-md border border-gray-200 cursor-text"
                onMouseDown={(e) => {
                  // Focus the Answer box when clicking anywhere in the container
                  if (qaAnswerRef.current) {
                    e.preventDefault();
                    qaAnswerRef.current.focus();
                    qaAnswerRef.current.contentEditable = 'true';
                  }
                }}
              >
                <div className="p-2 relative min-h-[80px]">
                  {(!qaAnswerContent || qaAnswerContent === '' || qaAnswerContent === '<br>') && (
                    <div 
                      className="absolute top-2 left-2 pointer-events-none text-gray-400"
                      style={{
                        fontSize: '22px',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      Answer
                    </div>
                  )}
                  <div 
                    ref={qaAnswerRef}
                    contentEditable={true}
                    className="w-full outline-none cursor-text relative z-10 text-gray-800"
                    style={{
                      fontFamily: `${qaFontFamily}, sans-serif`,
                      backgroundColor: 'transparent',
                      minHeight: '60px',
                      fontSize: '22px',
                      lineHeight: '1.6',
                      fontWeight: 'bold',
                    }}
                    onInput={handleAnswerInput}
                    onFocusCapture={() => {
                      setIsEditing(true);
                      setActiveQAField('answer');
                      onTextBoxUpdate({ qaHasBeenInteracted: true });
                    }}
                    onBlurCapture={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                        setIsEditing(false);
                        setActiveQAField(null);
                      }
                    }}
                    onMouseDown={(e) => {
                      // Ensure the div is focused and editable
                      e.stopPropagation();
                      if (qaAnswerRef.current) {
                        qaAnswerRef.current.focus();
                        // Force contentEditable
                        qaAnswerRef.current.contentEditable = 'true';
                      }
                    }}
                    suppressContentEditableWarning
                  />
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      );
    }

    // For other element types, show the standard renderer
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
