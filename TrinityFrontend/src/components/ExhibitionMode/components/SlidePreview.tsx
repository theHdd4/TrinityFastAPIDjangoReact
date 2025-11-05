import React from 'react';
import { cn } from '@/lib/utils';
import {
  SlideCanvas,
  CANVAS_STAGE_HEIGHT,
  DEFAULT_PRESENTATION_WIDTH,
} from './SlideCanvas';
import { useExhibitionStore, type LayoutCard } from '../store/exhibitionStore';
import { buildPreviewSlideObjects } from './utils/preview';

const PREVIEW_BASE_WIDTH = DEFAULT_PRESENTATION_WIDTH;
const PREVIEW_BASE_HEIGHT = CANVAS_STAGE_HEIGHT;
const PREVIEW_RATIO = PREVIEW_BASE_HEIGHT / PREVIEW_BASE_WIDTH;
const FALLBACK_SCALE = 0.25;
const MIN_SCALE = 0.05;

const noop = () => {
  /* no-op for preview interactions */
};

interface SlidePreviewProps {
  card: LayoutCard;
  index: number;
  totalSlides: number;
  className?: string;
}

export const SlidePreview: React.FC<SlidePreviewProps> = React.memo(
  ({ card, index, totalSlides, className }) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = React.useState<number>(FALLBACK_SCALE);
    const storeObjects = useExhibitionStore(
      React.useCallback(state => state.slideObjectsByCardId[card.id] ?? [], [card.id]),
    );
    const previewObjects = React.useMemo(
      () => buildPreviewSlideObjects(card, storeObjects),
      [card, storeObjects],
    );

    React.useEffect(() => {
      const node = containerRef.current;
      if (!node) {
        return;
      }

      const updateScale = (width: number) => {
        if (!Number.isFinite(width) || width <= 0) {
          return;
        }
        const nextScale = Math.min(Math.max(width / PREVIEW_BASE_WIDTH, MIN_SCALE), 1);
        setScale(previous => (Math.abs(previous - nextScale) < 0.005 ? previous : nextScale));
      };

      updateScale(node.clientWidth);

      if (typeof ResizeObserver !== 'function') {
        return;
      }

      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          updateScale(entry.contentRect.width);
        }
      });

      observer.observe(node);

      return () => {
        observer.disconnect();
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative w-full overflow-hidden rounded-lg border border-border bg-background/70',
          'shadow-sm transition-colors duration-200',
          className,
        )}
        style={{ paddingBottom: `${PREVIEW_RATIO * 100}%` }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="pointer-events-none origin-top-left"
            style={{
              width: PREVIEW_BASE_WIDTH,
              height: PREVIEW_BASE_HEIGHT,
              transform: `scale(${scale})`,
            }}
            aria-hidden
          >
            <SlideCanvas
              key={card.id}
              card={card}
              slideNumber={index + 1}
              totalSlides={totalSlides}
              onDrop={noop}
              draggedAtom={null}
              canEdit={false}
              presentationMode
              presentationPadding={0}
              viewMode="horizontal"
              previewObjects={previewObjects}
            />
          </div>
        </div>
      </div>
    );
  },
);

SlidePreview.displayName = 'SlidePreview';

export default SlidePreview;
