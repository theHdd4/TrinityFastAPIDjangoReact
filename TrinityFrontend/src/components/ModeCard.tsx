
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, LucideIcon } from 'lucide-react';

interface ModeCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  onClick: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({
  title,
  description,
  icon: Icon,
  color,
  bgColor,
  onClick
}) => {
  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-300 border-0 bg-white group cursor-pointer" onClick={onClick}>
      <div className="flex items-start space-x-4">
        <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
        
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 mb-4 leading-relaxed">{description}</p>
          
          <Button 
            variant="ghost" 
            className={`${color} hover:bg-gray-50 p-0 h-auto font-medium group-hover:translate-x-1 transition-transform duration-300`}
          >
            Get Started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ModeCard;
