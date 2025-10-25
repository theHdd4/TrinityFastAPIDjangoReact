import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon, Check, Trash2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { EXHIBITION_API } from '@/lib/api';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';

export type ImagePanelSource = 'stock' | 'upload' | 'existing';

export interface ImageSelectionMetadata {
  title?: string | null;
  source: ImagePanelSource;
}

interface StoredImage {
  objectName: string;
  filename: string;
  url: string;
  uploadedAt?: string | null;
}

interface SelectedImage {
  url: string;
  title?: string | null;
  name?: string | null;
  source: ImagePanelSource;
  objectName?: string | null;
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
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

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
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  useEffect(() => {
    setProjectContext(getActiveProjectContext());
  }, []);

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

      const response = await fetch(`${EXHIBITION_API}/images?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const rawImages = Array.isArray(payload.images) ? payload.images : [];

      const mapped: StoredImage[] = rawImages
        .map((image: any) => {
          const objectName: string = image?.object_name ?? image?.objectName ?? '';
          const url: string = image?.url ?? '';
          if (!objectName || !url) {
            return null;
          }
          const filename: string = image?.filename ?? image?.name ?? objectName.split('/').pop() ?? 'Uploaded image';
          const uploadedAt: string | null = image?.uploaded_at ?? image?.uploadedAt ?? null;
          return {
            objectName,
            filename,
            url,
            uploadedAt,
          };
        })
        .filter((value): value is StoredImage => Boolean(value));

      mapped.sort((a, b) => {
        const aTime = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const bTime = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        return bTime - aTime;
      });

      setStoredImages(mapped);
    } catch (error) {
      console.error('Failed to load exhibition images', error);
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
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!canEdit) {
        return;
      }

      const files = event.target.files;
      event.target.value = '';

      if (!files || files.length === 0) {
        return;
      }

      if (!projectContext) {
        toast({
          title: 'Project details unavailable',
          description: 'Select a client, app, and project before uploading images.',
          variant: 'destructive',
        });
        return;
      }

      let uploadedAny = false;
      setIsUploading(true);

      const allFiles = Array.from(files);
      const validFiles: File[] = [];
      const rejectedFiles: string[] = [];

      for (const file of allFiles) {
        const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
          rejectedFiles.push(file.name);
          continue;
        }
        validFiles.push(file);
      }

      if (rejectedFiles.length > 0) {
        toast({
          title: rejectedFiles.length === 1 ? `${rejectedFiles[0]} was not uploaded` : 'Some files were skipped',
          description:
            'Only .jpg, .jpeg, or .png files can be uploaded from the selected folder.',
          variant: 'destructive',
        });
      }

      if (validFiles.length === 0) {
        setIsUploading(false);
        return;
      }

      try {
        for (const file of validFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('client_name', projectContext.client_name);
          formData.append('app_name', projectContext.app_name);
          formData.append('project_name', projectContext.project_name);

          const response = await fetch(`${EXHIBITION_API}/images/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (!response.ok) {
            const message = await response.text().catch(() => '');
            console.error('Image upload failed', response.status, message);
            toast({
              title: `Could not upload ${file.name}`,
              description: 'Please try again in a moment.',
              variant: 'destructive',
            });
            continue;
          }

          const payload = await response.json();
          const uploaded = payload?.image;
          const objectName: string = uploaded?.object_name ?? uploaded?.objectName ?? '';
          const url: string = uploaded?.url ?? '';
          if (!objectName || !url) {
            continue;
          }
          const filename: string = uploaded?.filename ?? file.name;
          const uploadedAt: string | null = uploaded?.uploaded_at ?? uploaded?.uploadedAt ?? null;

          uploadedAny = true;
          setStoredImages(prev => {
            const filtered = prev.filter(image => image.objectName !== objectName);
            const next: StoredImage = {
              objectName,
              filename,
              url,
              uploadedAt,
            };
            return [next, ...filtered];
          });
          setSelectedImage({ url, name: filename, source: 'upload', objectName });
        }
      } catch (error) {
        console.error('Failed to upload image', error);
        toast({
          title: 'Upload failed',
          description: 'We were unable to upload the selected images.',
          variant: 'destructive',
        });
      } finally {
        setIsUploading(false);
      }

      if (uploadedAny) {
        await fetchStoredImages();
      }
    },
    [canEdit, projectContext, toast, fetchStoredImages],
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
    if (!selectedImage || !canEdit || isUploading) {
      return;
    }

    if (selectedImage.source === 'existing' && selectedImage.url === currentImage) {
      onClose();
      return;
    }

    const title =
      selectedImage.title ??
      selectedImage.name ??
      (selectedImage.source === 'upload' ? 'Uploaded image' : 'Selected image');

    onImageSelect(selectedImage.url, {
      title,
      source: selectedImage.source,
    });
    onClose();
  }, [canEdit, currentImage, onClose, onImageSelect, selectedImage, isUploading]);

  const handleRemove = useCallback(() => {
    if (!canEdit || isUploading) {
      return;
    }
    onRemoveImage?.();
    setSelectedImage(null);
  }, [canEdit, isUploading, onRemoveImage]);

  const isInsertDisabled = useMemo(() => {
    if (!selectedImage || !canEdit || isUploading) {
      return true;
    }
    if (selectedImage.source === 'existing' && selectedImage.url === currentImage) {
      return true;
    }
    return false;
  }, [canEdit, currentImage, isUploading, selectedImage]);

  const uploadsPath = useMemo(() => {
    if (!projectContext) {
      return null;
    }
    return `${projectContext.client_name || '—'}/${projectContext.app_name || '—'}/${projectContext.project_name || '—'}/Images`;
  }, [projectContext]);

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
                  Add your own visuals to customise this slide&apos;s accent image. JPEG and PNG files are supported.
                </p>
                {uploadsPath ? (
                  <p className="text-[11px] text-muted-foreground">
                    Files are saved to <span className="font-medium text-foreground">{uploadsPath}</span>.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Project information is required before images can be uploaded.
                  </p>
                )}
              </div>
              <div className="rounded-xl border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={!canEdit || isUploading}
                />
                <Button
                  variant="outline"
                  className="flex h-20 w-full items-center justify-center"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  disabled={!canEdit || !projectContext || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-5 w-5" />
                      Select folder images
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
              {projectContext ? (
                isLoadingImages ? (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
                    Loading images…
                  </div>
                ) : storedImages.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-3">
                      {storedImages.map(image => {
                        const isSelected = selectedImage?.url === image.url;
                        return (
                          <button
                            key={image.objectName}
                            type="button"
                            onClick={() =>
                              handleImageClick({
                                url: image.url,
                                name: image.filename,
                                source: 'upload',
                                objectName: image.objectName,
                              })
                            }
                            className={cn(
                              'group relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-all',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                              canEdit && 'hover:scale-[1.02] hover:border-primary/40',
                              isSelected ? SELECTED_RING_CLASSES : 'border-border/60',
                              !canEdit && 'cursor-not-allowed opacity-50',
                            )}
                            disabled={!canEdit}
                          >
                            <img src={image.url} alt={image.filename} className="h-full w-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <p className="truncate text-[11px] font-medium text-white">{image.filename}</p>
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
                    Upload images to populate this gallery.
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
                  Connect to a project to view previously uploaded images.
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Stock images</p>
                <p className="text-xs text-muted-foreground">
                  Choose from curated royalty-free visuals to enhance your narrative.
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
                          isSelected ? SELECTED_RING_CLASSES : 'border-border/60',
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
                disabled={!canEdit || isUploading}
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
        </div>
      </div>
    </div>
  );
};

export default ImagePanel;
