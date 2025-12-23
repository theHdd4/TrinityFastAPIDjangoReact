import React, { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Upload, X, ImageIcon, Lightbulb } from 'lucide-react';
import { IMAGES_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import type { KPIDashboardSettings } from '../KPIDashboardAtom';

interface LayoutBox {
  id: string;
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: string;
  imageHeight?: string;
  imageObjectFit?: 'cover' | 'contain' | 'fill';
  imageBorderRadius?: string;
}

interface ImageSettingsPopoverProps {
  box: LayoutBox;
  settings: KPIDashboardSettings;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

const ImageSettingsPopover: React.FC<ImageSettingsPopoverProps> = ({
  box,
  settings,
  onSettingsChange,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  triggerRef
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      console.log('📸 Image upload response:', result);
      
      const objectName = result.image?.object_name;
      
      if (!objectName) {
        throw new Error('Upload response did not include object_name');
      }
      
      const encoded = encodeURIComponent(objectName);
      const imageUrl = `${IMAGES_API}/content?object_name=${encoded}`;
      
      console.log('📸 Object name:', objectName);
      console.log('📸 Final image URL:', imageUrl);

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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = () => {
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
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          className="absolute top-3 right-3 z-20 p-1.5 bg-white rounded-full shadow-md border border-gray-200 text-gray-600 hover:bg-gray-50 opacity-0 pointer-events-none"
          aria-hidden="true"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent 
        className="w-96 p-4 z-[100]" 
        align="end"
        side="bottom"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Prevent closing when clicking inside the popover
          const target = e.target as HTMLElement;
          if (target.closest('[data-image-settings-popover]')) {
            e.preventDefault();
          }
        }}
        data-image-settings-popover="true"
      >
        {renderContent()}
      </PopoverContent>
    </Popover>
  );

  function renderContent() {
    return (
        <div className="space-y-4" data-image-settings-popover="true">
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
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
              >
                <Upload className="w-4 h-4" />
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
                  className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
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
                  onError={(e) => {
                    console.error('❌ Preview image failed to load:', box.imageUrl);
                  }}
                  onLoad={() => {
                    console.log('✅ Preview image loaded:', box.imageUrl);
                  }}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload an image from your device. Supported formats: JPG, PNG, GIF. Max size: 10MB.
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
                  <SelectTrigger className="w-full bg-white border-gray-300">
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
                  className="w-full"
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
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Descriptive text for accessibility
                </p>
              </div>

              <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Tip: You can resize the image directly in the canvas by dragging the resize handle in the bottom-right corner.</span>
              </p>
            </div>
          )}
        </div>
    );
  }
};

export default ImageSettingsPopover;

