# Phase 3: Profile System

By the end of this phase, you'll have a real working Dashboard with profile editing, photo management, and settings — all backed by Supabase.

## Files in this phase

### Drop in (replace existing or create new)

| File | Where it goes | Notes |
|---|---|---|
| `lib/profileService.ts` | New | Wrapper for Supabase profile reads/writes |
| `lib/photoService.ts` | New | Wrapper for Supabase Storage photo ops |
| `lib/useToast.tsx` | New | Toast notifications |
| `lib/AuthContext.tsx` | **Replaces existing** | Cleaned up — no more debug logs |
| `components/PlaceholderTab.tsx` | New | Generic "coming soon" screen |
| `components/Dashboard.tsx` | **Replaces existing** | Slimmed down ~70%, no prop drilling |
| `components/ProfileView.tsx` | **Replaces existing** | Every edit hits Supabase |
| `components/SettingsView.tsx` | **Replaces existing** | Settings persist to Supabase |
| `components/Sidebar.tsx` | **Replaces existing** | Boost tab removed, no isGuest |
| `types.ts` | **Replaces existing** | Dead fields removed |
| `constants.tsx` | **Replaces existing** | Mock data removed |
| `App.tsx` | **Replaces existing** | Wraps with ToastProvider, dark-mode lifted up |

### Files to DELETE

```
components/DashboardStub.tsx       ← no longer needed
```

That's it for deletes. Other unused files (AdminDashboard, BoostPanel, etc.) can stay for now — they're not imported, so they don't affect the build. We'll clean them up in Phase 6.

## Setup steps

### 1. Drop in new files, replace existing ones

Copy each file above to the matching path in your project.

### 2. Delete `DashboardStub.tsx`

```bash
rm components/DashboardStub.tsx
```

### 3. Run

```bash
npm run dev
```

If Vite throws errors, restart it (Ctrl+C → `npm run dev` again).

## What you should test

1. **Sign in**, you should land on the Dashboard. Sidebar shows: Find Match / Chat History / Likes You / Matches / Standouts / My Profile / Settings. (No more Boost.)

2. **Click "My Profile"**. You should see your full profile, completion bar, photos. The completion percentage will be lowish since you skipped a lot in onboarding.

3. **Click any field** (e.g. "Hometown"). Click the pencil icon that appears on hover. Type a new value. Click the green checkmark.
   - Toast pops up: "Saved"
   - Field updates in place
   - **Refresh the page** → value persists. ✓

4. **Toggle field visibility**: hover any field, click the eye icon. Toast: "Hidden" / "Now visible". The field shows a "Hidden" badge. Refresh → persists. ✓

5. **Edit "About Me"**: click the description card, edit, hit Save. Toast: "About Me updated". Refresh → persists. ✓

6. **Add a photo**: click "Add Photo" tile in the right column. Pick a file. Spinner shows "Uploading…". Toast: "Photo added". The new photo appears at the end of the grid. Refresh → persists. ✓

7. **Replace a photo**: hover any photo, click "Replace". Pick a new file. Toast: "Photo replaced". The new one shows in the same slot. The old one gets deleted from Storage automatically.

8. **Remove a photo**: hover, click "Remove". Confirm. Toast: "Photo removed". Refresh → gone.

9. **Settings tab**: toggle any switch (e.g. Incognito Mode). The toggle moves immediately. Refresh → still on. ✓

10. **Dark mode toggle** in Settings → Appearance → click the toggle. Whole app flips. Refresh → ... it'll reset to your OS preference, since we're not persisting it yet (that's a Phase 6 polish item).

11. **Sign out** from sidebar (the icon at the bottom-right of the user card). Lands back on auth screen.

12. **Help Center** tab → static content, untouched.

13. **Search / Likes / Matches / Standouts** tabs → all show clean "Coming in Phase X" placeholders.

## Common issues

**"Cannot find module './NotionUI'"** when ProfileView builds → make sure your existing `components/NotionUI.tsx` is still there. We didn't touch it. The `PropertyRow`, `Button`, etc. all come from there.

**Photos appear to upload but don't show after refresh** → check Supabase Storage → photos bucket. If they're there but the profile's `photo_urls` column is empty, the row update hit an RLS error. Check browser console for the exact message.

**"Permission denied" toast on any save** → either you're not signed in, or RLS isn't picking up your auth. Sign out and back in.

**Toast notifications don't appear** → make sure `App.tsx` wraps everything in `<ToastProvider>` (the new App.tsx does this). If you replaced AuthContext but kept old App.tsx, the provider is missing.

## What's NOT in this phase

These tabs all show placeholder screens:
- Search (Phase 4 — the matching algorithm)
- Chat History (Phase 4)
- Likes You (Phase 5)
- Matches & Chat (Phase 5)
- Standouts (Phase 5)

The verification lockout system is also pushed to early Phase 4, where it makes sense alongside social verification.

## When you're done

You should be able to:
- ✅ Sign in and see your real profile
- ✅ Edit any field and have it persist after refresh
- ✅ Add, replace, and remove photos
- ✅ Toggle settings and have them persist
- ✅ Sign out / sign back in
- ✅ See clean placeholders for the unimplemented tabs

Tell me when it's working (or if anything errors) and we'll move to **Phase 4: Search + Matching Algorithm** — the actual brain of Shaadi24, where natural-language search hits 70+ profile attributes and ranks candidates with detailed compatibility reports.
