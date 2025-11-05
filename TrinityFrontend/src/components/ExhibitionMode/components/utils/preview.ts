import {
  type DroppedAtom,
  type LayoutCard,
  type SlideObject,
  buildSlideTitleObjectId,
  createSlideObjectFromAtom,
  resolveCardTitle,
} from '../../store/exhibitionStore';

const DEFAULT_TITLE_PROPS: Record<string, unknown> = {
  fontSize: 36,
  fontFamily: 'Comic Sans',
  bold: true,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  color: '#111827',
};

const cloneSlideObject = (object: SlideObject): SlideObject => ({
  ...object,
  props: { ...(object.props ?? {}) },
});

const normaliseZIndices = (objects: SlideObject[]): SlideObject[] => {
  return objects
    .slice()
    .sort((a, b) => {
      const aIndex = Number.isFinite(a.zIndex) ? a.zIndex : 0;
      const bIndex = Number.isFinite(b.zIndex) ? b.zIndex : 0;
      return aIndex - bIndex;
    })
    .map((object, index) => ({
      ...object,
      zIndex: index + 1,
    }));
};

const resolveAtomId = (object: SlideObject): string | null => {
  const props = object.props as { atom?: DroppedAtom } | undefined;
  if (props?.atom && typeof props.atom.id === 'string') {
    return props.atom.id;
  }
  if (typeof object.id === 'string') {
    return object.id;
  }
  return null;
};

const attachAtomToObject = (object: SlideObject, atom: DroppedAtom): SlideObject => {
  return {
    ...object,
    props: {
      ...(object.props ?? {}),
      atom,
    },
  };
};

const createTitleObject = (
  card: LayoutCard,
  atoms: DroppedAtom[],
  titleId: string,
  base?: SlideObject | null,
): SlideObject => {
  const props = base?.props as Record<string, unknown> | undefined;
  return {
    id: titleId,
    type: 'text-box',
    x: typeof base?.x === 'number' ? base.x : 64,
    y: typeof base?.y === 'number' ? base.y : 48,
    width: typeof base?.width === 'number' ? base.width : 560,
    height: typeof base?.height === 'number' ? base.height : 120,
    zIndex: typeof base?.zIndex === 'number' ? base.zIndex : 1,
    rotation: typeof base?.rotation === 'number' ? base.rotation : 0,
    groupId: base?.groupId ?? null,
    props: {
      ...DEFAULT_TITLE_PROPS,
      ...(props ?? {}),
      text: resolveCardTitle(card, atoms),
    },
  };
};

export const buildPreviewSlideObjects = (
  card: LayoutCard,
  sourceObjects?: SlideObject[] | null,
): SlideObject[] => {
  const atoms = Array.isArray(card.atoms) ? card.atoms : [];
  const titleId = buildSlideTitleObjectId(card.id);

  const previewObjects: SlideObject[] = [];
  const seenIds = new Set<string>();
  const usedAtomIds = new Set<string>();

  const pushObject = (object: SlideObject) => {
    if (object?.id && seenIds.has(object.id)) {
      return;
    }
    if (object?.id) {
      seenIds.add(object.id);
    }
    previewObjects.push(object);
  };

  let titleSource: SlideObject | null = null;

  (sourceObjects ?? []).forEach(object => {
    const clone = cloneSlideObject(object);
    if (!clone.id) {
      return;
    }

    if (clone.type === 'atom') {
      const atomId = resolveAtomId(clone);
      if (!atomId) {
        return;
      }
      const atom = atoms.find(candidate => candidate.id === atomId);
      if (!atom) {
        return;
      }
      usedAtomIds.add(atom.id);
      pushObject(attachAtomToObject(clone, atom));
      return;
    }

    if (clone.id === titleId && clone.type === 'text-box') {
      titleSource = clone;
      return;
    }

    pushObject(clone);
  });

  atoms.forEach((atom, index) => {
    if (usedAtomIds.has(atom.id)) {
      return;
    }
    const fallback = attachAtomToObject(
      createSlideObjectFromAtom(atom, {
        id: atom.id,
        zIndex: previewObjects.length + index + 1,
      }),
      atom,
    );
    usedAtomIds.add(atom.id);
    pushObject(fallback);
  });

  const hasTitle = previewObjects.some(object => object.id === titleId && object.type === 'text-box');
  const titleObject = createTitleObject(card, atoms, titleId, titleSource);

  if (!hasTitle) {
    pushObject(titleObject);
  }

  const normalised = normaliseZIndices(
    previewObjects.map(object => {
      if (object.id === titleId && object.type === 'text-box') {
        return createTitleObject(card, atoms, titleId, object);
      }
      return object;
    }),
  );

  return normalised;
};

export default buildPreviewSlideObjects;
