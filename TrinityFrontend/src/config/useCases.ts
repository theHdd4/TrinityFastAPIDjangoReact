/**
 * Use Cases Configuration - Code-Only Approach
 * Add new use cases here following the existing pattern
 */

import { 
  Target, 
  BarChart3, 
  Zap, 
  Plus, 
  FolderOpen
} from 'lucide-react';

export interface UseCase {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
  bgGradient: string;
  molecules: string[];
  category: string;
  isActive: boolean;
}

/**
 * All available use cases
 * Add new use cases here - they will automatically appear in the UI
 */
export const USE_CASES: UseCase[] = [
  // Existing Apps
  {
    id: 'marketing-mix',
    title: 'Marketing Mix Modeling',
    description: 'Optimize marketing spend allocation across different channels and measure incremental impact',
    icon: Target,
    color: 'from-blue-500 to-purple-600',
    bgGradient: 'from-blue-50 to-purple-50',
    molecules: ['marketing-data-prep', 'marketing-explore', 'mmm-builder'],
    category: 'Marketing Analytics',
    isActive: true
  },
  {
    id: 'forecasting',
    title: 'Forecasting Analysis',
    description: 'Predict future trends and patterns with advanced time series analysis and modeling',
    icon: BarChart3,
    color: 'from-green-500 to-teal-600',
    bgGradient: 'from-green-50 to-teal-50',
    molecules: ['time-series-prep', 'forecasting-explore', 'forecast-builder'],
    category: 'Predictive Analytics',
    isActive: true
  },
  {
    id: 'promo-effectiveness',
    title: 'Promo Effectiveness',
    description: 'Measure and analyze promotional campaign performance and ROI across touchpoints',
    icon: Zap,
    color: 'from-orange-500 to-red-600',
    bgGradient: 'from-orange-50 to-red-50',
    molecules: ['promo-data-prep', 'promo-explore', 'promo-builder'],
    category: 'Marketing Analytics',
    isActive: true
  },
  {
    id: 'eda',
    title: 'Exploratory Data Analysis',
    description: 'Perform comprehensive exploratory data analysis with advanced visualization and statistical insights',
    icon: BarChart3,
    color: 'from-indigo-500 to-purple-600',
    bgGradient: 'from-indigo-50 to-purple-50',
    molecules: ['eda-data-prep', 'eda-explore', 'eda-visualize'],
    category: 'Data Analytics',
    isActive: true
  },

  // Blank App (always last)
  {
    id: 'blank',
    title: 'Create Blank App',
    description: 'Start from scratch with a clean canvas and build your custom analysis workflow',
    icon: Plus,
    color: 'from-gray-500 to-gray-700',
    bgGradient: 'from-gray-50 to-gray-100',
    molecules: [],
    category: 'Custom',
    isActive: true
  }
];

/**
 * Get all active use cases
 */
export const getActiveUseCases = (): UseCase[] => {
  return USE_CASES.filter(useCase => useCase.isActive);
};

/**
 * Get use case by ID
 */
export const getUseCaseById = (id: string): UseCase | undefined => {
  return USE_CASES.find(useCase => useCase.id === id);
};

/**
 * Get use cases by category
 */
export const getUseCasesByCategory = (category: string): UseCase[] => {
  return USE_CASES.filter(useCase => useCase.category === category && useCase.isActive);
};

/**
 * Get all available categories
 */
export const getCategories = (): string[] => {
  const categories = new Set(USE_CASES.map(useCase => useCase.category));
  return Array.from(categories).filter(cat => cat !== 'Custom');
};

/**
 * Toggle use case active status
 */
export const toggleUseCase = (id: string): void => {
  const useCase = USE_CASES.find(uc => uc.id === id);
  if (useCase) {
    useCase.isActive = !useCase.isActive;
  }
};

/**
 * Add new use case (for future programmatic addition)
 */
export const addUseCase = (newUseCase: Omit<UseCase, 'isActive'>): void => {
  const useCase: UseCase = {
    ...newUseCase,
    isActive: true
  };
  USE_CASES.push(useCase);
};

/**
 * Remove use case
 */
export const removeUseCase = (id: string): void => {
  const index = USE_CASES.findIndex(uc => uc.id === id);
  if (index > -1) {
    USE_CASES.splice(index, 1);
  }
};
