import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Loader2, Maximize2, Search, Trash2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  displayUrl: string;
  label: string;
  uploadedAt?: string | null;
}

interface SelectedImage {
  url: string;
  label?: string | null;
  title?: string | null;
  source: ImagePanelSource;
}

export type ImageSelectionRequest = {
  imageUrl: string;
  metadata: ImageSelectionMetadata;
};

export interface ImagePanelProps {
  currentImage?: string | null;
  currentImageName?: string | null;
  onClose: () => void;
  onImageSelect: (selections: ImageSelectionRequest[]) => void;
  onRemoveImage?: () => void;
  canEdit?: boolean;
  fullscreenOpen?: boolean;
  onFullscreenOpenChange?: (open: boolean) => void;
  fullscreenOnly?: boolean;
  fullscreenTitle?: string;
  fullscreenDescription?: string;
  insertButtonLabel?: string;
  allowMultipleUploadSelection?: boolean;
}

const FREE_IMAGE_LIBRARY_ENDPOINT = 'https://pixabay.com/api/';
const FREE_IMAGE_LIBRARY_FALLBACK_KEY = '53025349-5cb3ede8add7ca256da259955';
const DEFAULT_LIBRARY_SEARCH_TERM = 'Business Analytics';

const resolveFreeImageLibraryKey = (): string => {
  const envKey = (import.meta.env?.VITE_PIXABAY_API_KEY as string | undefined) ?? undefined;
  if (typeof envKey === 'string' && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return FREE_IMAGE_LIBRARY_FALLBACK_KEY;
};

const FREE_IMAGE_LIBRARY_KEY = resolveFreeImageLibraryKey();

const SELECTED_CLASSES = 'border-primary ring-2 ring-primary/20';

interface LibraryImage {
  id: string;
  url: string;
  previewUrl: string;
  label: string;
  author?: string | null;
}

const buildDisplayUrl = (objectName: string): string => {
  const encoded = encodeURIComponent(objectName);
  return `${IMAGES_API}/content?object_name=${encoded}`;
};

const normaliseStoredImage = (image: any): StoredImage | null => {
  const resolveString = (...values: Array<unknown>): string | null => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  };

  const objectName = resolveString(
    image?.object_name,
    image?.objectName,
    image?.key,
    image?.path,
    image?.id,
  );
  const rawUrl = resolveString(
    image?.url,
    image?.image_url,
    image?.imageUrl,
    image?.public_url,
    image?.publicUrl,
    image?.signed_url,
    image?.signedUrl,
  );

  if (!objectName && !rawUrl) {
    return null;
  }

  const label =
    resolveString(
      image?.filename,
      image?.file_name,
      image?.original_filename,
      image?.originalFilename,
      image?.name,
      image?.title,
    ) ??
    (objectName?.split('/').pop() ?? rawUrl?.split('/').pop() ?? 'Uploaded image');

  const uploadedAt =
    resolveString(
      image?.uploaded_at,
      image?.uploadedAt,
      image?.created_at,
      image?.createdAt,
      image?.last_modified,
      image?.lastModified,
    ) ?? null;

  const displayUrl = objectName ? buildDisplayUrl(objectName) : rawUrl!;

  return {
    id: objectName ?? displayUrl,
    url: rawUrl ?? displayUrl,
    displayUrl,
    label,
    uploadedAt,
  };
};

