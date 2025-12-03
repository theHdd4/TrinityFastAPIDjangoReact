import React from 'react';
import { ElementType } from './ElementDropdown';
import { TrendingUp, MessageSquare, Type, Zap, FileText, Grid3x3, BarChart3, Table2, ImageIcon } from 'lucide-react';

interface ElementRendererProps {
  type: ElementType;
}

const ElementRenderer: React.FC<ElementRendererProps> = ({ type }) => {
  const renderContent = () => {
    switch (type) {
      case 'text-box':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <Type className="w-8 h-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Text Box</p>
            <p className="text-xs text-muted-foreground text-center px-4">
              Add formatted text content, headings, and paragraphs
            </p>
          </div>
        );
      
      case 'metric-card':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <TrendingUp className="w-8 h-8 text-secondary" />
            <p className="text-2xl font-bold text-foreground">24.5K</p>
            <p className="text-xs text-muted-foreground">Sample Metric</p>
            <div className="flex items-center gap-1 text-xs font-semibold text-secondary">
              <TrendingUp className="w-3 h-3" />
              +12.3%
            </div>
          </div>
        );
      
      case 'insight-panel':
        return (
          <div className="flex flex-col h-full p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <p className="text-sm font-bold text-accent uppercase">Key Insights</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-foreground">• Sample insight point about data trends</p>
              <p className="text-xs text-foreground">• Another important observation</p>
            </div>
          </div>
        );
      
      case 'qa':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <MessageSquare className="w-8 h-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Q&A Section</p>
            <p className="text-xs text-muted-foreground text-center px-4">
              Interactive question and answer format
            </p>
          </div>
        );
      
      case 'caption':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <FileText className="w-8 h-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Caption</p>
            <p className="text-xs text-muted-foreground text-center px-4">
              Add descriptive captions and labels
            </p>
          </div>
        );
      
      case 'interactive-blocks':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <Grid3x3 className="w-8 h-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Interactive Blocks</p>
            <p className="text-xs text-muted-foreground text-center px-4">
              Dynamic interactive components
            </p>
          </div>
        );
      
      case 'chart':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <BarChart3 className="w-8 h-8 text-blue-500" />
            <p className="text-sm font-medium text-foreground">Chart</p>
            <div className="flex gap-1 items-end">
              <div className="w-4 h-6 bg-blue-400 rounded-sm"></div>
              <div className="w-4 h-10 bg-blue-500 rounded-sm"></div>
              <div className="w-4 h-8 bg-blue-400 rounded-sm"></div>
              <div className="w-4 h-12 bg-blue-600 rounded-sm"></div>
            </div>
            <p className="text-xs text-muted-foreground text-center px-4">
              Visualize data with charts and graphs
            </p>
          </div>
        );
      
      case 'table':
        return (
          <div className="flex flex-col h-full p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Table2 className="w-5 h-5 text-green-600" />
              <p className="text-sm font-bold text-foreground">Data Table</p>
            </div>
            <div className="flex-1 border border-border/40 rounded overflow-hidden">
              <div className="grid grid-cols-3 gap-px bg-border/40">
                <div className="bg-green-50 p-2 text-xs font-semibold text-green-800">Header 1</div>
                <div className="bg-green-50 p-2 text-xs font-semibold text-green-800">Header 2</div>
                <div className="bg-green-50 p-2 text-xs font-semibold text-green-800">Header 3</div>
                <div className="bg-background p-2 text-xs text-foreground">Data 1</div>
                <div className="bg-background p-2 text-xs text-foreground">Data 2</div>
                <div className="bg-background p-2 text-xs text-foreground">Data 3</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Display structured data in table format</p>
          </div>
        );
      
      case 'image':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center border-2 border-purple-200">
              <ImageIcon className="w-8 h-8 text-purple-500" />
            </div>
            <p className="text-sm font-medium text-foreground">Image</p>
            <p className="text-xs text-muted-foreground text-center px-4">
              Add images, logos, and visual content
            </p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full min-h-[120px] bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border-2 border-primary/30 p-4">
      {renderContent()}
    </div>
  );
};

export default ElementRenderer;

