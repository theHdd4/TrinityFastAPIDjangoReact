import React from 'react';
import { cn } from '@/lib/utils';
import { SlideCanvas, CANVAS_STAGE_HEIGHT, DEFAULT_PRESENTATION_WIDTH } from './slideCanvas';
import { type LayoutCard, DEFAULT_PRESENTATION_SETTINGS } from '../store/exhibitionStore';

const CARD_WIDTH_DIMENSIONS = {
  M: 832,
  L: 1088,
} as const;

const PREVIEW_BASE_HEIGHT = CANVAS_STAGE_HEIGHT;
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

    const previewBaseWidth = React.useMemo(() => {
      const cardWidth = card.presentationSettings?.cardWidth ?? DEFAULT_PRESENTATION_SETTINGS.cardWidth;
      return CARD_WIDTH_DIMENSIONS[cardWidth] ?? DEFAULT_PRESENTATION_WIDTH;
    }, [card.presentationSettings?.cardWidth]);

    const previewRatio = React.useMemo(() => {
      return PREVIEW_BASE_HEIGHT / previewBaseWidth;
    }, [previewBaseWidth]);

    React.useEffect(() => {
      const node = containerRef.current;
      if (!node) {
        return;
      }

      const updateScale = (width: number) => {
        if (!Number.isFinite(width) || width <= 0) {
          return;
        }
        const nextScale = Math.min(Math.max(width / previewBaseWidth, MIN_SCALE), 1);
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
    }, [previewBaseWidth]);

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative w-full overflow-hidden rounded-lg border border-border bg-background/70',
          'shadow-sm transition-colors duration-200',
          className,
        )}
        style={{ paddingBottom: `${previewRatio * 100}%` }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="pointer-events-none"
            style={{
              width: previewBaseWidth,
              height: PREVIEW_BASE_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
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
              presentationMode={true}
              viewMode="horizontal"
              variant="preview"
            />
          </div>
        </div>
      </div>
    );
  },
);

SlidePreview.displayName = 'SlidePreview';

export default SlidePreview;
