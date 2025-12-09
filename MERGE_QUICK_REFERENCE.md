# QUICK MERGE REFERENCE - metricOperations

⚡ **Quick lookup guide for resolving merge conflicts** ⚡

---

## 🎯 TOP PRIORITY FILES (Resolve These First)

| File | Lines | Why Critical | Resolution Strategy |
|------|-------|--------------|---------------------|
| `exhibition_configurations.json` | +37,486 | Huge data file | Accept YOUR version (has all data) |
| `useCollaborativeSync.ts` | ~913 | Real-time collab | KEEP YOUR CHANGES (core feature) |
| `RechartsChartRenderer.tsx` | ~822 | Chart rendering | KEEP YOUR CHANGES (notes feature) |
| `CanvasArea/index.tsx` | ~463 | Lab canvas core | KEEP YOUR CHANGES (dashboard mode) |
| `SharedExhibition.tsx` | ~358 | Exhibition page | KEEP YOUR CHANGES (sharing enhanced) |
| `laboratory/websocket.py` | ~241 | WebSocket backend | KEEP YOUR CHANGES (dashboard mode) |

---

## 🔥 EMERGENCY COMMANDS

```bash
# Abort merge (safe - nothing lost)
git merge --abort

# Check conflict status
git status

# View YOUR changes for a file
git diff HEAD -- path/to/file

# View full diff of all your changes
cat MERGE_GUIDE_DIFF.txt

# Create emergency backup NOW
git branch emergency-backup-$(date +%Y%m%d-%H%M%S)
```

---

## 📊 CHANGE SUMMARY

- **Total Files**: 35 modified
- **Insertions**: +41,396 lines
- **Deletions**: -1,004 lines
- **Commits**: 17 ahead of origin

---

## 🎨 WHAT YOU BUILT

1. ✨ **Dashboard Mode** - New collaboration mode
2. 📝 **Chart Notes** - Persistent chart annotations
3. 🔗 **Dashboard Sharing** - Share entire dashboards
4. 📊 **Correlation Enhancements** - Better matrix UI
5. 🎯 **Chart Maker Improvements** - Enhanced rendering
6. 🔄 **WebSocket Upgrades** - Better real-time sync
7. 🗂️ **Exhibition Configs** - Large data additions

---

## ⚡ CONFLICT RESOLUTION CHEAT SHEET

### If conflict in `.tsx` file:
```
1. Open in VS Code
2. Look for <<<<<<< HEAD markers
3. Check MERGE_GUIDE_DIFF.txt for YOUR changes
4. Usually KEEP YOUR CHANGES (you built new features)
5. Test immediately after resolving
```

### If conflict in `.py` file:
```
1. Backend changes are for share_links & websocket
2. KEEP YOUR MODEL CHANGES (new fields needed)
3. KEEP YOUR WEBSOCKET CHANGES (dashboard mode)
4. Check API routes don't duplicate
```

### If conflict in `.json` file:
```
1. exhibition_configurations.json - TAKE YOURS
2. package.json - MERGE both dependencies
3. Other configs - check carefully
```

---

## 🛠️ MERGE PROCESS

```bash
# 1. Ensure you're on your branch
git checkout metricOperations

# 2. Fetch latest from remote
git fetch origin

# 3. Start merge (example with dev)
git merge origin/dev

# 4. If conflicts:
#    - VS Code will highlight them
#    - Resolve using this guide
#    - Stage resolved files: git add <file>

# 5. Continue merge
git merge --continue

# 6. Test thoroughly
npm run build  # Frontend
# Test backend services
```

---

## 📁 FILES BY IMPACT LEVEL

### 🔴 VERY HIGH (Check First)
- `exhibition_configurations.json`
- `useCollaborativeSync.ts`
- `RechartsChartRenderer.tsx`
- `CanvasArea/index.tsx`
- `SharedExhibition.tsx`
- `laboratory/websocket.py`
- `ChartMakerChart.tsx`
- `LaboratoryMode.tsx`

### 🟠 HIGH (Important)
- `MatrixSettingsTray.tsx`
- `share_links/views.py`
- `ChartMakerCanvas.tsx`
- `laboratoryStore.ts`
- `ChartMaker/shared.tsx`
- `ShareDialog.tsx`

### 🟡 MEDIUM (Review)
- All other files in the list

### 🟢 LOW (Quick resolve)
- Files with <10 line changes

---

## 💾 BACKUP STATUS

✅ All changes committed (17 commits)  
✅ Full diff saved: `MERGE_GUIDE_DIFF.txt`  
✅ Detailed guide: `MERGE_GUIDE_metricOperations.md`  
✅ Can create branch backups anytime  

**YOUR CODE IS SAFE** - Don't worry!

---

## 🆘 IF STUCK

1. **Don't panic** - Your code is committed
2. **Abort merge**: `git merge --abort`
3. **Read detailed guide**: `MERGE_GUIDE_metricOperations.md`
4. **Check full diff**: `MERGE_GUIDE_DIFF.txt`
5. **Ask team** - Share this guide with them

---

## ✅ POST-MERGE CHECKLIST

```bash
# Build & test
cd TrinityFrontend
npm run build

# Check no errors
npm run lint

# Start services
# - Backend Django
# - Backend FastAPI  
# - Frontend dev server

# Test features:
# ✓ Dashboard mode works
# ✓ Chart notes save/load
# ✓ Share links work
# ✓ WebSocket connects
# ✓ Correlation matrix displays
```

---

## 📞 KEY LOCATIONS

- **Full Diff**: `MERGE_GUIDE_DIFF.txt` (44,613 lines)
- **Detailed Guide**: `MERGE_GUIDE_metricOperations.md`
- **This Quick Ref**: `MERGE_QUICK_REFERENCE.md`

---

**Created**: December 4, 2025  
**Branch**: metricOperations  
**Status**: Ready for merge

🚀 **You've got this!** Your work is documented and safe.

