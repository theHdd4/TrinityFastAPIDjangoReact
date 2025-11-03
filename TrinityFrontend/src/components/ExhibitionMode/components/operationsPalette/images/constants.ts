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
}

export const createImageSlideObject = (
  id: string,
  src: string,
  options: CreateImageObjectOptions = {},
  overrides: Partial<SlideObject> = {},
): SlideObject => {
  const { props: overrideProps, ...restOverrides } = overrides;

  const base: SlideObject = {
    id,
    type: 'image',
    x: DEFAULT_IMAGE_OBJECT_X,
    y: DEFAULT_IMAGE_OBJECT_Y,
    width: DEFAULT_IMAGE_OBJECT_WIDTH,
    height: DEFAULT_IMAGE_OBJECT_HEIGHT,
    zIndex: 1,
    rotation: 0,
    groupId: null,
    props: {
      src,
      name: options.name ?? null,
      source: options.source ?? null,
      ...(overrideProps ?? {}),
    },
    position: { x: DEFAULT_IMAGE_OBJECT_X, y: DEFAULT_IMAGE_OBJECT_Y },
    size: { width: DEFAULT_IMAGE_OBJECT_WIDTH, height: DEFAULT_IMAGE_OBJECT_HEIGHT },
    content: {
      src,
      name: options.name ?? null,
      source: options.source ?? null,
    },
    isSelected: false,
  } as SlideObject;

  const resolvedX = restOverrides.x ?? base.x;
  const resolvedY = restOverrides.y ?? base.y;
  const resolvedWidth = restOverrides.width ?? base.width;
  const resolvedHeight = restOverrides.height ?? base.height;

  return {
    ...base,
    ...restOverrides,
    x: resolvedX,
    y: resolvedY,
    width: resolvedWidth,
    height: resolvedHeight,
    position: restOverrides.position ?? { x: resolvedX, y: resolvedY },
    size: restOverrides.size ?? { width: resolvedWidth, height: resolvedHeight },
    props: {
      ...(base.props ?? {}),
      ...(overrideProps ?? {}),
    },
    content:
      restOverrides.content ?? {
        src,
        name: options.name ?? null,
        source: options.source ?? null,
      },
    isSelected: restOverrides.isSelected ?? false,
  };
};
