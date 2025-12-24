# Future Feature Additions

This document tracks potential features and improvements for future implementation.

## Study Session Enhancements

### Progress Tracking
**Priority:** Medium
**Description:** Display progress during study sessions to help users understand how many cards remain.

**Implementation Details:**
- Add a progress indicator showing "X cards remaining" or "5/20 cards completed"
- Backend changes needed:
  - Modify `StudyService.getNextVocabItem()` to return total remaining cards count
  - Add endpoint to get session statistics
  - Consider caching session state for performance
- UI changes:
  - Add progress bar or counter at top of study page
  - Show percentage complete
  - Optionally show time estimate based on average card completion time

**Related Files:**
- `src/server/services/StudyService.ts` - Add method to count remaining cards
- `src/app/study/[deckId]/page.tsx` - Display progress UI
- `src/server/endpoints/studyRouter.ts` - Add progress endpoint if needed

**Notes:**
- Consider whether progress should include only due cards or all cards in deck
- Decide if constituents should be counted separately when `includeConstituents` is enabled
- May want to cache this count to avoid expensive queries on each card

---

## Memory Aids Integration

### Display Memory Aids in Study Session
**Priority:** High
**Description:** Show memory aids during vocabulary overview (new cards and post-answer review)

**Implementation Details:**
- Fetch memory aids for vocab items during study
- Display in VocabOverview component similar to dictionary page
- Allow users to save/favorite memory aids during study
- Consider showing memory aid after incorrect answers to aid learning

---

## Stroke Order Animation

### SVG Stroke Animation
**Priority:** Medium
**Description:** Replace placeholder stroke order animation with actual SVG rendering

**Implementation Details:**
- Reuse stroke animation logic from dictionary page
- Only show for character type vocab items
- Add option to replay animation
- Consider showing during review after incorrect answers

---

## Additional Features

### Audio Management
- **Preload next audio file** for smoother transitions
- **Audio playback controls** (speed adjustment, replay)
- **Audio caching** to reduce bandwidth

### Session Customization
- **Study session timer** to track time spent
- **Daily goals** and streak tracking
- **Review mode** vs **learning mode** toggle
- **Custom session size** (study X cards per session)

### Answer Input Improvements
- **Voice input** for speaking practice
- **Handwriting recognition** for writing practice
- **Partial credit** for close answers
- **Answer history** to review mistakes

### Statistics & Analytics
- **Session summary** showing accuracy and time
- **Learning curve visualization**
- **Weak areas identification**
- **Review forecast** (cards due today, tomorrow, etc.)
