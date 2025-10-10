/**
 * Use Case Specific Molecules Configuration
 * Each use case gets its own dedicated molecules
 */

export interface UseCaseMolecule {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tag: string;
  atoms: string[];
  useCaseId: string; // Which use case this molecule belongs to
  isExclusive?: boolean; // Whether this molecule is exclusive to this use case
}

export interface UseCaseMoleculeConfig {
  useCaseId: string;
  molecules: UseCaseMolecule[];
}

/**
 * Use Case Specific Molecules
 * Each use case has its own dedicated molecules
 */
export const USE_CASE_MOLECULES: Record<string, UseCaseMoleculeConfig> = {
  'marketing-mix': {
    useCaseId: 'marketing-mix',
    molecules: [
      {
        id: 'marketing-data-prep',
        type: 'Data Pre-Process',
        title: 'Marketing Data Prep',
        subtitle: 'Prepare marketing data for MMM analysis',
        tag: 'Marketing Specific',
        atoms: ['marketing-data-loader', 'media-spend-processor', 'promo-data-validator'],
        useCaseId: 'marketing-mix',
        isExclusive: true
      },
      {
        id: 'marketing-explore',
        type: 'Explore',
        title: 'Marketing Explorer',
        subtitle: 'Explore marketing channel performance',
        tag: 'Marketing Specific',
        atoms: ['channel-performance-analyzer', 'spend-correlation', 'roi-calculator'],
        useCaseId: 'marketing-mix',
        isExclusive: true
      },
      {
        id: 'mmm-builder',
        type: 'Build',
        title: 'MMM Builder',
        subtitle: 'Build Marketing Mix Models',
        tag: 'Marketing Specific',
        atoms: ['mmm-model-builder', 'adstock-transformer', 'saturation-curve'],
        useCaseId: 'marketing-mix',
        isExclusive: true
      }
    ]
  },

  'forecasting': {
    useCaseId: 'forecasting',
    molecules: [
      {
        id: 'time-series-prep',
        type: 'Data Pre-Process',
        title: 'Time Series Prep',
        subtitle: 'Prepare data for time series analysis',
        tag: 'Forecasting Specific',
        atoms: ['time-series-validator', 'seasonality-detector', 'trend-analyzer'],
        useCaseId: 'forecasting',
        isExclusive: true
      },
      {
        id: 'forecasting-explore',
        type: 'Explore',
        title: 'Forecasting Explorer',
        subtitle: 'Explore time series patterns',
        tag: 'Forecasting Specific',
        atoms: ['time-series-plotter', 'seasonal-decomposer', 'autocorrelation-analyzer'],
        useCaseId: 'forecasting',
        isExclusive: true
      },
      {
        id: 'forecast-builder',
        type: 'Build',
        title: 'Forecast Builder',
        subtitle: 'Build forecasting models',
        tag: 'Forecasting Specific',
        atoms: ['arima-builder', 'exponential-smoothing', 'prophet-model'],
        useCaseId: 'forecasting',
        isExclusive: true
      }
    ]
  },


  'promo-effectiveness': {
    useCaseId: 'promo-effectiveness',
    molecules: [
      {
        id: 'promo-data-prep',
        type: 'Data Pre-Process',
        title: 'Promo Data Prep',
        subtitle: 'Prepare promotional campaign data',
        tag: 'Promo Specific',
        atoms: ['promo-data-loader', 'campaign-processor', 'promo-validator'],
        useCaseId: 'promo-effectiveness',
        isExclusive: true
      },
      {
        id: 'promo-explore',
        type: 'Explore',
        title: 'Promo Explorer',
        subtitle: 'Explore promotional effectiveness',
        tag: 'Promo Specific',
        atoms: ['promo-performance-analyzer', 'roi-calculator', 'lift-analyzer'],
        useCaseId: 'promo-effectiveness',
        isExclusive: true
      },
      {
        id: 'promo-builder',
        type: 'Build',
        title: 'Promo Model Builder',
        subtitle: 'Build promotional effectiveness models',
        tag: 'Promo Specific',
        atoms: ['promo-model-builder', 'incremental-impact-calculator', 'promo-optimizer'],
        useCaseId: 'promo-effectiveness',
        isExclusive: true
      }
    ]
  },

  'eda': {
    useCaseId: 'eda',
    molecules: [
      {
        id: 'eda-data-prep',
        type: 'Data Pre-Process',
        title: 'EDA Data Prep',
        subtitle: 'Prepare data for exploratory analysis',
        tag: 'EDA Specific',
        atoms: ['data-profiler', 'missing-value-analyzer', 'outlier-detector'],
        useCaseId: 'eda',
        isExclusive: true
      },
      {
        id: 'eda-explore',
        type: 'Explore',
        title: 'EDA Explorer',
        subtitle: 'Comprehensive data exploration',
        tag: 'EDA Specific',
        atoms: ['statistical-summary', 'distribution-analyzer', 'correlation-explorer'],
        useCaseId: 'eda',
        isExclusive: true
      },
      {
        id: 'eda-visualize',
        type: 'Visualization',
        title: 'EDA Visualizer',
        subtitle: 'Advanced data visualization',
        tag: 'EDA Specific',
        atoms: ['interactive-plotter', 'heatmap-generator', 'trend-visualizer'],
        useCaseId: 'eda',
        isExclusive: true
      }
    ]
  }

};

