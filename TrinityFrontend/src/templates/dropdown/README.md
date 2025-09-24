# Dropdown Templates

This folder contains reusable dropdown components for the Trinity application.

## Components

### SingleSelectDropdown
A single-selection dropdown component based on the groupby atom pattern.

**Features:**
- Clean, modern UI using shadcn/ui components
- Customizable options
- Disabled state support
- TypeScript support

**Usage:**
```tsx
import { SingleSelectDropdown } from '@/templates/dropdown';

<SingleSelectDropdown
  label="Select Data Source"
  placeholder="Choose a data source..."
  value={selectedValue}
  onValueChange={setSelectedValue}
  options={[
    { value: "sales-data", label: "Sales Data" },
    { value: "market-data", label: "Market Data" },
    { value: "product-data", label: "Product Data" }
  ]}
/>
```

### MultiSelectDropdown
A multi-selection dropdown component based on the scope selector atom pattern.

**Features:**
- Checkbox-based selection
- Select All / Deselect All functionality
- Visual selection indicators
- Selected items display with remove buttons
- Scrollable options list
- TypeScript support

**Usage:**
```tsx
import { MultiSelectDropdown } from '@/templates/dropdown';

<MultiSelectDropdown
  label="Select Identifiers"
  placeholder="Choose identifiers..."
  selectedValues={selectedValues}
  onSelectionChange={setSelectedValues}
  options={[
    { value: "region", label: "Region" },
    { value: "category", label: "Category" },
    { value: "brand", label: "Brand" },
    { value: "product", label: "Product" }
  ]}
  showSelectAll={true}
  maxHeight="300px"
/>
```

## Props

### SingleSelectDropdownProps
- `label?: string` - Label for the dropdown
- `placeholder?: string` - Placeholder text
- `value?: string` - Currently selected value
- `onValueChange?: (value: string) => void` - Callback when selection changes
- `options?: Array<{ value: string; label: string }>` - Available options
- `disabled?: boolean` - Whether dropdown is disabled
- `className?: string` - Additional CSS classes

### MultiSelectDropdownProps
- `label?: string` - Label for the dropdown
- `placeholder?: string` - Placeholder text (not used in current implementation)
- `selectedValues?: string[]` - Currently selected values
- `onSelectionChange?: (selectedValues: string[]) => void` - Callback when selection changes
- `options?: Array<{ value: string; label: string }>` - Available options
- `disabled?: boolean` - Whether dropdown is disabled
- `className?: string` - Additional CSS classes
- `showSelectAll?: boolean` - Show Select All button
- `showDeselectAll?: boolean` - Show Deselect All button (currently combined with Select All)
- `maxHeight?: string` - Maximum height for the options container

## Design Patterns

These components follow the established patterns from:
- **SingleSelectDropdown**: Based on the GroupBy atom's single selection pattern
- **MultiSelectDropdown**: Based on the Scope Selector atom's multi-selection pattern

Both components use the same UI library (shadcn/ui) and styling patterns as the rest of the application.
