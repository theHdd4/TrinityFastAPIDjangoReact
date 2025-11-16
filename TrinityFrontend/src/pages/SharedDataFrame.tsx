import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SHARE_LINKS_API } from '@/lib/api';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface SharedDataFrameInfo {
  object_name: string;
  client_name: string;
  app_name: string;
  project_name: string;
  created_at?: string | null;
  expires_at?: string | null;
}

const SharedDataFrame: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSharedDataFrame = async () => {
      if (!token) {
        setStatus('error');
        setError('Share link is missing.');
        return;
      }

      setStatus('loading');
      setError(null);

      try {
        const response = await fetch(`${SHARE_LINKS_API}/dataframe/shared/${encodeURIComponent(token)}/`, {
          method: 'GET',
          credentials: 'omit', // Public access, no auth needed
        });

        if (cancelled) {
          return;
        }

        if (response.status === 404) {
          setStatus('error');
          setError('The requested dataframe could not be found or the link has expired.');
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMessage = errorData?.detail || `HTTP ${response.status}: ${response.statusText}`;
          setStatus('error');
          setError(errorMessage);
          return;
        }

        const data = await response.json() as SharedDataFrameInfo;
        
        if (cancelled) {
          return;
        }

        // Redirect to the same interface as clicking on filename
        // This opens the dataframe view directly, same as handleOpen does
        navigate(`/dataframe?name=${encodeURIComponent(data.object_name)}`, { replace: true });
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load shared dataframe', err);
        setError(err instanceof Error ? err.message : 'Unable to load dataframe.');
        setStatus('error');
      }
    };

    void loadSharedDataFrame();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  // Show loading or error state while resolving the token
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          <p className="text-sm text-white/80">Loading dataframe…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="max-w-xl mx-auto bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center space-y-4 text-red-100">
          <AlertCircle className="h-10 w-10 mx-auto" />
          <div>
            <p className="font-semibold text-lg">We couldn't open this dataframe</p>
            <p className="text-sm text-red-100/80 mt-2">{error ?? 'Please check the link or request a new one.'}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button variant="secondary" className="bg-white text-slate-900" asChild>
              <Link to="/login">Sign in to Trinity</Link>
            </Button>
            <Button variant="ghost" className="text-white" asChild>
              <Link to="/">Go back home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // This should not be reached as we redirect on success, but just in case
  return null;
};

export default SharedDataFrame;

