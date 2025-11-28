# Polling Explanation: Why We Need It and How It Works

## What is Polling?

**Polling** is a technique where a client (frontend) repeatedly asks a server (backend) for updates at regular intervals, rather than waiting for the server to push updates.

### Analogy
Think of polling like checking your mailbox every few minutes to see if new mail arrived, instead of waiting for the mail carrier to ring your doorbell when mail arrives.

## Why Do We Need Polling in SavedDataFramesPanel?

The `SavedDataFramesPanel` component displays a list of saved data files (Arrow files) stored in MinIO. We need polling because:

### 1. **Files Can Change Without User Action**
- Other users might upload new files
- Background processes might create files
- Files might be deleted or renamed
- The user might upload files from another tab/window

### 2. **No Push Mechanism (Currently)**
- The system doesn't have WebSocket events for file changes yet
- Without polling, the file list would be stale and outdated
- Users wouldn't see new files until they manually refresh

### 3. **User Experience**
- Users expect to see new files appear automatically
- Manual refresh buttons are less user-friendly
- Real-time updates improve workflow efficiency

## How Polling Works in Our Implementation

### Before Optimization (Problem)
```typescript
// OLD: Polled every 200ms - 2 seconds
const delay = Math.min(2000, 200 + attempt * 200);
```
- **Too frequent**: Called API every 200ms initially
- **Server overload**: Hundreds of requests per minute
- **No caching**: Every call triggered state updates
- **No debouncing**: Rapid re-fetches on component re-mounts

### After Optimization (Solution)

#### 1. **Increased Polling Intervals**
```typescript
// NEW: Polls every 3-15 seconds
const baseDelay = 3000; // 3 seconds base
const maxDelay = 15000; // 15 seconds max
```
- **10x reduction** in API calls
- Still responsive enough for users
- Reduces server load significantly

#### 2. **Debouncing**
```typescript
const POLL_DEBOUNCE_MS = 3000; // Minimum 3 seconds between polls
```
- Prevents rapid successive calls
- Ensures minimum time between polls
- Stops unnecessary requests

#### 3. **Caching**
```typescript
const CACHE_DURATION = 5000; // Cache for 5 seconds
```
- Stores results in memory
- Only updates state if data actually changed
- Prevents unnecessary re-renders
- Reduces API calls when data hasn't changed

#### 4. **Visibility Check**
```typescript
if (!isOpen) {
  filesCacheRef.current = null;
  return; // Don't poll when panel is closed
}
```
- Only polls when panel is visible
- Stops polling when panel closes
- Saves resources when not needed

#### 5. **Data Change Detection**
```typescript
const dataChanged = !lastSuccessfulData || 
  lastSuccessfulData.prefix !== effectivePrefix ||
  JSON.stringify(lastSuccessfulData.files.map(f => f.object_name)) !== 
  JSON.stringify(filtered.map(f => f.object_name));
```
- Compares new data with previous data
- Only updates UI if files actually changed
- Prevents unnecessary re-renders

## Performance Impact

### Before
- **API Calls**: ~30-300 per minute (depending on failures)
- **State Updates**: Every call, even if data unchanged
- **Server Load**: High, especially with multiple users

### After
- **API Calls**: ~4-20 per minute (10x reduction)
- **State Updates**: Only when data actually changes
- **Server Load**: Significantly reduced

## Future Improvements

### 1. **WebSocket Push Updates** (Best Solution)
Instead of polling, the server could push updates when files change:
```typescript
// Server sends event when file is created/deleted
websocket.on('file_changed', (data) => {
  // Update file list immediately
  setFiles(data.files);
});
```
- **Real-time**: Updates instantly when files change
- **Efficient**: No polling needed
- **Scalable**: Works well with many users

### 2. **Shared Polling Service**
Instead of each component polling independently:
```typescript
// Single service polls once, all components subscribe
const fileListService = new FileListPollingService();
fileListService.subscribe((files) => {
  setFiles(files);
});
```
- **Single source**: One polling loop for all components
- **Consistent**: All components see same data
- **Efficient**: No duplicate API calls

### 3. **Smart Polling**
Adjust polling frequency based on activity:
```typescript
// Poll frequently when user is active
if (userActive) {
  pollInterval = 2000; // 2 seconds
} else {
  pollInterval = 30000; // 30 seconds when idle
}
```
- **Adaptive**: Faster when needed, slower when idle
- **Battery-friendly**: Reduces polling on mobile devices
- **User-aware**: Responds to user activity

## Summary

**Polling is necessary** because:
1. Files can change without user action
2. We need to show up-to-date file lists
3. No push mechanism exists yet

**Optimizations applied**:
1. ✅ Increased polling intervals (3-15s instead of 200ms-2s)
2. ✅ Added debouncing (minimum 3s between polls)
3. ✅ Added caching (5s cache, only update if changed)
4. ✅ Visibility check (only poll when panel open)
5. ✅ Data change detection (only update if files changed)

**Result**: 10x reduction in API calls while maintaining good user experience.

