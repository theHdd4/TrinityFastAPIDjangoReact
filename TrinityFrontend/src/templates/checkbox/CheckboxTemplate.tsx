import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export interface CheckboxTemplateProps {
  label?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  showLabel?: boolean;
  labelClassName?: string;
}

const CheckboxTemplate: React.FC<CheckboxTemplateProps> = ({
  label = "Checkbox Option",
  checked = false,
  onCheckedChange,
  disabled = false,
  className = "",
  id,
  showLabel = true,
  labelClassName = "text-ms cursor-pointer capitalize"
}) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={`flex items-center space-x-2 py-1 px-1 hover:bg-gray-50 cursor-pointer rounded ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <Checkbox
        id={checkboxId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="data-[state=checked]:bg-gray-800 data-[state=checked]:border-gray-800"
      />
      {showLabel && (
        <Label
          htmlFor={checkboxId}
          className={labelClassName}
          title={label}
        >
          {label}
        </Label>
      )}
    </div>
  );
};

export default CheckboxTemplate;