const normaliseLibraryImage = (image: any): LibraryImage | null => {
  if (!image) {
    return null;
  }

  const id = (() => {
    if (typeof image?.id === 'number' && Number.isFinite(image.id)) {
      return String(image.id);
    }
    if (typeof image?.id === 'string' && image.id.trim().length > 0) {
      return image.id.trim();
    }
    if (typeof image?.uuid === 'string' && image.uuid.trim().length > 0) {
      return image.uuid.trim();
    }
    return null;
  })();

  const fullImageUrl = (() => {
    const candidates = [
      image?.largeImageURL,
      image?.fullHDURL,
      image?.imageURL,
      image?.webformatURL,
      image?.url,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  })();

  const previewUrl = (() => {
    const candidates = [image?.webformatURL, image?.previewURL, image?.thumbnailUrl, fullImageUrl];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  })();

  if (!id || !fullImageUrl || !previewUrl) {
    return null;
  }

  const label = (() => {
    if (typeof image?.tags === 'string' && image.tags.trim().length > 0) {
      const tags = image.tags
        .split(',')
        .map((tag: string) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        return tags.slice(0, 2).join(' · ');
      }
    }
    if (typeof image?.title === 'string' && image.title.trim().length > 0) {
      return image.title.trim();
    }
    return 'Free image';
  })();

  const author = typeof image?.user === 'string' && image.user.trim().length > 0 ? image.user.trim() : null;

  return {
    id,
    url: fullImageUrl,
    previewUrl,
    label,
    author,
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
  fullscreenOpen,
  onFullscreenOpenChange,
  fullscreenOnly = false,
  fullscreenTitle = 'Image library',
  fullscreenDescription = 'Browse uploads and explore free visuals in a spacious view for confident selections.',
  insertButtonLabel = 'Insert image',
  allowMultipleUploadSelection = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [selectedUploads, setSelectedUploads] = useState<Map<string, SelectedImage>>(
    new Map<string, SelectedImage>(),
  );
  const [uncontrolledFullscreenOpen, setUncontrolledFullscreenOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_LIBRARY_SEARCH_TERM);
  const [searchResults, setSearchResults] = useState<LibraryImage[]>([]);
  const [isSearchingLibrary, setIsSearchingLibrary] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearchedLibrary, setHasSearchedLibrary] = useState(false);
  const [lastSearchTerm, setLastSearchTerm] = useState('');
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setProjectContext(getActiveProjectContext());
  }, []);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setSelectedUploads(prev => (prev.size === 0 ? prev : new Map<string, SelectedImage>()));
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

  const performLibrarySearch = useCallback(
    async (rawQuery: string) => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }

      const trimmed = rawQuery.trim();
      if (trimmed.length === 0) {
        setIsSearchingLibrary(false);
        setSearchError('Enter a search term to explore free images.');
        setSearchResults([]);
        setHasSearchedLibrary(false);
        setLastSearchTerm('');
        return;
      }

      const controller = new AbortController();
      searchAbortRef.current = controller;

      setIsSearchingLibrary(true);
      setSearchError(null);
      setHasSearchedLibrary(true);
      setLastSearchTerm(trimmed);

      try {
        const params = new URLSearchParams({
          key: FREE_IMAGE_LIBRARY_KEY,
          q: trimmed,
          image_type: 'photo',
          orientation: 'horizontal',
          safesearch: 'true',
          per_page: '48',
          editors_choice: 'true',
        });

        const response = await fetch(`${FREE_IMAGE_LIBRARY_ENDPOINT}?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Search failed (${response.status})`);
        }

        const payload = await response.json();
        const mapped = Array.isArray(payload?.hits)
          ? (payload.hits as any[])
              .map(normaliseLibraryImage)
              .filter((value): value is LibraryImage => Boolean(value))
          : [];

        setSearchResults(mapped);
        setSelectedImage(prev => (prev?.source === 'stock' ? null : prev));
        setSelectedUploads(prev => (prev.size === 0 ? prev : new Map<string, SelectedImage>()));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Unable to search images', error);
        setSearchResults([]);
        setSearchError('We could not load images. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingLibrary(false);
        }
        searchAbortRef.current = null;
      }
    },
    [],
  );

  const handleLibrarySearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void performLibrarySearch(searchQuery);
    },
    [performLibrarySearch, searchQuery],
  );

  useEffect(() => {
    if (!hasSearchedLibrary && searchQuery === DEFAULT_LIBRARY_SEARCH_TERM) {
      void performLibrarySearch(DEFAULT_LIBRARY_SEARCH_TERM);
    }
  }, [hasSearchedLibrary, performLibrarySearch, searchQuery]);

  const handleUploadToggle = useCallback(
    (image: StoredImage) => {
      if (!canEdit) {
        return;
      }

      setSelectedUploads(prev => {
        if (!allowMultipleUploadSelection) {
          const next = new Map<string, SelectedImage>();
          if (prev.has(image.id)) {
            return next;
          }
          next.set(image.id, {
            url: image.displayUrl,
            label: image.label,
            source: 'upload',
          });
          return next;
        }

        const next = new Map(prev);
        if (next.has(image.id)) {
          next.delete(image.id);
        } else {
          next.set(image.id, {
            url: image.displayUrl,
            label: image.label,
            source: 'upload',
          });
        }
        return next;
      });
      setSelectedImage(null);
    },
    [allowMultipleUploadSelection, canEdit],
  );

  const handleImageClick = useCallback(
    (image: SelectedImage) => {
      if (!canEdit) {
        return;
      }

      setSelectedUploads(prev => (prev.size === 0 ? prev : new Map<string, SelectedImage>()));
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

        setSelectedUploads(prev => {
          const next = new Map(prev);
          next.set(uploadedImage.id, {
            url: uploadedImage.displayUrl,
            label: uploadedImage.label,
            source: 'upload',
          });
          return next;
        });
        setSelectedImage(null);
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
    if (!canEdit || isProcessingUpload) {
      return;
    }

    const uploads = Array.from(selectedUploads.values());
    const selections =
      uploads.length > 0
        ? uploads
        : selectedImage
        ? [selectedImage]
        : [];

    if (selections.length === 0) {
      return;
    }

    if (
      uploads.length === 0 &&
      selections[0]?.source === 'existing' &&
      selections[0]?.url === currentImage
    ) {
      onClose();
      return;
    }

    const payload = selections.map<ImageSelectionRequest>(selection => ({
      imageUrl: selection.url,
      metadata: {
        title: resolveSelectionTitle(selection),
        source: selection.source,
      },
    }));

    onImageSelect(payload);
    setSelectedUploads(new Map<string, SelectedImage>());
    setSelectedImage(null);
    onClose();
  }, [
    canEdit,
    currentImage,
    isProcessingUpload,
    onClose,
    onImageSelect,
    selectedImage,
    selectedUploads,
  ]);

  const handleRemove = useCallback(() => {
    if (!canEdit || isProcessingUpload) {
      return;
    }
    onRemoveImage?.();
    setSelectedUploads(new Map<string, SelectedImage>());
    setSelectedImage(null);
  }, [canEdit, isProcessingUpload, onRemoveImage]);

  const uploadsPath = useMemo(() => buildUploadsPath(projectContext), [projectContext]);

  const availableUploads = storedImages;

  const selectedUploadCount = selectedUploads.size;
  const hasUploadSelections = selectedUploadCount > 0;
  const insertDisabled =
    (!hasUploadSelections && !selectedImage) ||
    !canEdit ||
    isProcessingUpload ||
    (hasUploadSelections
      ? false
      : selectedImage?.source === 'existing' && selectedImage.url === currentImage);
  const insertLabel = hasUploadSelections && selectedUploadCount > 1
    ? `Insert ${selectedUploadCount} images`
    : insertButtonLabel;

  const isFullscreenControlled = typeof fullscreenOpen === 'boolean';
  const resolvedFullscreenOpen = isFullscreenControlled ? fullscreenOpen! : uncontrolledFullscreenOpen;

  const setFullscreenState = useCallback(
    (next: boolean) => {
      if (!isFullscreenControlled) {
        setUncontrolledFullscreenOpen(next);
      }
      onFullscreenOpenChange?.(next);
    },
    [isFullscreenControlled, onFullscreenOpenChange],
  );

  const openFullscreen = useCallback(() => setFullscreenState(true), [setFullscreenState]);
  const closeFullscreen = useCallback(() => setFullscreenState(false), [setFullscreenState]);

  useEffect(() => {
    if (fullscreenOnly && fullscreenOpen === undefined && !resolvedFullscreenOpen) {
      setFullscreenState(true);
    }
  }, [fullscreenOnly, fullscreenOpen, resolvedFullscreenOpen, setFullscreenState]);

  const renderImageSections = useCallback(
    (variant: 'default' | 'fullscreen' = 'default') => {
      const paddingClasses = variant === 'fullscreen' ? 'space-y-6 px-8 py-8' : 'space-y-5 px-5 py-5';
      const uploadsScrollClasses = cn(
        'overflow-y-auto pr-1',
        variant === 'fullscreen' ? 'max-h-[50vh] pr-3' : 'max-h-48',
      );
      const uploadsGridClasses = cn(
        'grid gap-3',
        variant === 'fullscreen' ? 'grid-cols-3 xl:grid-cols-4' : 'grid-cols-2',
      );
      const libraryScrollClasses = cn(
        'overflow-y-auto pr-1',
        variant === 'fullscreen' ? 'max-h-[55vh] pr-3' : 'max-h-64',
      );
      const libraryGridClasses = cn(
        'grid gap-3',
        variant === 'fullscreen' ? 'grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2',
      );
      const searchButtonDisabled = isSearchingLibrary || searchQuery.trim().length === 0;

      return (
        <div className={cn('space-y-5', paddingClasses)}>
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
              <>
              {allowMultipleUploadSelection && (
                <p className="text-[11px] text-muted-foreground">
                  Tip: Click multiple uploads to insert them together.
                </p>
              )}
                <div className={uploadsScrollClasses}>
                  <div className={uploadsGridClasses}>
                    {availableUploads.map(image => {
                      const isSelected = selectedUploads.has(image.id);
                      return (
                        <button
                          key={image.id}
                          type="button"
                          onClick={() => handleUploadToggle(image)}
                          className={cn(
                            'group relative aspect-video w-full overflow-hidden rounded-lg border-2 transition-all',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                            canEdit && 'hover:scale-[1.02] hover:border-primary/40',
                            isSelected ? SELECTED_CLASSES : 'border-border/60',
                            !canEdit && 'cursor-not-allowed opacity-50',
                          )}
                          disabled={!canEdit}
                          aria-pressed={isSelected}
                        >
                          <img src={image.displayUrl} alt={image.label} className="h-full w-full object-cover" />
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
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
                Upload images to see them here during this session. Connect to a project to access shared uploads.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Search free images</p>
              <p className="text-xs text-muted-foreground">
                Discover high-quality visuals to drop into your slide.
              </p>
            </div>
            <form onSubmit={handleLibrarySearchSubmit} className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={searchQuery}
                  onChange={event => {
                    setSearchQuery(event.target.value);
                    if (searchError) {
                      setSearchError(null);
                    }
                  }}
                  placeholder="Try searching for analytics, dashboards, or teams"
                  className="h-9 flex-1"
                  disabled={isSearchingLibrary}
                />
                <Button
                  type="submit"
                  className="h-9 px-4 text-xs"
                  disabled={searchButtonDisabled}
                >
                  {isSearchingLibrary ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Searching…
                    </>
                  ) : (
                    <>
                      <Search className="mr-1.5 h-3.5 w-3.5" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </form>
            {searchError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {searchError}
              </div>
            ) : null}
            {isSearchingLibrary ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
                Looking for images…
              </div>
            ) : searchResults.length > 0 ? (
              <div className={libraryScrollClasses}>
                <div className={libraryGridClasses}>
                  {searchResults.map(image => {
                    const isSelected = selectedImage?.url === image.url;
                    return (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() =>
                          handleImageClick({
                            url: image.url,
                            title: image.label,
                            label: image.author ? `${image.label} — ${image.author}` : image.label,
                            source: 'stock',
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
                        <img src={image.previewUrl} alt={image.label} className="h-full w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 space-y-0.5 bg-gradient-to-t from-black/75 to-transparent p-2">
                          <p className="truncate text-[11px] font-medium text-white">{image.label}</p>
                          {image.author && (
                            <p className="truncate text-[10px] font-medium text-white/80">by {image.author}</p>
                          )}
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
            ) : hasSearchedLibrary && !searchError ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
                {lastSearchTerm
                  ? `No images matched "${lastSearchTerm}". Try another search.`
                  : 'No images found. Try another search.'}
              </div>
            ) : !hasSearchedLibrary ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
                Start by searching for the kind of image you need.
              </div>
            ) : null}
          </section>
        </div>
      );
    },
    [
      availableUploads,
      allowMultipleUploadSelection,
      canEdit,
      handleFileUpload,
      handleImageClick,
      handleLibrarySearchSubmit,
      handleUploadToggle,
      isLoadingImages,
      isProcessingUpload,
      isSearchingLibrary,
      lastSearchTerm,
      selectedImage,
      selectedUploads,
      searchError,
      searchQuery,
      searchResults,
      hasSearchedLibrary,
      uploadsPath,
    ],
  );

  const renderFooter = useCallback(
    (variant: 'default' | 'fullscreen' = 'default') => (
      <div
        className={cn(
          'border-t border-border/60',
          variant === 'fullscreen' ? 'px-8 py-6' : 'px-5 py-4',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              type="button"
              onClick={variant === 'fullscreen' ? closeFullscreen : onClose}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                handleInsertImage();
                if (variant === 'fullscreen') {
                  closeFullscreen();
                }
              }}
              disabled={insertDisabled}
              className="h-9 px-4 text-xs"
            >
              {insertLabel}
            </Button>
          </div>
        </div>
      </div>
    ),
    [
      canEdit,
      closeFullscreen,
      currentImage,
      handleInsertImage,
      handleRemove,
      insertDisabled,
      insertLabel,
      isProcessingUpload,
      onClose,
      onRemoveImage,
    ],
  );

  return (
    <>
      <Dialog open={resolvedFullscreenOpen} onOpenChange={setFullscreenState}>
        <DialogContent
          hideCloseButton
          className="max-w-6xl w-[92vw] h-[85vh] p-0 gap-0 overflow-hidden border border-border/60 bg-background shadow-[0_20px_60px_rgba(15,23,42,0.25)]"
        >
          <DialogHeader className="px-8 py-6 border-b border-border/60 bg-muted/30">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                  <ImageIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-semibold text-foreground">{fullscreenTitle}</DialogTitle>
                  <p className="text-sm text-muted-foreground">{fullscreenDescription}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg hover:bg-muted transition-colors"
                onClick={closeFullscreen}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex flex-1 flex-col overflow-hidden bg-muted/10">
            <ScrollArea className="flex-1">
              {renderImageSections('fullscreen')}
            </ScrollArea>
            {renderFooter('fullscreen')}
          </div>
        </DialogContent>
      </Dialog>

      {!fullscreenOnly && (
        <div className="flex h-full w-full max-w-[22rem] flex-col rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-foreground">Images</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={openFullscreen}
                aria-label="Open full screen image library"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
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
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <ScrollArea className="flex-1">{renderImageSections('default')}</ScrollArea>
            {renderFooter('default')}
          </div>
        </div>
      )}
    </>
  );
};

export default ImagePanel;