/**
 * Get molecules for a specific use case
 */
export const getMoleculesForUseCase = (useCaseId: string): UseCaseMolecule[] => {
  const config = USE_CASE_MOLECULES[useCaseId];
  return config ? config.molecules : [];
};

/**
 * Get all molecules for multiple use cases
 */
export const getMoleculesForUseCases = (useCaseIds: string[]): UseCaseMolecule[] => {
  const allMolecules: UseCaseMolecule[] = [];
  
  useCaseIds.forEach(useCaseId => {
    const molecules = getMoleculesForUseCase(useCaseId);
    allMolecules.push(...molecules);
  });
  
  return allMolecules;
};

/**
 * Get exclusive molecules for a use case (not shared with others)
 */
export const getExclusiveMoleculesForUseCase = (useCaseId: string): UseCaseMolecule[] => {
  const molecules = getMoleculesForUseCase(useCaseId);
  return molecules.filter(molecule => molecule.isExclusive);
};

/**
 * Check if a molecule belongs to a specific use case
 */
export const isMoleculeForUseCase = (moleculeId: string, useCaseId: string): boolean => {
  const molecules = getMoleculesForUseCase(useCaseId);
  return molecules.some(molecule => molecule.id === moleculeId);
};

/**
 * Get use case ID for a molecule
 */
export const getUseCaseForMolecule = (moleculeId: string): string | null => {
  for (const [useCaseId, config] of Object.entries(USE_CASE_MOLECULES)) {
    const molecule = config.molecules.find(mol => mol.id === moleculeId);
    if (molecule) {
      return useCaseId;
    }
  }
  return null;
};

/**
 * Add new molecule to a use case
 */
export const addMoleculeToUseCase = (useCaseId: string, molecule: Omit<UseCaseMolecule, 'useCaseId'>): void => {
  if (!USE_CASE_MOLECULES[useCaseId]) {
    USE_CASE_MOLECULES[useCaseId] = {
      useCaseId,
      molecules: []
    };
  }
  
  const newMolecule: UseCaseMolecule = {
    ...molecule,
    useCaseId
  };
  
  USE_CASE_MOLECULES[useCaseId].molecules.push(newMolecule);
};

/**
 * Remove molecule from a use case
 */
export const removeMoleculeFromUseCase = (useCaseId: string, moleculeId: string): void => {
  const config = USE_CASE_MOLECULES[useCaseId];
  if (config) {
    config.molecules = config.molecules.filter(mol => mol.id !== moleculeId);
  }
};
