import type { SlideObject } from '../../../store/exhibitionStore';

const DEFAULT_IMAGE_OBJECT_WIDTH = 360;
const DEFAULT_IMAGE_OBJECT_HEIGHT = 240;
const DEFAULT_IMAGE_OBJECT_X = 96;
const DEFAULT_IMAGE_OBJECT_Y = 192;

const generateFallbackId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const resolveId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
    return (crypto as Crypto).randomUUID();
  }

  return generateFallbackId(prefix);
};

export const generateImageObjectId = () => resolveId('image');

export interface CreateImageObjectOptions {
  name?: string | null;
  source?: string | null;
  fullBleed?: boolean;
}

export interface CreateImageSlideObjectOptions extends CreateImageObjectOptions {
  existingObjects?: SlideObject[];
  overrides?: Partial<SlideObject>;
}

const resolveNextZIndex = (objects: SlideObject[] | undefined): number => {
  if (!Array.isArray(objects) || objects.length === 0) {
    return 1;
  }

  const max = objects.reduce((acc, object) => {
    const value = typeof object.zIndex === 'number' ? object.zIndex : 0;
    return value > acc ? value : acc;
  }, 0);

  return Math.round(max) + 1;
};

export const createImageSlideObject = (
  id: string,
  src: string,
  options: CreateImageSlideObjectOptions = {},
): SlideObject => {
  const { existingObjects = [], overrides = {}, name = null, source = null, fullBleed = false } = options;
  const { props: overrideProps = {}, zIndex: overrideZIndex, ...restOverrides } = overrides;
  const propsOverrides = (overrideProps ?? {}) as Record<string, unknown>;
  const { fullBleed: overrideFullBleedValue, ...restPropOverrides } = propsOverrides;

  const zIndex =
    typeof overrideZIndex === 'number' && Number.isFinite(overrideZIndex)
      ? Math.round(overrideZIndex)
      : resolveNextZIndex(existingObjects);

  const resolvedFullBleed =
    typeof overrideFullBleedValue === 'boolean' ? overrideFullBleedValue : Boolean(fullBleed);

  return {
    id,
    type: 'image',
    x: DEFAULT_IMAGE_OBJECT_X,
    y: DEFAULT_IMAGE_OBJECT_Y,
    width: DEFAULT_IMAGE_OBJECT_WIDTH,
    height: DEFAULT_IMAGE_OBJECT_HEIGHT,
    zIndex,
    rotation: 0,
    groupId: null,
    props: {
      src,
      name,
      source,
      fullBleed: resolvedFullBleed,
      fit: 'cover',
      flipHorizontal: false,
      flipVertical: false,
      animate: false,
      ...restPropOverrides,
    },
    ...restOverrides,
  };
};
