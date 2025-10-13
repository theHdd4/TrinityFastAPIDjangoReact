import React from 'react';
import TextBoxDisplay from '@/components/AtomList/atoms/text-box/TextBoxDisplay';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DroppedAtom } from '../store/exhibitionStore';
import FeatureOverviewSlideVisualization from './FeatureOverviewSlideVisualization';

interface ExhibitedAtomRendererProps {
  atom: DroppedAtom;
  variant?: 'full' | 'compact';
}

const humanize = (value: string): string => {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());
};

const formatValue = (value: unknown): string => {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DefaultExhibitedAtom: React.FC<ExhibitedAtomRendererProps> = ({ atom, variant }) => {
  const metadata = isRecord(atom.metadata) ? atom.metadata : {};
  const simpleEntries = Object.entries(metadata).filter(([, value]) =>
    value == null || ['string', 'number', 'boolean'].includes(typeof value),
  );
  const complexEntries = Object.entries(metadata).filter(([, value]) =>
    value != null && typeof value === 'object',
  );

  if (simpleEntries.length === 0 && complexEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This component is ready for exhibition. Configure it in Laboratory mode to capture a
        visual preview.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {simpleEntries.length > 0 && (
        <dl
          className={cn(
            'grid gap-2 text-sm',
            variant === 'compact' ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {simpleEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-muted/30 p-3">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">
                {humanize(key)}
              </dt>
              <dd className="text-sm text-foreground">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {complexEntries.map(([key, value]) => (
        <div key={key} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {humanize(key)}
          </p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
};

const ExhibitedAtomRenderer: React.FC<ExhibitedAtomRendererProps> = ({ atom, variant = 'full' }) => {
  if (atom.atomId === 'text-box') {
    return (
      <div className={cn('rounded-2xl border border-border bg-muted/30 p-4', variant === 'compact' && 'p-3')}>
        <TextBoxDisplay textId={atom.id} />
      </div>
    );
  }

  if (atom.atomId === 'feature-overview') {
    return <FeatureOverviewSlideVisualization metadata={atom.metadata} variant={variant} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="bg-muted text-foreground">
          {humanize(atom.atomId)}
        </Badge>
        <Badge variant="outline" className="text-xs uppercase">
          {atom.category}
        </Badge>
      </div>
      <DefaultExhibitedAtom atom={atom} variant={variant} />
    </div>
  );
};

export default ExhibitedAtomRenderer;
