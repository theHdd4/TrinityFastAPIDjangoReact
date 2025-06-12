
import React, { useEffect } from 'react';
import { Presentation } from 'lucide-react';
import Header from '@/components/Header';
import { useExhibitionStore } from './store/exhibitionStore';

const ExhibitionMode = () => {
  const { exhibitedCards, cards, loadSavedConfiguration } = useExhibitionStore();

  useEffect(() => {
    if (cards.length === 0) {
      loadSavedConfiguration();
    }
  }, [cards.length, loadSavedConfiguration]);

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      <Header />
      
      {/* Exhibition Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-6 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-light text-gray-900 mb-2">Exhibition Mode</h2>
            <p className="text-gray-600 font-light">Present your laboratory results with beautiful visualizations</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {exhibitedCards.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                <Presentation className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-light text-gray-900 mb-2">No cards to exhibit</h3>
              <p className="text-gray-600 font-light">
                Go to Laboratory mode and toggle "Exhibit the Card" on the cards you want to display here, then click Save.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {exhibitedCards.map((card) => (
              <div key={card.id} className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  {card.moleculeTitle ? (
                    card.atoms.length > 0
                      ? `${card.moleculeTitle} - ${card.atoms[0].title}`
                      : card.moleculeTitle
                  ) : card.atoms.length > 0 ? card.atoms[0].title : 'Card'}
                </h3>
                
                {card.atoms.length === 0 ? (
                  <div className="flex items-center justify-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500">No atoms in this card</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {card.atoms.map((atom) => (
                      <div 
                        key={atom.id}
                        className="p-4 border border-gray-200 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center mb-3">
                          <div className={`w-3 h-3 ${atom.color} rounded-full mr-2`}></div>
                          <h4 className="font-semibold text-gray-900 text-sm">{atom.title}</h4>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{atom.category}</p>
                        <p className="text-xs text-gray-500">
                          Exhibited visualization of {atom.title}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExhibitionMode;
