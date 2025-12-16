import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';

import { fetchSharedDashboardLayout, type DashboardLayoutResponse } from '@/lib/dashboard';
import { Button } from '@/components/ui/button';
import AnimatedLogo from '@/components/PrimaryMenu/TrinityAssets/AnimatedLogo';
import ExhibitedAtomRenderer from '@/components/ExhibitionMode/components/ExhibitedAtomRenderer';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type SharedMetadata = {
    client_name: string;
    app_name: string;
    project_name: string;
    updated_at?: string | null;
};

const SharedDashboard = () => {
    const { token } = useParams<{ token: string }>();

    const [status, setStatus] = useState<LoadState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<SharedMetadata | null>(null);
    const [cards, setCards] = useState<any[]>([]);

    useEffect(() => {
        let cancelled = false;

        const loadSharedLayout = async () => {
            if (!token) {
                setStatus('error');
                setError('Share link is missing.');
                return;
            }

            setStatus('loading');
            setError(null);

            try {
                const response = await fetchSharedDashboardLayout(token);
                if (cancelled) {
                    return;
                }

                if (!response) {
                    setStatus('error');
                    setError('The requested dashboard could not be found.');
                    return;
                }

                setCards(response.cards);
                setMetadata({
                    client_name: response.client_name,
                    app_name: response.app_name,
                    project_name: response.project_name,
                    updated_at: response.updated_at,
                });
                setStatus('ready');
            } catch (err) {
                if (cancelled) {
                    return;
                }
                console.error('Failed to load shared dashboard', err);
                setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
                setStatus('error');
            }
        };

        void loadSharedLayout();

        return () => {
            cancelled = true;
        };
    }, [token]);


    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        const originalTitle = document.title;
        if (status === 'ready' && metadata) {
            const project = metadata.project_name || 'Shared Dashboard';
            document.title = `${project} · Trinity Dashboard`;
        } else {
            document.title = 'Shared Dashboard · Trinity';
        }

        return () => {
            document.title = originalTitle;
        };
    }, [metadata, status]);

    const updatedLabel = useMemo(() => {
        if (!metadata?.updated_at) {
            return null;
        }

        try {
            return new Date(metadata.updated_at).toLocaleString();
        } catch {
            return metadata.updated_at;
        }
    }, [metadata?.updated_at]);

    const headerTitle = metadata?.project_name ?? 'Shared Dashboard';

    const renderContent = () => {
        if (status === 'loading' || status === 'idle') {
            return (
                <div className="flex flex-col items-center justify-center py-24 text-white/80 space-y-6 animate-in fade-in">
                    <div className="relative">
                        <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
                        <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-xl animate-pulse" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-base font-semibold">Loading dashboard…</p>
                        <p className="text-xs text-white/50">Please wait while we fetch your shared dashboard</p>
                    </div>
                </div>
            );
        }

        if (status === 'error') {
            return (
                <div className="max-w-xl mx-auto bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent border border-red-500/30 rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-center space-y-6 text-red-100 shadow-xl backdrop-blur-sm">
                    <div className="relative inline-block">
                        <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
                        <div className="absolute inset-0 bg-red-400/20 rounded-full blur-xl -z-10" />
                    </div>
                    <div className="space-y-2">
                        <p className="font-bold text-xl text-white">We couldn't open this dashboard</p>
                        <p className="text-sm text-red-100/80">{error ?? 'Please check the link or request a new one.'}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                        <Button variant="secondary" className="bg-white text-slate-900 hover:bg-white/90 shadow-lg" asChild>
                            <Link to="/login">Sign in to Trinity</Link>
                        </Button>
                        <Button variant="ghost" className="text-white hover:bg-white/10 border border-white/20" asChild>
                            <Link to="/">Go back home</Link>
                        </Button>
                    </div>
                </div>
            );
        }

        if (cards.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-24 text-white/70 space-y-6 animate-in fade-in">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                            <AlertCircle className="h-8 w-8 text-white/40" />
                        </div>
                        <div className="absolute inset-0 bg-white/5 rounded-2xl blur-xl -z-10" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-base font-semibold text-white/90">Empty Dashboard</p>
                        <p className="text-sm text-white/50">This dashboard doesn't contain any cards yet.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-6 sm:gap-8">
                {cards.map((card, cardIndex) => (
                    <div 
                        key={card.id} 
                        className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-6" 
                        style={{ animationDelay: `${cardIndex * 100}ms` }}
                    >
                        {card.atoms.map((atom: any, atomIndex: number) => {
                            // Special handling for chart-maker and correlation: render directly without fancy card wrapper
                            if (atom.atomId === 'chart-maker' || atom.atomId === 'correlation') {
                                return (
                                    <div
                                        key={atom.id}
                                        className="animate-in fade-in slide-in-from-bottom-6"
                                        style={{ animationDelay: `${(cardIndex * 100) + (atomIndex * 50)}ms` }}
                                    >
                                        <ExhibitedAtomRenderer
                                            atom={atom}
                                            variant="full"
                                        />
                                    </div>
                                );
                            }

                            // Regular fancy card for other atom types
                            return (
                                <div 
                                    key={atom.id} 
                                    className="group relative bg-gradient-to-br from-white/10 via-white/5 to-white/0 backdrop-blur-sm border border-white/20 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 touch-manipulation hover:border-white/30 hover:scale-[1.01]"
                                    style={{ animationDelay: `${(cardIndex * 100) + (atomIndex * 50)}ms` }}
                                >
                                    {/* Decorative gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                    
                                    {/* Card header with improved styling */}
                                    <div className="relative p-4 sm:p-6 border-b border-white/10 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {/* Atom type indicator dot */}
                                                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 shadow-lg shadow-blue-500/50" />
                                                <h3 className="font-semibold text-base sm:text-lg text-white/95 truncate pr-2">
                                                    {atom.title || 'Untitled Atom'}
                                                </h3>
                                            </div>
                                            {/* Subtle icon indicator */}
                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <div className="w-2 h-2 rounded-full bg-white/40" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Card content with improved padding */}
                                    <div className="relative p-4 sm:p-6 bg-gradient-to-b from-white/5 to-transparent">
                                        <ExhibitedAtomRenderer
                                            atom={atom}
                                            variant="full"
                                        />
                                    </div>
                                    
                                    {/* Bottom accent line */}
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 via-purple-950/20 to-slate-950 text-white relative overflow-hidden">
            {/* Animated background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 -left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-0 -right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            </div>
            
            {/* Compact Sticky Header */}
            <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-white/10 shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
                    <div className="flex items-center justify-between gap-4">
                        {/* Left Section: Branding */}
                        <div className="flex items-center space-x-3 flex-shrink-0">
                            <AnimatedLogo className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                            <div className="flex flex-col justify-center">
                                <span className="font-mono font-bold text-lg sm:text-xl text-white leading-tight">
                                    Trinity
                                </span>
                            </div>
                        </div>
                        
                        {/* Center Section: Project Name */}
                        <div className="flex-1 flex items-center justify-center px-4 min-w-0">
                            <h1 className="text-xs sm:text-base md:text-lg lg:text-xl font-semibold text-white truncate max-w-full">
                                {headerTitle}
                            </h1>
                        </div>
                        
                        {/* Right Section: Spacer for balance */}
                        <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0" />
                    </div>
                </div>
            </header>

            <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                <div className="relative z-10">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default SharedDashboard;
