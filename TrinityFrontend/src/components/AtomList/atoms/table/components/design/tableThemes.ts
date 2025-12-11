/**
 * Table Theme Definitions
 * PowerPoint-style pre-built themes for table styling
 */

export interface TableTheme {
  id: string;
  name: string;
  category: 'light' | 'medium' | 'dark';
  colors: {
    headerBg: string;
    headerText: string;
    oddRowBg: string;
    evenRowBg: string;
    cellText: string;
    borderColor: string;
    hoverBg?: string;
    totalRowBg?: string;
    firstColumnBg?: string;
    lastColumnBg?: string;
  };
}

export const TABLE_THEMES: Record<string, TableTheme> = {
  // Light Themes
  plain: {
    id: 'plain',
    name: 'Plain',
    category: 'light',
    colors: {
      headerBg: '#ffffff',
      headerText: '#000000',
      oddRowBg: '#ffffff',
      evenRowBg: '#ffffff',
      cellText: '#000000',
      borderColor: '#d1d5db',
    }
  },
  lightBlue: {
    id: 'lightBlue',
    name: 'Light Blue',
    category: 'light',
    colors: {
      headerBg: '#dbeafe', // blue-100
      headerText: '#1e40af', // blue-800
      oddRowBg: '#ffffff',
      evenRowBg: '#f0f9ff', // blue-50
      cellText: '#000000',
      borderColor: '#93c5fd', // blue-300
    }
  },
  lightGreen: {
    id: 'lightGreen',
    name: 'Light Green',
    category: 'light',
    colors: {
      headerBg: '#dcfce7', // green-100
      headerText: '#166534', // green-800
      oddRowBg: '#ffffff',
      evenRowBg: '#f0fdf4', // green-50
      cellText: '#000000',
      borderColor: '#86efac', // green-300
    }
  },
  lightGray: {
    id: 'lightGray',
    name: 'Light Gray',
    category: 'light',
    colors: {
      headerBg: '#f3f4f6', // gray-100
      headerText: '#1f2937', // gray-800
      oddRowBg: '#ffffff',
      evenRowBg: '#f9fafb', // gray-50
      cellText: '#000000',
      borderColor: '#d1d5db', // gray-300
    }
  },
  // Medium Themes
  mediumTeal: {
    id: 'mediumTeal',
    name: 'Medium Teal (Trinity)',
    category: 'medium',
    colors: {
      headerBg: '#14b8a6', // teal-500
      headerText: '#ffffff',
      oddRowBg: '#ffffff',
      evenRowBg: '#f0fdfa', // teal-50
      cellText: '#000000',
      borderColor: '#5eead4', // teal-300
    }
  },
  mediumBlue: {
    id: 'mediumBlue',
    name: 'Medium Blue',
    category: 'medium',
    colors: {
      headerBg: '#3b82f6', // blue-500
      headerText: '#ffffff',
      oddRowBg: '#ffffff',
      evenRowBg: '#eff6ff', // blue-50
      cellText: '#000000',
      borderColor: '#93c5fd', // blue-300
    }
  },
  mediumOrange: {
    id: 'mediumOrange',
    name: 'Medium Orange',
    category: 'medium',
    colors: {
      headerBg: '#f97316', // orange-500
      headerText: '#ffffff',
      oddRowBg: '#ffffff',
      evenRowBg: '#fff7ed', // orange-50
      cellText: '#000000',
      borderColor: '#fdba74', // orange-300
    }
  },
  mediumPurple: {
    id: 'mediumPurple',
    name: 'Medium Purple',
    category: 'medium',
    colors: {
      headerBg: '#9333ea', // purple-500
      headerText: '#ffffff',
      oddRowBg: '#ffffff',
      evenRowBg: '#faf5ff', // purple-50
      cellText: '#000000',
      borderColor: '#c4b5fd', // purple-300
    }
  },
  // Dark Themes
  darkBlue: {
    id: 'darkBlue',
    name: 'Dark Blue',
    category: 'dark',
    colors: {
      headerBg: '#1e40af', // blue-800
      headerText: '#ffffff',
      oddRowBg: '#1e293b', // slate-800
      evenRowBg: '#334155', // slate-700
      cellText: '#ffffff',
      borderColor: '#475569', // slate-600
    }
  },
  darkSlate: {
    id: 'darkSlate',
    name: 'Dark Slate',
    category: 'dark',
    colors: {
      headerBg: '#0f172a', // slate-900
      headerText: '#ffffff',
      oddRowBg: '#1e293b', // slate-800
      evenRowBg: '#334155', // slate-700
      cellText: '#ffffff',
      borderColor: '#475569', // slate-600
    }
  },
  darkTeal: {
    id: 'darkTeal',
    name: 'Dark Teal',
    category: 'dark',
    colors: {
      headerBg: '#115e59', // teal-800
      headerText: '#ffffff',
      oddRowBg: '#134e4a', // teal-900
      evenRowBg: '#0f766e', // teal-700
      cellText: '#ffffff',
      borderColor: '#14b8a6', // teal-500
    }
  },
};

/**
 * Get theme by ID
 */
export const getTheme = (themeId: string): TableTheme => {
  return TABLE_THEMES[themeId] || TABLE_THEMES.plain;
};

/**
 * Get themes by category
 */
export const getThemesByCategory = (category: 'light' | 'medium' | 'dark'): TableTheme[] => {
  return Object.values(TABLE_THEMES).filter(theme => theme.category === category);
};

/**
 * Get all themes
 */
export const getAllThemes = (): TableTheme[] => {
  return Object.values(TABLE_THEMES);
};



