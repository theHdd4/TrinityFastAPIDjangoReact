import React, { useState, useEffect } from 'react';
import { TRINITY_V1_ATOMS_API } from '@/lib/api';

interface AtomTooltipProps {
  atomId: string;
  children: React.ReactNode;
}

interface AtomDescription {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
}

const AtomTooltip: React.FC<AtomTooltipProps> = ({ atomId, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [atomDescription, setAtomDescription] = useState<AtomDescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAtomDescription = async () => {
    if (atomDescription || loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${TRINITY_V1_ATOMS_API}/atoms/${atomId}/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAtomDescription(data);
      } else if (response.status === 404) {
        setError('Atom description not found');
      } else {
        setError('Failed to fetch atom description');
      }
    } catch (err) {
      setError('Error fetching atom description');
      console.error('Error fetching atom description:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    setIsVisible(true);
    fetchAtomDescription();
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {isVisible && (
        <div className="absolute z-50 w-36 max-h-64 p-3 bg-white border border-gray-200 rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 left-1/2 bottom-full mb-2 overflow-y-auto">
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
          
          {loading && (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            </div>
          )}
          
          {error && (
            <div className="text-red-500 text-xs">
              {error}
            </div>
          )}
          
          {atomDescription && (
            <div className="space-y-2">
              <div>
                <h4 className="font-semibold text-gray-900 text-xs mb-1 leading-tight">
                  {atomDescription.title}
                </h4>
                <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full">
                  {atomDescription.category}
                </span>
              </div>
              
              <p className="text-[10px] text-gray-700 leading-relaxed break-words">
                {atomDescription.description}
              </p>
              
              {atomDescription.tags && atomDescription.tags.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {atomDescription.tags.slice(0, 2).map((tag, index) => (
                    <span 
                      key={index}
                      className="px-1 py-0.5 bg-gray-100 text-gray-700 text-[9px] rounded break-words"
                    >
                      {tag}
                    </span>
                  ))}
                  {atomDescription.tags.length > 2 && (
                    <span className="text-[9px] text-gray-500">+{atomDescription.tags.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AtomTooltip;
