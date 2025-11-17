# DataFrame Operations – Formula Engine & UI Enhancements  

This note captures the problems we observed, the fixes we landed, and the current architecture so it’s easy to maintain or extend later.

---

## 1. Original Issues

### 1.1 Formula Editing UX Gaps
- **Always-on input:** Formula bar accepted input even when no column was selected. Users could type, but backend rejected the request (`Please select a target column first`).
- **No recall:** After applying a formula, re-selecting the column showed a blank bar. The expression was stored in state, but the UI didn’t resurface it.
- **Navigation friction:** Once a formula existed, selecting the column jumped straight into edit mode. Autocomplete opened immediately, making it awkward to move between columns.
- **Autocomplete regressions:** At various points `=` (with nothing else) didn’t insert the highlighted function; column suggestions appended tokens strangely (e.g. `SSalesValue`); the dropdown sometimes stayed open when clicking outside.

### 1.2 Behavioural Expectations
- When you return to a column, you should **see** the formula that produced it—but editing should be intentional.
- New/empty columns should be ready to edit immediately.
- Suggestions should behave like a spreadsheet: pressing Enter inserts the highlighted item, clicking outside closes the list.

---

## 2. Key Fixes & How They Work

### 2.1 Formula Engine State
```tsx
// DataFrameOperationsCanvas.tsx
const [formulaInput, setFormulaInput] = useState('');
const [isEditingFormula, setIsEditingFormula] = useState(false);
const [columnFormulas, setColumnFormulas] = useState<Record<string, string>>(
  settings.columnFormulas || {}
);
```
- `columnFormulas` mirrors the atom’s persisted settings (`settings.columnFormulas` in the Laboratory store).
- `formulaInput` reflects the current text in the bar.
- `isEditingFormula` tracks whether the bar is in edit mode or just displaying.

### 2.2 Selection Flow
```tsx
useEffect(() => {
  const storedFormula = selectedColumn ? columnFormulas[selectedColumn] : undefined;

  if (selectedColumn !== previousSelectedColumnRef.current) {
    previousSelectedColumnRef.current = selectedColumn;
    if (selectedColumn) {
      setFormulaInput(storedFormula ?? '');
      setIsEditingFormula(storedFormula === undefined); // new columns are editable immediately
      setFormulaValidationError(null);
    } else {
      setIsEditingFormula(false);
      setFormulaValidationError(null);
    }
    return;
  }

  if (selectedColumn && storedFormula !== undefined && storedFormula !== formulaInput) {
    setFormulaInput(storedFormula);
    setIsEditingFormula(false);
  }
}, [selectedColumn, columnFormulas, formulaInput]);
```
- **New column**: no stored formula ⇒ `isEditingFormula` becomes `true` so the user can type immediately.
- **Existing column**: stored formula detected ⇒ load it, show in view mode (`isEditingFormula = false`) until the user explicitly activates editing.

### 2.3 Formula Bar Component (`FormularBar.tsx`)

#### Props
```tsx
interface FormularBarProps {
  data: DataFrameData | null;
  selectedCell: { row: number; col: string } | null;
  selectedColumn: string | null;
  columnFormulas: Record<string, string>;
  formulaInput: string;
  isFormulaMode: boolean;
  isFormulaBarFrozen?: boolean;
  isEditingFormula: boolean;
  onSelectedCellChange: (...);
  onSelectedColumnChange: (...);
  onFormulaInputChange: (...);
  onFormulaModeChange: (...);
  onFormulaSubmit: () => void;
  onValidationError?: (...);
  onEditingStateChange: (editing: boolean) => void;
}
```

#### Edit Activation
- Input is `readOnly` unless there’s a column selected **and** `isEditingFormula` is true.
- Clicking the input while a column is selected but not editing toggles `onEditingStateChange(true)` and focuses the field.
- Placeholder text communicates the state (“Select a column…” vs sample formulas).

#### Autocomplete
- Suggestions only appear when `=` is typed **and** the bar is in edit mode.
- `selectAutoCompleteSuggestion` replaces the word under the cursor or inserts at the caret for bare `=`:
  ```tsx
  const insertText = suggestion.type === 'function'
    ? `${suggestion.insertText.toUpperCase()}()`
    : suggestion.insertText;
  ```
- Pressing Enter/apply resets edit mode (`onEditingStateChange(false)`).

#### Submit Flow
```tsx
const handleSubmit = () => {
  if (!selectedColumn) return onValidationError?.('Please select a target column first');
  if (!formulaInput.trim()) return onValidationError?.('Please enter a formula');
  if (!validationResult.isValid) return onValidationError?.(validationResult.error);

  onValidationError?.(null);
  onFormulaSubmit();
  onEditingStateChange(false);
};
```

---

## 3. Behaviour After Fixes

| Scenario | Formula Bar State | Notes |
| --- | --- | --- |
| No column selected | Read-only, prompt says “Select a column…” | Avoids backend errors. |
| Select new column (no formula yet) | Editable immediately, cursor text | Encourages quick data entry. |
| Select column with saved formula | Displays stored expression, read-only, cursor shows pointer | Users can inspect without editing. |
| Click bar while viewing | Switches to edit mode, caret appears inside formula | Intentional editing. |
| Start typing `=` | Suggestions appear; hitting Enter inserts function/column correctly | Works from bare `=` or partial tokens. |
| Apply formula | Bar returns to view mode, history logs operation | Users can move on without accidental edits. |

---

## 4. File Map & Responsibilities

| File | Purpose |
| --- | --- |
| `DataFrameOperationsCanvas.tsx` | Stores column formulas, manages selection state and edit mode toggle. |
| `CollapsibleFormulaBar.tsx` | Wrapper that passes state/control callbacks between canvas and `FormularBar`. |
| `FormularBar.tsx` | Renders UI, handles validation, autocomplete, view/edit transitions, and submit logic. |
| `app/features/dataframe_operations/app/formula_parser.py` | Backend parsing/evaluation (unchanged in this set, but stores formula logic). |

---

## 5. Remaining Notes / Future Ideas
- Could add a tiny “Edit” button beside the formula to make the affordance more explicit.
- Sectioned suggestions (Functions vs Columns) can be revisited once we solve the interaction conflicts.
- Consider persisting `isEditingFormula` per column if multi-user editing becomes a concern.

This completes the granular summary of the formula-engine and UI fixes. Feel free to reach out if we need to expand this into formal documentation or extend functionality further.

