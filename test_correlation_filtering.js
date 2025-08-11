// Test the filtering logic for correlation columns

// Mock correlation matrix - represents a scenario where some columns only correlate with themselves
const mockCorrelationMatrix = [
  [1.0, 0.85, 0.02, 0.01, 0.05], // Sales - high correlation with Marketing
  [0.85, 1.0, 0.03, 0.02, 0.04], // Marketing - high correlation with Sales  
  [0.02, 0.03, 1.0, 0.01, 0.02], // Column C - only correlates with itself (low with others)
  [0.01, 0.02, 0.01, 1.0, 0.03], // Column D - only correlates with itself (low with others)
  [0.05, 0.04, 0.02, 0.03, 1.0]  // Column E - only correlates with itself (low with others)
];

const mockVariables = ['Sales', 'Marketing', 'ColumnC', 'ColumnD', 'ColumnE'];

// Filtering function
function getFilteredVariables(variables, correlationMatrix, showAllColumns) {
  if (showAllColumns) {
    return variables;
  }

  return variables.filter((variable, index) => {
    if (!correlationMatrix || !correlationMatrix[index]) return true;
    
    // Check if this variable has any meaningful correlation with other variables
    // (excluding perfect correlation with itself at index === index)
    const hasOtherCorrelations = correlationMatrix[index].some((correlation, corrIndex) => {
      return corrIndex !== index && Math.abs(correlation) > 0.1; // threshold for meaningful correlation
    });
    
    return hasOtherCorrelations;
  });
}

// Test cases
console.log('Original variables:', mockVariables);
console.log('Filtered variables (showAllColumns = false):', getFilteredVariables(mockVariables, mockCorrelationMatrix, false));
console.log('Filtered variables (showAllColumns = true):', getFilteredVariables(mockVariables, mockCorrelationMatrix, true));

// Expected result when showAllColumns = false: ['Sales', 'Marketing'] 
// (ColumnC, ColumnD, ColumnE should be filtered out as they only correlate with themselves)
