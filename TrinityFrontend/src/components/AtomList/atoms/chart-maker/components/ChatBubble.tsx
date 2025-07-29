import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, BarChart2, Triangle, Zap } from 'lucide-react';
import './ChatBubble.css';

interface ChatBubbleProps {
  visible: boolean;
  chartType: string;
  onChartTypeSelect: (type: string) => void;
  onClose: () => void;
  onExited?: () => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  visible,
  chartType,
  onChartTypeSelect,
  onClose,
  onExited
}) => {
  const [shouldRender, setShouldRender] = useState(visible);
  const [animatingOut, setAnimatingOut] = useState(false);

  const graphOptions = [
    { icon: <BarChart3 />, label: 'bar', displayName: 'Bar' },
    { icon: <TrendingUp />, label: 'line', displayName: 'Line' },
    { icon: <Triangle />, label: 'area', displayName: 'Area' },
    { icon: <Zap />, label: 'scatter', displayName: 'Scatter' },
    { icon: <BarChart2 />, label: 'pie', displayName: 'Pie' },
  ];

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setAnimatingOut(false);
    } else if (shouldRender) {
      setAnimatingOut(true);
      // Don't immediately set shouldRender to false - wait for animation
    }
  }, [visible, shouldRender]);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.animationName === 'bubbleDropOut' && animatingOut) {
      setShouldRender(false);
      setAnimatingOut(false);
      if (onExited) onExited(); // Notify parent that animation is complete
    }
  };

  if (!shouldRender) return null;

  return (
    <div 
      className={`chat-bubble ${animatingOut ? 'animating-out' : ''}`}
      onAnimationEnd={handleAnimationEnd}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'fit-content',
        minWidth: '0',
        zIndex: 4000
      }}
    >
      <div 
        className="bubble-container" 
        style={{ padding: '6px 8px', gap: '4px', minWidth: '0' }}
      >
        {graphOptions.map((option) => (
          <button
            key={option.label}
            className={`chart-type-btn ${chartType === option.label ? 'active' : ''}`}
            style={{ width: 32, height: 32, fontSize: 14, padding: 0, margin: 0 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChartTypeSelect(option.label);
            }}
            title={`${option.displayName} Chart`}
          >
            {option.icon}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChatBubble;
