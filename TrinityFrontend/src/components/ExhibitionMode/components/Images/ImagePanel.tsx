import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { IMAGES_API } from '@/lib/api';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';

export type ImagePanelSource = 'stock' | 'upload' | 'existing';

export interface ImageSelectionMetadata {
  title?: string | null;
  source: ImagePanelSource;
}

interface StoredImage {
  id: string;
  url: string;
  label: string;
  uploadedAt?: string | null;
}

interface SelectedImage {
  url: string;
  label?: string | null;
  title?: string | null;
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

const SELECTED_CLASSES = 'border-primary ring-2 ring-primary/20';

const normaliseStoredImage = (image: any): StoredImage | null => {
  const objectName: string | undefined = image?.object_name ?? image?.objectName;
  const url: string | undefined = image?.url;

  if (!objectName || !url) {
    return null;
  }

  const label: string =
    image?.filename ?? image?.name ?? objectName.split('/').pop() ?? 'Uploaded image';
  const uploadedAt: string | null = image?.uploaded_at ?? image?.uploadedAt ?? null;

  return {
    id: objectName,
    url,
    label,
    uploadedAt,
  };
};

const buildUploadsPath = (context: ProjectContext | null): string | null => {
  if (!context) {
    return null;
  }
  const { client_name, app_name, project_name } = context;
  if (!client_name || !app_name || !project_name) {
    return null;
  }

  return `${client_name}/${app_name}/${project_name}/Images`;
};

const resolveSelectionTitle = (selection: SelectedImage): string => {
  if (selection.title) {
    return selection.title;
  }

  if (selection.label) {
    return selection.label;
  }

  return selection.source === 'upload' ? 'Uploaded image' : 'Selected image';
};

const sortStoredImages = (images: StoredImage[]): StoredImage[] => {
  return [...images].sort((a, b) => {
    const aTime = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
    const bTime = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
    return bTime - aTime;
  });
};

const ImagePanel: React.FC<ImagePanelProps> = ({
  currentImage,
  currentImageName,
  onClose,
  onImageSelect,
  onRemoveImage,
  canEdit = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  useEffect(() => {
    setProjectContext(getActiveProjectContext());
  }, []);

  useEffect(() => {
    if (currentImage) {
      setSelectedImage({
        url: currentImage,
        title: currentImageName ?? 'Current image',
        source: 'existing',
      });
    } else {
      setSelectedImage(prev => (prev?.source === 'existing' ? null : prev));
    }
  }, [currentImage, currentImageName]);

  const fetchStoredImages = useCallback(async () => {
    if (!projectContext) {
      setStoredImages([]);
      return;
    }

    setIsLoadingImages(true);
    try {
      const params = new URLSearchParams({
        client_name: projectContext.client_name,
        app_name: projectContext.app_name,
        project_name: projectContext.project_name,
      });

      const response = await fetch(`${IMAGES_API}?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load images (${response.status})`);
      }

      const payload = await response.json();
      const mapped = Array.isArray(payload?.images)
        ? sortStoredImages(
            (payload.images as any[])
              .map(normaliseStoredImage)
              .filter((value): value is StoredImage => Boolean(value)),
          )
        : [];

      setStoredImages(mapped);
    } catch (error) {
      console.error('Unable to fetch stored images', error);
      toast({
        title: 'Unable to load images',
        description: 'We could not retrieve uploaded images for this project.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingImages(false);
    }
  }, [projectContext, toast]);

  useEffect(() => {
    void fetchStoredImages();
  }, [fetchStoredImages]);

  const handleImageClick = useCallback(
    (image: SelectedImage) => {
      if (!canEdit) {
        return;
      }

      setSelectedImage(image);
    },
    [canEdit],
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!canEdit || isProcessingUpload) {
        return;
      }

      const file = event.target.files?.[0] ?? null;
      event.target.value = '';

      if (!file) {
        return;
      }

      if (!file.type?.startsWith('image/')) {
        toast({
          title: 'Unsupported file',
          description: 'Please choose an image file to upload.',
          variant: 'destructive',
        });
        return;
      }

      const context = projectContext;
      if (!context || !context.client_name || !context.app_name || !context.project_name) {
        toast({
          title: 'Project required',
          description: 'Connect to a project before uploading images.',
          variant: 'destructive',
        });
        return;
      }

      setIsProcessingUpload(true);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('client_name', context.client_name);
        formData.append('app_name', context.app_name);
        formData.append('project_name', context.project_name);

        const response = await fetch(`${IMAGES_API}/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          let errorMessage = 'We were unable to upload the selected image. Please try again.';
          try {
            const errorPayload = await response.json();
            if (typeof errorPayload?.detail === 'string' && errorPayload.detail.trim().length > 0) {
              errorMessage = errorPayload.detail.trim();
            }
          } catch {
            // ignore parsing issues
          }
          throw new Error(errorMessage);
        }

        const payload = await response.json();
        const uploadedImage = normaliseStoredImage(payload?.image);

        if (!uploadedImage) {
          throw new Error('Upload response did not include image metadata.');
        }

        setStoredImages(prev => {
          const unique = new Map<string, StoredImage>();
          [...prev, uploadedImage].forEach(image => {
            if (image.id) {
              unique.set(image.id, image);
            }
          });
          return sortStoredImages(Array.from(unique.values()));
        });

        setSelectedImage({ url: uploadedImage.url, label: uploadedImage.label, source: 'upload' });
        toast({
          title: 'Image uploaded',
          description: 'The image has been added to your uploads.',
        });
      } catch (error) {
        console.error('Unable to upload image', error);
        toast({
          title: 'Upload failed',
          description:
            error instanceof Error
              ? error.message
              : 'We were unable to upload the selected image. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsProcessingUpload(false);
      }
    },
    [canEdit, isProcessingUpload, projectContext, toast],
  );

  const handleInsertImage = useCallback(() => {
    if (!selectedImage || !canEdit || isProcessingUpload) {
      return;
    }

    if (selectedImage.source === 'existing' && selectedImage.url === currentImage) {
      onClose();
      return;
    }

    onImageSelect(selectedImage.url, {
      title: resolveSelectionTitle(selectedImage),
      source: selectedImage.source,
    });
    onClose();
  }, [canEdit, currentImage, isProcessingUpload, onClose, onImageSelect, selectedImage]);

  const handleRemove = useCallback(() => {
    if (!canEdit || isProcessingUpload) {
      return;
    }
    onRemoveImage?.();
    setSelectedImage(null);
  }, [canEdit, isProcessingUpload, onRemoveImage]);

  const uploadsPath = useMemo(() => buildUploadsPath(projectContext), [projectContext]);

  const availableUploads = storedImages;

  const insertDisabled =
    !selectedImage || !canEdit || isProcessingUpload ||
    (selectedImage.source === 'existing' && selectedImage.url === currentImage);

  return (
    <div className="flex h-full w-full max-w-[22rem] flex-col rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
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

      <div className="flex flex-1 flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="space-y-5 px-5 py-5">
            <section className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Upload images</p>
                <p className="text-xs text-muted-foreground">
                  Add images to place them anywhere on the slide.
                </p>
                {uploadsPath ? (
                  <p className="text-[11px] text-muted-foreground">
                    Shared uploads for this project live at{' '}
                    <span className="font-medium text-foreground">{uploadsPath}</span>.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Connect to a project to sync and reuse shared uploads.
                  </p>
                )}
              </div>
              <div className="rounded-xl border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={!canEdit || isProcessingUpload}
                />
                <Button
                  variant="outline"
                  className="flex h-20 w-full items-center justify-center"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canEdit || isProcessingUpload}
                >
                  {isProcessingUpload ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-5 w-5" />
                      Upload your image
                    </>
                  )}
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Your uploads</p>
                {isLoadingImages && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              {isLoadingImages ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
                  Loading images…
                </div>
              ) : availableUploads.length > 0 ? (
                <div className="max-h-48 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    {availableUploads.map(image => {
                      const isSelected = selectedImage?.url === image.url;
                      return (
                        <button
                          key={image.id}
                          type="button"
                          onClick={() =>
                            handleImageClick({
                              url: image.url,
                              label: image.label,
                              source: 'upload',
                            })
                          }
                          className={cn(
                            'group relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-all',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                            canEdit && 'hover:scale-[1.02] hover:border-primary/40',
                            isSelected ? SELECTED_CLASSES : 'border-border/60',
                            !canEdit && 'cursor-not-allowed opacity-50',
                          )}
                          disabled={!canEdit}
                        >
                          <img src={image.url} alt={image.label} className="h-full w-full object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="truncate text-[11px] font-medium text-white">{image.label}</p>
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
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
                  Upload images to see them here during this session. Connect to a project to access shared uploads.
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Stock images</p>
                <p className="text-xs text-muted-foreground">
                  Choose from curated royalty-free visuals.
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
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
                          isSelected ? SELECTED_CLASSES : 'border-border/60',
                          !canEdit && 'cursor-not-allowed opacity-50',
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
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 px-5 py-4">
          <div className="flex items-center justify-between">
            {onRemoveImage && currentImage ? (
              <Button
                variant="ghost"
                type="button"
                className="h-9 px-3 text-xs text-destructive"
                onClick={handleRemove}
                disabled={!canEdit || isProcessingUpload}
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
              <Button type="button" onClick={handleInsertImage} disabled={insertDisabled} className="h-9 px-4 text-xs">
                Insert image
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagePanel;

