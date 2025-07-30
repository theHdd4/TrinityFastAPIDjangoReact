
import React from 'react';
import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface App {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  templates: string[];
  color: string;
  borderColor: string;
}

interface AppCardProps {
  app: App;
  onSelect: () => void;
  displayName?: string;
}

const AppCard: React.FC<AppCardProps> = ({ app, onSelect, displayName }) => {
  const Icon = app.icon;

  return (
    <Card
      className={`bg-white ${app.borderColor} hover:border-trinity-yellow transition-all duration-300 cursor-pointer hover:shadow border`}
      onClick={onSelect}
    >
      <div className="p-8 h-80 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className={`w-16 h-16 rounded-xl ${app.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
          <div className="w-2 h-2 bg-trinity-green rounded-full animate-pulse opacity-60"></div>
        </div>
        
        {/* Content */}
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-semibold text-black mb-3 group-hover:text-black/80 transition-colors duration-300">
            {displayName || app.title}
          </h3>
          <p className="text-black/70 text-sm mb-6 leading-relaxed flex-1">
            {app.description}
          </p>
          
          {/* Templates */}
          {app.templates.length > 0 && (
            <div className="mb-4">
              <p className="text-black/50 text-xs mb-2">Includes:</p>
              <div className="flex flex-wrap gap-2">
                {app.templates.map((template, index) => (
                  <span 
                    key={index}
                    className="px-3 py-1 bg-trinity-yellow/10 border border-trinity-yellow/20 rounded-full text-black text-xs"
                  >
                    {template}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Action Indicator */}
          <div className="flex items-center justify-between">
            <span className="text-black/70 text-xs">
              Click to initialize
            </span>
            <div className="w-6 h-6 border border-trinity-yellow/40 rounded-full flex items-center justify-center group-hover:border-trinity-yellow group-hover:bg-trinity-yellow/10 transition-all duration-300">
              <div className="w-2 h-2 bg-trinity-yellow/60 rounded-full group-hover:bg-trinity-yellow transition-colors duration-300"></div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AppCard;
