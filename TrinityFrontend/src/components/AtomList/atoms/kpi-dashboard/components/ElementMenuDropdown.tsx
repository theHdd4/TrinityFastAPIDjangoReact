import React, { useState, useRef } from 'react';
import { MoreVertical, Trash2, Plus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ImageIcon, Settings, Upload, X, Lightbulb } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ElementType } from './ElementDropdown';
import { IMAGES_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import type { KPIDashboardSettings } from '../KPIDashboardAtom';

interface LayoutBox {
  id: string;
  elementType?: ElementType;
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: string;
  imageHeight?: string;
  imageObjectFit?: 'cover' | 'contain' | 'fill';
  imageBorderRadius?: string;
}

interface ElementMenuDropdownProps {
  elementTypes: { value: ElementType; label: string; icon: React.ElementType }[];
  onElementChange: (elementType: ElementType) => void;
  boxId: string;
  layoutId: string;
  onDeleteBox: (layoutId: string, boxId: string) => void;
  onAddElement: (layoutId: string, boxId: string, position: 'left' | 'right' | 'above' | 'below') => void;
  selectedBoxIds?: string[];
  boxesInRow: number; // Number of boxes in the current row
  containerClassName?: string; // Optional custom className for hover trigger
  // Image settings props (only needed for image elements)
  box?: LayoutBox;
  settings?: KPIDashboardSettings;
  onSettingsChange?: (settings: Partial<KPIDashboardSettings>) => void;
}

const ElementMenuDropdown: React.FC<ElementMenuDropdownProps> = ({
  elementTypes,
  onElementChange,
  boxId,
  layoutId,
  onDeleteBox,
  onAddElement,
  selectedBoxIds = [],
  boxesInRow,
  containerClassName,
  box,
  settings,
  onSettingsChange
}) => {
  const isMultiSelected = selectedBoxIds.length > 1 && selectedBoxIds.includes(boxId);
  const isImageElement = box?.elementType === 'image';
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteBox(layoutId, boxId);
  };

  const handleAddToLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddElement(layoutId, boxId, 'left');
  };

  const handleAddToRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddElement(layoutId, boxId, 'right');
  };

  const handleAddAbove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddElement(layoutId, boxId, 'above');
  };

  const handleAddBelow = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddElement(layoutId, boxId, 'below');
  };

  // Default hover class for non-table elements, or use custom className for table elements
  const hoverClass = containerClassName || "opacity-0 group-hover/box:opacity-100";
  
  // Image settings state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !box || !settings || !onSettingsChange) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setImageUploadError('Please select a valid image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setImageUploadError('Image size must be less than 10MB');
      return;
    }

    setUploadingImage(true);
    setImageUploadError(null);

    try {
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        throw new Error('Project context not available');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('client_name', projectContext.client_name);
      formData.append('app_name', projectContext.app_name);
      formData.append('project_name', projectContext.project_name);

      const response = await fetch(`${IMAGES_API}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to upload image';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const objectName = result.image?.object_name;
      
      if (!objectName) {
        throw new Error('Upload response did not include object_name');
      }
      
      const encoded = encodeURIComponent(objectName);
      const imageUrl = `${IMAGES_API}/content?object_name=${encoded}`;

      // Update the image box with the uploaded image URL
      const updatedLayouts = settings.layouts?.map(layout => ({
        ...layout,
        boxes: layout.boxes.map(b =>
          b.id === box.id
            ? {
                ...b,
                imageUrl: imageUrl,
                imageAlt: file.name || 'Uploaded image',
                imageWidth: '100%',
                imageHeight: 'auto',
                imageObjectFit: 'contain',
                imageBorderRadius: '8px',
              }
            : b
        )
      }));

      onSettingsChange({ layouts: updatedLayouts });
    } catch (error: any) {
      console.error('Image upload error:', error);
      setImageUploadError(error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = () => {
    if (!box || !settings || !onSettingsChange) return;
    const updatedLayouts = settings.layouts?.map(layout => ({
      ...layout,
      boxes: layout.boxes.map(b =>
        b.id === box.id
          ? {
              ...b,
              imageUrl: '',
              imageAlt: '',
            }
          : b
      )
    }));
    onSettingsChange({ layouts: updatedLayouts });
  };
  
  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className={`absolute top-3 right-3 z-20 p-1.5 bg-white rounded-full shadow-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-opacity ${hoverClass} flex items-center justify-center`}
            title="More options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
            Change Element
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {elementTypes.map((element) => {
              const Icon = element.icon;
              return (
                <DropdownMenuItem
                  key={element.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onElementChange(element.value);
                  }}
                  className="flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  <span>{element.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        {/* Add Element option - always available for all element types */}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Element
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem
              onClick={handleAddToLeft}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Add to the Left</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleAddToRight}
              className="flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              <span>Add to the Right</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleAddAbove}
              className="flex items-center gap-2"
            >
              <ArrowUp className="w-4 h-4" />
              <span>Add Above</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleAddBelow}
              className="flex items-center gap-2"
            >
              <ArrowDown className="w-4 h-4" />
              <span>Add Below</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Image Settings - only show for image elements */}
        {isImageElement && box && settings && onSettingsChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                <Settings className="w-4 h-4 mr-2" />
                Image Settings
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-96 p-4" align="end" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <ImageIcon className="w-5 h-5 text-purple-600" />
                    <Label className="text-sm font-semibold text-purple-900">
                      Image Settings
                    </Label>
                  </div>

                  {/* Replace Image */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      {box.imageUrl ? 'Replace Image' : 'Upload Image'}
                    </Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0 text-xs h-8"
                        size="sm"
                      >
                        <Upload className="w-3 h-3" />
                        {uploadingImage 
                          ? 'Uploading...' 
                          : box.imageUrl 
                            ? 'Replace Image' 
                            : 'Choose Image'}
                      </Button>
                      {box.imageUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleRemoveImage}
                          className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 flex-shrink-0 text-xs h-8"
                          size="sm"
                        >
                          <X className="w-3 h-3" />
                          Remove
                        </Button>
                      )}
                    </div>
                    {uploadingImage && (
                      <p className="text-xs text-blue-600">Uploading image...</p>
                    )}
                    {imageUploadError && (
                      <p className="text-xs text-red-600">{imageUploadError}</p>
                    )}
                    {box.imageUrl && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
                        <p className="text-xs text-muted-foreground mb-2">Current Image:</p>
                        <img
                          src={box.imageUrl}
                          alt={box.imageAlt || 'Uploaded image'}
                          className="max-w-full h-auto max-h-32 rounded border border-gray-200"
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Supported formats: JPG, PNG, GIF. Max size: 10MB.
                    </p>
                  </div>

                  {/* Image Display Options - Only show if image is uploaded */}
                  {box.imageUrl && (
                    <div className="space-y-3 mt-4 pt-4 border-t border-purple-200">
                      <Label className="text-sm font-medium">Image Display Options</Label>
                      
                      {/* Object Fit */}
                      <div className="space-y-2">
                        <Label htmlFor="imageObjectFit" className="text-xs font-medium">
                          Fit Mode
                        </Label>
                        <Select
                          value={box.imageObjectFit || 'contain'}
                          onValueChange={(value) => {
                            const updatedLayouts = settings.layouts?.map(layout => ({
                              ...layout,
                              boxes: layout.boxes.map(b =>
                                b.id === box.id
                                  ? { ...b, imageObjectFit: value as 'cover' | 'contain' | 'fill' }
                                  : b
                              )
                            }));
                            onSettingsChange({ layouts: updatedLayouts });
                          }}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-300 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contain">Contain (fit entire image)</SelectItem>
                            <SelectItem value="cover">Cover (fill container)</SelectItem>
                            <SelectItem value="fill">Fill (stretch to fit)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Border Radius */}
                      <div className="space-y-2">
                        <Label htmlFor="imageBorderRadius" className="text-xs font-medium">
                          Border Radius
                        </Label>
                        <Input
                          id="imageBorderRadius"
                          value={box.imageBorderRadius || '8px'}
                          onChange={(e) => {
                            const updatedLayouts = settings.layouts?.map(layout => ({
                              ...layout,
                              boxes: layout.boxes.map(b =>
                                b.id === box.id
                                  ? { ...b, imageBorderRadius: e.target.value }
                                  : b
                              )
                            }));
                            onSettingsChange({ layouts: updatedLayouts });
                          }}
                          placeholder="8px"
                          className="w-full h-8 text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          CSS border-radius value (e.g., 8px, 50%, 0)
                        </p>
                      </div>

                      {/* Alt Text */}
                      <div className="space-y-2">
                        <Label htmlFor="imageAlt" className="text-xs font-medium">
                          Alt Text
                        </Label>
                        <Input
                          id="imageAlt"
                          value={box.imageAlt || ''}
                          onChange={(e) => {
                            const updatedLayouts = settings.layouts?.map(layout => ({
                              ...layout,
                              boxes: layout.boxes.map(b =>
                                b.id === box.id
                                  ? { ...b, imageAlt: e.target.value }
                                  : b
                              )
                            }));
                            onSettingsChange({ layouts: updatedLayouts });
                          }}
                          placeholder="Image description"
                          className="w-full h-8 text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          Descriptive text for accessibility
                        </p>
                      </div>

                      <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                        <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>Tip: You can resize the image directly in the canvas by dragging the resize handles on hover.</span>
                      </p>
                    </div>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {/* Individual Delete option - always show, even in multi-selection */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
};

export default ElementMenuDropdown;

