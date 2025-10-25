import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type ImagePanelSource = 'stock' | 'upload' | 'existing';

export interface ImageSelectionMetadata {
  title?: string | null;
  source: ImagePanelSource;
}

interface UploadedImage {
  url: string;
  name: string;
}

interface SelectedImage {
  url: string;
  title?: string | null;
  name?: string | null;
  source: ImagePanelSource;
}

export interface ImagePanelProps {
  currentImage?: string | null;
  currentImageName?: string | null;
  onClose: () => void;
  onImageSelect: (imageUrl: string, metadata: ImageSelectionMetadata) => void;
  onRemoveImage?: () => void;
  canEdit?: boolean;
}

export const stockImages: ReadonlyArray<{ url: string; title: string }> = [
  {
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
    title: 'Business Analytics',
  },
  {
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    title: 'Data Dashboard',
  },
  {
    url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80',
    title: 'Office Meeting',
  },
  {
    url: 'https://images.unsplash.com/photo-1557426272-fc759fdf7a8d?w=800&q=80',
    title: 'Collaboration',
  },
  {
    url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80',
    title: 'Team Work',
  },
  {
    url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
    title: 'Financial Reports',
  },
  {
    url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80',
    title: 'Strategic Planning',
  },
  {
    url: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80',
    title: 'Marketing',
  },
];

const SELECTED_RING_CLASSES = 'border-primary ring-2 ring-primary/20';

const ImagePanel: React.FC<ImagePanelProps> = ({
  currentImage,
  currentImageName,
  onClose,
  onImageSelect,
  onRemoveImage,
  canEdit = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  useEffect(() => {
    setSelectedImage(prev => {
      if (prev && prev.source !== 'existing') {
        return prev;
      }

      if (currentImage) {
        if (prev?.url === currentImage) {
          return { ...prev, title: currentImageName ?? prev.title ?? 'Current image' };
        }
        return {
          url: currentImage,
          title: currentImageName ?? 'Current image',
          source: 'existing',
        };
      }

      if (prev?.source === 'existing') {
        return null;
      }

      return prev;
    });
  }, [currentImage, currentImageName]);

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!canEdit) {
        return;
      }
      const files = event.target.files;
      event.target.value = '';

      if (!files || files.length === 0) {
        return;
      }

      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) {
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            return;
          }
          const imageUrl = reader.result;
          setUploadedImages(prev => {
            const next = [...prev, { url: imageUrl, name: file.name }];
            return next.slice(-40);
          });
          setSelectedImage({ url: imageUrl, name: file.name, source: 'upload' });
        };
        reader.readAsDataURL(file);
      });
    },
    [canEdit],
  );

  const handleImageClick = useCallback(
    (image: SelectedImage) => {
      if (!canEdit) {
        return;
      }
      setSelectedImage(image);
    },
    [canEdit],
  );

  const handleInsertImage = useCallback(() => {
    if (!selectedImage || !canEdit) {
      return;
    }

    if (selectedImage.source === 'existing' && selectedImage.url === currentImage) {
      onClose();
      return;
    }

    const title = selectedImage.title ?? selectedImage.name ?? (selectedImage.source === 'upload' ? 'Uploaded image' : 'Selected image');

    onImageSelect(selectedImage.url, {
      title,
      source: selectedImage.source,
    });
    onClose();
  }, [canEdit, currentImage, onClose, onImageSelect, selectedImage]);

  const handleRemove = useCallback(() => {
    if (!canEdit) {
      return;
    }
    onRemoveImage?.();
    setSelectedImage(null);
  }, [canEdit, onRemoveImage]);

  const isInsertDisabled = useMemo(() => {
    if (!selectedImage || !canEdit) {
      return true;
    }
    if (selectedImage.source === 'existing' && selectedImage.url === currentImage) {
      return true;
    }
    return false;
  }, [canEdit, currentImage, selectedImage]);

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Images</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-5 px-5 py-5">
        <section className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Upload images</p>
            <p className="text-xs text-muted-foreground">
              Add your own visuals to customise this slide&apos;s accent image.
            </p>
          </div>
          <div className="rounded-xl border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={!canEdit}
            />
            <Button
              variant="outline"
              className="flex h-20 w-full items-center justify-center"
              onClick={() => fileInputRef.current?.click()}
              type="button"
              disabled={!canEdit}
            >
              <Upload className="mr-2 h-5 w-5" />
              Upload your images
            </Button>
          </div>
        </section>

        {uploadedImages.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Your uploads</p>
              <p className="text-xs text-muted-foreground">Recently added</p>
            </div>
            <ScrollArea className="h-40">
              <div className="grid grid-cols-2 gap-3 pr-2">
                {uploadedImages.map((image, index) => {
                  const isSelected = selectedImage?.url === image.url;
                  return (
                    <button
                      key={`uploaded-${index}`}
                      type="button"
                      onClick={() => handleImageClick({ url: image.url, name: image.name, source: 'upload' })}
                      className={cn(
                        'group relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        canEdit && 'hover:scale-[1.02] hover:border-primary/40',
                        isSelected ? SELECTED_RING_CLASSES : 'border-border/60',
                        !canEdit && 'cursor-not-allowed opacity-50'
                      )}
                      disabled={!canEdit}
                    >
                      <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="truncate text-[11px] font-medium text-white">{image.name}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                            <Check className="h-4 w-4 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </section>
        )}

        <section className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Stock images</p>
            <p className="text-xs text-muted-foreground">
              Choose from curated royalty-free visuals to enhance your narrative.
            </p>
          </div>
          <ScrollArea className="h-64">
            <div className="grid grid-cols-2 gap-3 pr-2">
              {stockImages.map((image, index) => {
                const isSelected = selectedImage?.url === image.url;
                return (
                  <button
                    key={`stock-${index}`}
                    type="button"
                    onClick={() => handleImageClick({ url: image.url, title: image.title, source: 'stock' })}
                    className={cn(
                      'group relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      canEdit && 'hover:scale-[1.02] hover:border-primary/40',
                      isSelected ? SELECTED_RING_CLASSES : 'border-border/60',
                      !canEdit && 'cursor-not-allowed opacity-50'
                    )}
                    disabled={!canEdit}
                  >
                    <img src={image.url} alt={image.title} className="h-full w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="truncate text-[11px] font-medium text-white">{image.title}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </section>

        <section className="flex flex-col gap-2 pt-2">
          <div className="flex justify-between">
            {onRemoveImage && currentImage ? (
              <Button
                variant="ghost"
                type="button"
                className="h-9 px-3 text-xs text-destructive"
                onClick={handleRemove}
                disabled={!canEdit}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove image
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={onClose} className="h-9 px-4 text-xs">
                Cancel
              </Button>
              <Button type="button" onClick={handleInsertImage} disabled={isInsertDisabled} className="h-9 px-4 text-xs">
                Insert image
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ImagePanel;
