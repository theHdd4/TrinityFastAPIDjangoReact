# Use Cases Configuration - Code-Only Approach

This directory contains the centralized configuration for all use cases in the Trinity system.

## 📁 Files

- **`useCases.ts`** - Main configuration file containing all use case definitions
- **`README.md`** - This documentation file

## 🎯 How to Add a New Use Case

### Method 1: Edit the Configuration File (Recommended)

1. **Open** `src/config/useCases.ts`

2. **Add your use case** to the `USE_CASES` array:

```typescript
{
  id: 'my-new-use-case',
  title: 'My New Use Case',
  description: 'Description of what this use case does',
  icon: MyIcon, // Import from lucide-react
  color: 'from-purple-500 to-pink-600',
  bgGradient: 'from-purple-50 to-pink-50',
  molecules: ['Data Pre-Process', 'Explore', 'Build'],
  category: 'My Category',
  isActive: true
}
```

3. **Import the icon** at the top of the file if needed:
```typescript
import { MyIcon } from 'lucide-react';
```

4. **Save the file** - The new use case will automatically appear in the UI!

### Method 2: Programmatic Addition

```typescript
import { addUseCase } from '@/config/useCases';

const newUseCase = {
  id: 'my-new-use-case',
  title: 'My New Use Case',
  description: 'Description of what this use case does',
  icon: MyIcon,
  color: 'from-purple-500 to-pink-600',
  bgGradient: 'from-purple-50 to-pink-50',
  molecules: ['Data Pre-Process', 'Explore'],
  category: 'My Category'
};

addUseCase(newUseCase);
```

### Method 3: Using the UI Manager

1. Navigate to the Use Case Manager (if implemented in your app)
2. Click "Add Use Case" button
3. Fill in the details
4. Save

## 🎨 Use Case Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `id` | string | Unique identifier | `'customer-segmentation'` |
| `title` | string | Display name | `'Customer Segmentation'` |
| `description` | string | Description text | `'Segment customers based on behavior...'` |
| `icon` | Component | Lucide React icon | `Users` |
| `color` | string | Tailwind gradient | `'from-purple-500 to-pink-600'` |
| `bgGradient` | string | Background gradient | `'from-purple-50 to-pink-50'` |
| `molecules` | string[] | Available molecules | `['Data Pre-Process', 'Explore']` |
| `category` | string | Category grouping | `'Customer Analytics'` |
| `isActive` | boolean | Show in UI | `true` |

## 🎨 Available Colors

### Primary Colors
- Blue: `from-blue-500 to-purple-600`
- Green: `from-green-500 to-teal-600`
- Orange: `from-orange-500 to-red-600`
- Purple: `from-purple-500 to-pink-600`
- Yellow: `from-yellow-500 to-orange-600`
- Red: `from-red-500 to-pink-600`
- Indigo: `from-indigo-500 to-blue-600`
- Emerald: `from-emerald-500 to-teal-600`
- Amber: `from-amber-500 to-yellow-600`

### Background Gradients
- Blue: `from-blue-50 to-purple-50`
- Green: `from-green-50 to-teal-50`
- Orange: `from-orange-50 to-red-50`
- Purple: `from-purple-50 to-pink-50`
- Yellow: `from-yellow-50 to-orange-50`
- Red: `from-red-50 to-pink-50`
- Indigo: `from-indigo-50 to-blue-50`
- Emerald: `from-emerald-50 to-teal-50`
- Amber: `from-amber-50 to-yellow-50`

## 🔧 Available Icons (Lucide React)

Common icons you can use:
- `Target` - Marketing, goals
- `BarChart3` - Analytics, forecasting
- `Zap` - Promotions, effectiveness
- `Users` - Customer segmentation
- `DollarSign` - Price optimization
- `Shield` - Fraud detection, security
- `Truck` - Supply chain, logistics
- `TrendingUp` - Forecasting, trends
- `Package` - Inventory, products
- `Plus` - Custom, blank apps

## 📋 Available Molecules

- **Data Processing**: `'Data Pre-Process'`, `'Scope Selector'`, `'Column Classifier'`
- **Analytics**: `'Explore'`, `'Descriptive Stats'`, `'Correlation'`
- **Machine Learning**: `'Build'`, `'Clustering'`, `'Regression'`
- **Planning**: `'Optimizer'`, `'Scenario Planner'`
- **Visualization**: `'Chart Maker'`, `'Scatter Plot'`, `'Histogram'`

## 🏷️ Categories

Common categories:
- Marketing Analytics
- Customer Analytics
- Revenue Analytics
- Security Analytics
- Operations Analytics
- Predictive Analytics
- Custom

## ✅ Example: Adding "Risk Assessment" Use Case

```typescript
{
  id: 'risk-assessment',
  title: 'Risk Assessment',
  description: 'Assess and analyze business risks using advanced analytics',
  icon: Shield,
  color: 'from-red-500 to-orange-600',
  bgGradient: 'from-red-50 to-orange-50',
  molecules: ['Data Pre-Process', 'Explore', 'Build'],
  category: 'Risk Analytics',
  isActive: true
}
```

## 🚀 After Adding a Use Case

1. **Save the file** - Changes are automatically reflected
2. **Navigate to Apps page** - Your new use case appears
3. **Select the use case** - It works like existing apps
4. **Create projects** - Users can create projects with your use case
5. **Use in workflows** - All existing workflow functionality works

## 🔄 Managing Use Cases

- **Enable/Disable**: Set `isActive: true/false`
- **Update details**: Modify any property in the configuration
- **Remove**: Delete the entry from the array
- **Reorder**: Change the position in the array

## 🎯 Benefits of This Approach

✅ **No YAML files needed**
✅ **Pure code configuration**
✅ **Automatic UI updates**
✅ **Type-safe configuration**
✅ **Easy to version control**
✅ **No deployment scripts required**
✅ **Follows existing app pattern**

That's it! Your new use case is now available system-wide! 🎉
