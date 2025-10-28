import React from 'react';
import { Palette, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useExhibitionStore } from '../../../store/exhibitionStore';
import { EXHIBITION_THEME_PRESETS } from '../../../themes';

interface ThemesPanelProps {
  onClose: () => void;
}

const resolveBackgroundStyle = (value: string): React.CSSProperties => {
  if (value.startsWith('linear-gradient')) {
    return {
      backgroundImage: value,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { backgroundColor: value };
};

const resolveGradientSwatchStyle = (value: string): React.CSSProperties => {
  if (!value) {
    return {};
  }

  if (value.startsWith('linear-gradient')) {
    return {
      backgroundImage: value,
      backgroundSize: '180% 180%',
      backgroundPosition: 'center',
    };
  }

  return {
    backgroundColor: value,
  };
};

export const ThemesPanel: React.FC<ThemesPanelProps> = ({ onClose }) => {
  const activeTheme = useExhibitionStore(state => state.activeTheme);
  const applyTheme = useExhibitionStore(state => state.applyTheme);

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl flex flex-col max-h-full overflow-hidden">
      <div className="relative flex items-center justify-between overflow-hidden border-b border-border/60 px-5 py-4">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-400/20" aria-hidden />
        <div className="absolute -top-12 -right-6 h-24 w-24 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/30 bg-white/20 text-white backdrop-blur">
            <Palette className="h-4 w-4" />
          </span>
          <div className="space-y-0.5">
            <h3 className="text-lg font-semibold text-foreground">Themes</h3>
            <p className="text-xs text-muted-foreground">Refresh your slides with curated palettes.</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="relative h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="max-h-[70vh] pr-2">
        <div className="space-y-4 px-5 py-5 pb-6">
          {EXHIBITION_THEME_PRESETS.map((theme, index) => {
            const isActive = theme.id === activeTheme.id;
            const accentStyle = resolveGradientSwatchStyle(theme.gradients.accent || theme.colors.accent);
            const primaryStyle = resolveGradientSwatchStyle(theme.gradients.primary || theme.colors.primary);
            const secondaryStyle = resolveGradientSwatchStyle(theme.gradients.secondary || theme.colors.secondary);
            const backgroundStyle = resolveBackgroundStyle(theme.gradients.background || theme.colors.background);

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => applyTheme(theme)}
                style={{ animationDelay: `${index * 40}ms` }}
                className={cn(
                  'group relative w-full overflow-hidden rounded-2xl border bg-card/80 p-4 text-left transition-all duration-200',
                  'hover:translate-y-[-2px] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isActive
                    ? 'border-primary/80 shadow-lg ring-2 ring-primary/20'
                    : 'border-border/60 hover:border-primary/60',
                )}
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{
                  backgroundImage: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(236,72,153,0.12) 100%)',
                }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{theme.name}</h4>
                    <p className="text-xs leading-relaxed text-muted-foreground">{theme.description}</p>
                  </div>
                  {isActive && (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>

                <div className="relative mt-4 space-y-3">
                  <div className="flex gap-2">
                    <div
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl shadow-md"
                      style={backgroundStyle}
                      aria-hidden
                    >
                      <div className="absolute inset-0 bg-white/0 transition-opacity duration-300 group-hover:bg-white/10" />
                    </div>
                    <div className="grid flex-1 grid-cols-4 gap-2">
                      <div
                        className="relative h-12 w-full overflow-hidden rounded-lg shadow-sm"
                        style={primaryStyle}
                        title="Primary"
                      >
                        <div className="absolute inset-0 bg-white/0 transition-opacity duration-300 group-hover:bg-white/10" />
                      </div>
                      <div
                        className="relative h-12 w-full overflow-hidden rounded-lg shadow-sm"
                        style={secondaryStyle}
                        title="Secondary"
                      >
                        <div className="absolute inset-0 bg-white/0 transition-opacity duration-300 group-hover:bg-white/10" />
                      </div>
                      <div
                        className="relative h-12 w-full overflow-hidden rounded-lg shadow-sm"
                        style={accentStyle}
                        title="Accent"
                      >
                        <div className="absolute inset-0 bg-white/0 transition-opacity duration-300 group-hover:bg-white/10" />
                      </div>
                      <div
                        className="relative h-12 w-full overflow-hidden rounded-lg border border-border/40 bg-muted/40 shadow-inner"
                        style={backgroundStyle}
                        title="Background"
                      >
                        <div className="absolute inset-0 bg-white/0 transition-opacity duration-300 group-hover:bg-white/5" />
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/60 p-3"
                    style={{
                      backgroundColor: theme.colors.muted,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{
                      backgroundImage: theme.gradients.primary,
                      opacity: 0.08,
                    }}
                    />
                    <div
                      className="relative text-sm font-semibold"
                      style={{
                        color: theme.colors.foreground,
                        fontFamily: theme.fonts.heading,
                      }}
                    >
                      Quick Brown Fox
                    </div>
                    <div
                      className="relative text-xs opacity-80"
                      style={{
                        color: theme.colors.foreground,
                        fontFamily: theme.fonts.body,
                      }}
                    >
                      Beautiful typography
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide">
                    <span className="rounded-md border border-border/50 bg-background/80 px-2 py-1">
                      {theme.fonts.heading}
                    </span>
                    <span className="rounded-md border border-border/50 bg-background/80 px-2 py-1">
                      {theme.fonts.body}
                    </span>
                    <span className="ml-auto rounded-md border border-border/40 bg-muted/40 px-2 py-1 text-[0.6rem] normal-case">
                      {theme.effects.borderRadius} corners
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ThemesPanel;
