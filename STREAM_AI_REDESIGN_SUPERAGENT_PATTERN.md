# Stream AI - Redesign with SuperAgent Pattern

## Current Problem

Stream AI creates cards but they don't appear in Laboratory Mode because we're not following the **exact SuperAgent pattern**.

## SuperAgent Pattern (What Works)

### Flow:
```
1. CARD_CREATED event (WebSocket)
   ├─ Create empty card via FastAPI
   ├─ Add card to Laboratory store
   └─ Card appears on UI

2. ATOM_FETCHED event (WebSocket)
   ├─ Fetch atom via AI
   ├─ Add atom to card
   └─ Atom appears in card

3. AGENT_EXECUTION event (WebSocket)
   ├─ Execute agent → get results
   ├─ Call atom handler.handleSuccess(result)
   ├─ Handler updates atom settings
   └─ Results display on card!
```

### Key Components:

**1. WebSocket Communication**
- Real-time updates to frontend
- Events: `step_started`, `step_completed`, `card_created`, `atom_fetched`

**2. Atom Handlers**
- Each atom has a handler (`getAtomHandler(atomType)`)
- Handler has `handleSuccess(result, context)` method
- Handler processes results and updates atom settings
- **This is what makes results appear on UI!**

**3. Laboratory Store Integration**
- Cards added via `setCards([...cards, newCard])`
- Atoms added via `updateCard(cardId, {atoms: [...]})` 
- Settings updated via `updateAtomSettings(atomId, settings)`
- localStorage persistence
- Force refresh

## What Stream AI Needs

### Option 1: WebSocket Pattern (Recommended)

Copy SuperAgent's websocket orchestration:

```typescript
// Stream AI sends message
ws.send({
  message: userPrompt,
  sequence_id: sequence_id,
  available_files: files
});

// Backend sends events
ws.onmessage = (event) => {
  switch (data.type) {
    case 'plan_generated':
      // Show WorkflowPreview
      break;
      
    case 'step_started':
      // Show step executing
      break;
      
    case 'card_created':
      // Add empty card to Laboratory
      addCardToLaboratory(data.card_id);
      break;
      
    case 'atom_added':
      // Add atom to card
      addAtomToCard(data.card_id, data.atom_id);
      break;
      
    case 'agent_executed':
      // Call atom handler with results
      const handler = getAtomHandler(data.atom_id);
      handler.handleSuccess(data.result, context);
      // Results appear on UI!
      break;
      
    case 'step_completed':
      // Show approval button
      break;
  }
};
```

### Option 2: REST with Atom Handlers (Simpler)

Keep REST API but add atom handlers:

```typescript
// After step execution
const stepResult = await executeStep();

// Add card to Laboratory
const cardId = await createCard();
addCardToLaboratory(cardId);

// Add atom to card  
addAtomToCard(cardId, atomId);

// Call atom handler to process results
const handler = getAtomHandler(atomId);
await handler.handleSuccess(stepResult.execution_result, {
  atomId: atomInstanceId,
  atomType: atomId,
  updateAtomSettings: (id, settings) => {
    useLaboratoryStore.getState().updateAtomSettings(id, settings);
  }
});

// Results now appear on card!
```

## Files That Need Complete Rewrite

### Backend:
1. `stream_api.py` - Add WebSocket support OR keep REST but ensure proper event structure
2. `step_executor.py` - Follow SuperAgent orchestration pattern

### Frontend:
3. `StreamAIPanel.tsx` - Copy SuperAgent's WebSocket handling and atom handler calling

## The Critical Missing Piece

**Atom Handlers!**

SuperAgent calls atom handlers to process results:
```typescript
const handler = getAtomHandler('merge');  // Get merge handler
handler.handleSuccess(mergeResult, context);  // Process merge_json
// Handler updates atom settings → Results appear!
```

Stream AI is NOT calling handlers, so results never appear!

## Recommendation

**Copy SuperAgent's exact implementation**:

1. Copy WebSocket connection logic
2. Copy event handling (step_started, step_completed, card_created)
3. Copy atom handler calling pattern
4. Copy Laboratory store integration

This way we get:
- ✅ Real-time UI updates
- ✅ Proper card creation
- ✅ Atom handlers process results
- ✅ Results display on UI
- ✅ Proven, tested code

## Next Steps

Should I:
1. **Redesign Stream AI to use WebSocket** (like SuperAgent) - More work but real-time
2. **Keep REST but add atom handler calling** - Less work, should work
3. **Show me SuperAgent's exact implementation** to copy

Which approach do you prefer?

