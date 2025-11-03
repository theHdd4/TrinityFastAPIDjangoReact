import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_EXHIBITION_THEME } from '../../themes';
import {
  type SlideObject,
  useExhibitionStore,
} from '../exhibitionStore';

const CARD_ID = 'card-1';

const createObject = (id: string, zIndex: number): SlideObject => ({
  id,
  type: 'shape',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  zIndex,
  groupId: null,
  props: {},
});

const baseObjects: SlideObject[] = [
  createObject('obj-a', 1),
  createObject('obj-b', 2),
  createObject('obj-c', 3),
  createObject('obj-d', 4),
];

const resetStore = () => {
  useExhibitionStore.setState({
    cards: [],
    exhibitedCards: [],
    catalogueCards: [],
    catalogueEntries: [],
    lastLoadedContext: null,
    activeTheme: DEFAULT_EXHIBITION_THEME,
    slideObjectsByCardId: {
      [CARD_ID]: baseObjects.map((object, index) => ({
        ...object,
        zIndex: index + 1,
      })),
    },
  });
};

describe('exhibitionStore layering actions', () => {
  beforeEach(() => {
    resetStore();
  });

  const readOrder = () =>
    useExhibitionStore
      .getState()
      .slideObjectsByCardId[CARD_ID]
      ?.map(object => ({ id: object.id, zIndex: object.zIndex }));

  it('brings targeted objects to the front while preserving relative order', () => {
    useExhibitionStore.getState().bringSlideObjectsToFront(CARD_ID, ['obj-b']);

    const result = readOrder();
    expect(result?.map(entry => entry.id)).toEqual(['obj-a', 'obj-c', 'obj-d', 'obj-b']);
    expect(result?.map(entry => entry.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it('moves contiguous selections forward as a block', () => {
    useExhibitionStore
      .getState()
      .bringSlideObjectsForward(CARD_ID, ['obj-b', 'obj-c']);

    const result = readOrder();
    expect(result?.map(entry => entry.id)).toEqual(['obj-a', 'obj-d', 'obj-b', 'obj-c']);
    expect(result?.map(entry => entry.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it('sends objects backward by a single layer', () => {
    useExhibitionStore.getState().sendSlideObjectsBackward(CARD_ID, ['obj-c']);

    const result = readOrder();
    expect(result?.map(entry => entry.id)).toEqual(['obj-a', 'obj-c', 'obj-b', 'obj-d']);
    expect(result?.map(entry => entry.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it('sends objects to the back of the stack', () => {
    useExhibitionStore.getState().sendSlideObjectsToBack(CARD_ID, ['obj-d']);

    const result = readOrder();
    expect(result?.map(entry => entry.id)).toEqual(['obj-d', 'obj-a', 'obj-b', 'obj-c']);
    expect(result?.map(entry => entry.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it('ignores requests when object ids are missing from the slide', () => {
    useExhibitionStore.getState().bringSlideObjectsForward(CARD_ID, ['missing']);

    const result = readOrder();
    expect(result?.map(entry => entry.id)).toEqual(['obj-a', 'obj-b', 'obj-c', 'obj-d']);
  });
});
