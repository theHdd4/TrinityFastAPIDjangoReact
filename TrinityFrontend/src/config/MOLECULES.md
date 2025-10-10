# Use Case Specific Molecules System

## 🎯 **How Each Use Case Gets Its Own Molecules**

This system ensures that each use case has **dedicated, specialized molecules** that are tailored to its specific needs.

## 🏗️ **Architecture Overview**

### **1. Use Case Isolation**
Each use case has its own set of molecules that are **exclusive** to that use case:

```
Marketing Mix Modeling:
├── marketing-data-prep (Marketing Data Prep)
├── marketing-explore (Marketing Explorer)  
└── mmm-builder (MMM Builder)

Customer Segmentation:
├── customer-data-prep (Customer Data Prep)
├── customer-explore (Customer Explorer)
└── segmentation-builder (Segmentation Builder)

Price Optimization:
├── price-data-prep (Price Data Prep)
├── price-explore (Price Explorer)
└── price-optimizer (Price Optimizer)
```

### **2. Molecule Library Display**
When a user selects a use case, the Molecule Library shows:

1. **Use Case Specific Molecules** (at the top)
2. **General Molecules** (at the bottom)

## 📁 **File Structure**

```
src/config/
├── useCases.ts           # Use case definitions
├── useCaseMolecules.ts   # Use-case-specific molecules
└── MOLECULES.md         # This documentation
```

## 🔧 **How It Works**

### **Step 1: Use Case Selection**
```typescript
// User selects "Marketing Mix Modeling"
const currentUseCase = 'marketing-mix';
```

### **Step 2: Molecule Retrieval**
```typescript
// System gets molecules for this use case
const molecules = getMoleculesForUseCase('marketing-mix');
// Returns: ['marketing-data-prep', 'marketing-explore', 'mmm-builder']
```

### **Step 3: UI Display**
```typescript
// MoleculeList component shows:
// 1. Marketing Mix Specific molecules (at top)
// 2. General molecules (at bottom)
```

## 🎨 **Molecule Configuration**

Each use case molecule has:

```typescript
{
  id: 'marketing-data-prep',           // Unique identifier
  type: 'Data Pre-Process',            // Molecule type
  title: 'Marketing Data Prep',        // Display name
  subtitle: 'Prepare marketing data for MMM analysis',
  tag: 'Marketing Specific',           // Category tag
  atoms: [                             // Specific atoms for this molecule
    'marketing-data-loader',
    'media-spend-processor', 
    'promo-data-validator'
  ],
  useCaseId: 'marketing-mix',          // Which use case this belongs to
  isExclusive: true                    // Not shared with other use cases
}
```

## 🚀 **Adding New Use Case Molecules**

### **Method 1: Add to Configuration**

```typescript
// In useCaseMolecules.ts, add:
'my-new-use-case': {
  useCaseId: 'my-new-use-case',
  molecules: [
    {
      id: 'my-data-prep',
      type: 'Data Pre-Process',
      title: 'My Data Prep',
      subtitle: 'Prepare data for my use case',
      tag: 'My Specific',
      atoms: ['my-data-loader', 'my-processor'],
      useCaseId: 'my-new-use-case',
      isExclusive: true
    }
  ]
}
```

### **Method 2: Programmatic Addition**

```typescript
import { addMoleculeToUseCase } from '@/config/useCaseMolecules';

addMoleculeToUseCase('my-use-case', {
  id: 'my-molecule',
  type: 'Data Pre-Process',
  title: 'My Molecule',
  subtitle: 'My molecule description',
  tag: 'My Tag',
  atoms: ['my-atom-1', 'my-atom-2'],
  isExclusive: true
});
```

## 🎯 **Benefits**

### **✅ Use Case Isolation**
- Each use case has **dedicated molecules**
- **No molecule conflicts** between use cases
- **Specialized functionality** per use case

### **✅ Cleaner UI**
- **Focused molecule library** for each use case
- **Less confusion** for users
- **Better user experience**

### **✅ Maintainability**
- **Easy to add/remove** molecules per use case
- **Version control friendly**
- **Type-safe configuration**

### **✅ Scalability**
- **Add new use cases** without affecting existing ones
- **Modify molecules** without breaking other use cases
- **Flexible architecture**

## 🔍 **Example: Marketing Mix Modeling**

### **Use Case Specific Molecules:**
1. **Marketing Data Prep**
   - `marketing-data-loader` - Load marketing spend data
   - `media-spend-processor` - Process media channel data
   - `promo-data-validator` - Validate promotional data

2. **Marketing Explorer**
   - `channel-performance-analyzer` - Analyze channel performance
   - `spend-correlation` - Find spend correlations
   - `roi-calculator` - Calculate ROI by channel

3. **MMM Builder**
   - `mmm-model-builder` - Build MMM models
   - `adstock-transformer` - Apply adstock transformations
   - `saturation-curve` - Model saturation curves

### **General Molecules (Available to All):**
- `build` - General model building
- `explore` - General data exploration
- `data-pre-process` - General data preprocessing

## 🎯 **Result**

When a user selects **Marketing Mix Modeling**:
- ✅ They see **Marketing-specific molecules** at the top
- ✅ They see **General molecules** at the bottom
- ✅ Each molecule has **specialized atoms** for marketing
- ✅ **No confusion** with other use case molecules
- ✅ **Focused workflow** for marketing analytics

## 🚀 **Summary**

This system ensures:
1. **Each use case has its own molecules** ✅
2. **Molecules are specialized** for the use case ✅
3. **No conflicts** between use cases ✅
4. **Easy to maintain** and extend ✅
5. **Better user experience** ✅

**Each use case is now truly isolated with its own dedicated molecule ecosystem!** 🎉
