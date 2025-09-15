import React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useLaboratoryStore,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
  FeatureOverviewSettings as SettingsType,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import FeatureOverviewCanvas from './components/FeatureOverviewCanvas';

interface Props {
  atomId: string;
}

const FeatureOverviewAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };
  const { toast } = useToast();

  const prevLoading = React.useRef(false);

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (settings.isLoading) {
      const quotes = [
        'You hit that back button... the story ends, you wake up in your bed and believe whatever you want to believe. You take a closer look at that data - at your curiosity.. you stay in Wonderland.',
        'Some Analysts go their entire lives without hearing news that good',
        'To deny our own impulses is to deny the very thing that makes us human',
      ];
      let idx = 0;
      const show = () => {
        toast({ title: quotes[idx % quotes.length] });
        idx++;
      };
      show();
      timer = setInterval(show, 5000);
    } else if (prevLoading.current) {
      if (Array.isArray(settings.columnSummary) && settings.columnSummary.length > 0) {
        toast({
          title:
            "Success! But there's a difference between knowing the path and walking the path.",
        });
      }
    }

    prevLoading.current = settings.isLoading;
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [settings.isLoading, toast]);

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      {settings.isLoading ? (
        <div className="flex-grow flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : (
        <FeatureOverviewCanvas
          settings={settings}
          onUpdateSettings={s => updateSettings(atomId, s)}
          atomId={atomId}
        />
      )}
    </div>
  );
};

export default FeatureOverviewAtom;
