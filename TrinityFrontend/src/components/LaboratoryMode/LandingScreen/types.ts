import type { FilePrimingStatus } from '../hooks/useLaboratoryScenario';

export interface LandingScreenFile {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
  size?: number;
}

export interface LandingScreenProps {
  files: LandingScreenFile[];
  primingStatuses: FilePrimingStatus[];
  primedCount: number;
  unprimedCount: number;
  inProgressCount: number;
}

export interface StatusSummaryProps {
  primedCount: number;
  unprimedCount: number;
  totalCount: number;
}

export interface ActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  icon?: React.ReactNode;
}


