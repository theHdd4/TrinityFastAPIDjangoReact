import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  columnIndexToLetter,
  letterToColumnIndex,
  toAddress,
  parseAddress,
  makeCellKey,
  debugSelection,
  setSelectionDebugEnabled,
  type CellLocator,
} from '../selectionUtils';

describe('selectionUtils', () => {
  describe('columnIndexToLetter', () => {
    it('converts zero-based indices to spreadsheet letters', () => {
      expect(columnIndexToLetter(0)).toBe('A');
      expect(columnIndexToLetter(25)).toBe('Z');
      expect(columnIndexToLetter(26)).toBe('AA');
      expect(columnIndexToLetter(51)).toBe('AZ');
      expect(columnIndexToLetter(52)).toBe('BA');
    });

    it('returns empty string for negative indices', () => {
      expect(columnIndexToLetter(-1)).toBe('');
    });
  });

  describe('letterToColumnIndex', () => {
    it('converts spreadsheet letters to zero-based indices', () => {
      expect(letterToColumnIndex('A')).toBe(0);
      expect(letterToColumnIndex('Z')).toBe(25);
      expect(letterToColumnIndex('AA')).toBe(26);
      expect(letterToColumnIndex('ba')).toBe(52);
    });

    it('returns -1 for invalid input', () => {
      expect(letterToColumnIndex('')).toBe(-1);
      expect(letterToColumnIndex('1A')).toBe(-1);
      expect(letterToColumnIndex('A1B')).toBe(-1);
    });
  });

  describe('toAddress and parseAddress', () => {
    it('round trips row/column indices to Excel-style addresses', () => {
      const address = toAddress(4, 2);
      expect(address).toBe('C5');
      expect(parseAddress(address)).toEqual({ rowIndex: 4, colIndex: 2 });
    });

    it('returns empty address for invalid indices', () => {
      expect(toAddress(-1, 2)).toBe('');
      expect(toAddress(3, -1)).toBe('');
    });

    it('returns null for invalid addresses', () => {
      expect(parseAddress('')).toBeNull();
      expect(parseAddress('AA')).toBeNull();
      expect(parseAddress('12')).toBeNull();
      expect(parseAddress('A0')).toBeNull();
    });
  });

  describe('makeCellKey', () => {
    it('creates a stable key from cell locator', () => {
      const locator: CellLocator = { rowKey: '42', colKey: 'Revenue' };
      expect(makeCellKey(locator)).toBe('42::Revenue');
    });
  });

  describe('debugSelection', () => {
    const originalConsoleDebug = console.debug;

    beforeEach(() => {
      (globalThis as unknown as { window: Record<string, unknown> }).window = {};
      console.debug = vi.fn();
      setSelectionDebugEnabled(false);
    });

    afterEach(() => {
      console.debug = originalConsoleDebug;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window;
    });

    it('does not log when debug flag is disabled', () => {
      debugSelection('event', { foo: 'bar' });
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('logs when debug flag is enabled', () => {
      setSelectionDebugEnabled(true);
      debugSelection('event', { foo: 'bar' });
      expect(console.debug).toHaveBeenCalledOnce();
      const [[message, payload]] = (console.debug as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(message).toMatch(/\[df-selection\]/);
      expect(payload).toEqual({ foo: 'bar' });
    });
  });
});
