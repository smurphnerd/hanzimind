# Study Flow Documentation

This document describes the intended flow for the study session page (`/app/study/[deckId]/page.tsx`).

## Overview

The study session is a spaced repetition learning system that presents vocabulary items to users based on their progress. Users are tested on different aspects of each word (reading, listening, understanding, writing) and the system tracks their level for each skill separately.

## High-Level Flow

```
1. Fetch initial vocab item → getNextVocabItem()
2. Display study card based on studyType
3. User submits answer
4. Submit answer → submitAnswer()
5. Show result card (correct/incorrect + level change)
6. Fetch next vocab item (or show completion)
7. Loop back to step 2
```

## Detailed Step-by-Step Flow

### Step 1: Get Next Vocab Item

**Endpoint:** `orpc.study.nextVocabItem`
- **Input:** `{ deckId: string }`
- **Output:** `VocabItemStudyDto`

The backend (`StudyService.getNextVocabItem`) determines which item to show based on:
- **Unseen items** (never studied before) get highest priority → returns `studyType: "new"`
- **Seen items** are prioritized by:
  1. Lowest level across enabled study types
  2. Items that are "due" (nextAt time has passed)
  3. Vocab type (characters before compounds before sentences)
  4. Decomposition length (shorter characters first)
  5. Random tiebreaker

The returned `VocabItemStudyDto` contains only the fields needed for the selected study type.

### Step 2: Display Study Card

The UI displays different content based on `studyType`:

#### a. `studyType: "new"` (First-time Introduction)

**Purpose:** Introduce the user to a new vocabulary item

**Display:**
- Full vocabulary overview with all information:
  - Large Chinese character/word
  - Pinyin pronunciation
  - Audio playback button
  - English definition
  - Character decomposition (if applicable)
  - Stroke order animation (if applicable)
  - Memory aids section

**User Action:**
- Click "Continue" button to proceed
- This marks the item as "seen"

**Fields returned:**
```typescript
{
  id: string
  vocabItem: string          // Chinese character/word
  translation: string | null
  pinyin: string
  vocabType: VocabType
  audioUrl: string
  decomposition: string | null
  etymologyHint: string | null
  etymologyType: string | null
  radical: string | null
  strokes: string[] | null
  strokeMedians: [number, number][][] | null
  strokeMatches: (number[] | null)[] | null
  createdAt: Date
  updatedAt: Date
  studyType: "new"
}
```

#### b. `studyType: "reading"` (Character → Pinyin)

**Purpose:** Test ability to read Chinese characters and produce correct pronunciation

**Display:**
- Large Chinese character/word (e.g., "你")

**User Input:**
- Text field for pinyin (e.g., "ni3hao3")
- Input is auto-converted to tone marks using `pinyin-tone` library (ni3 → nǐ)

**Correct Answer:**
- Exact match with stored pinyin

**Fields returned:**
```typescript
{
  id: string
  vocabItem: string  // e.g., "你"
  studyType: "reading"
}
```

#### c. `studyType: "listening"` (Audio → Pinyin/Character)

**Purpose:** Test listening comprehension and ability to identify sounds

**Display:**
- Large speaker button (auto-plays once on mount)
- Button to replay audio

**User Input:**
- Text field for pinyin OR Chinese character
- Pinyin input is auto-converted to tone marks

**Correct Answer:**
- Either exact pinyin match OR exact character match

**Fields returned:**
```typescript
{
  id: string
  audioUrl: string
  studyType: "listening"
}
```

#### d. `studyType: "understanding"` (Character + Audio → Translation)

**Purpose:** Test semantic comprehension of the word's meaning

**Display:**
- Chinese character/word (e.g., "你")
- Audio playback button

**User Input:**
- Text field for English translation (e.g., "you")

**Correct Answer:**
- Semantic similarity check using `TranslationChecker`
- Uses Jaccard similarity (not exact match required)

**Fields returned:**
```typescript
{
  id: string
  vocabItem: string
  audioUrl: string
  studyType: "understanding"
}
```

#### e. `studyType: "writing"` (Translation → Character)

**Purpose:** Test ability to produce Chinese characters from English meaning

**Display:**
- English translation (e.g., "you, second person pronoun")

**User Input:**
- Text field for Chinese character/word

**Correct Answer:**
- Exact character match

**Fields returned:**
```typescript
{
  id: string
  translation: string | null
  studyType: "writing"
}
```

### Step 3: User Submits Answer

**Actions:**
- User enters answer in text field
- Clicks "Submit" button OR presses Enter key
- OR clicks "Give Up" button (submits empty string)

**For `studyType: "new"`:**
- Clicking "Continue" submits empty string
- No grading, just marks item as seen

### Step 4: Submit Answer to Backend

**Endpoint:** `orpc.study.submitAnswer`
- **Input:**
  ```typescript
  {
    deckId: string
    answer: {
      vocabItemId: string
      userId: string  // filled by backend
      deckId: string
      studyType: StudyType | "new"
      answer: string
    }
  }
  ```
- **Output:**
  ```typescript
  {
    correct: boolean
    userVocabItem: UserVocabItemDto  // Full vocab item with user progress
    nextVocabItem: VocabItemStudyDto  // Next item to study (or null if done)
  }
  ```

**Backend Processing (`StudyService.processAnswer`):**
1. Fetch vocab item and user progress from database
2. For `studyType: "new"`: Mark item as `seen: true` and return
3. For other types:
   - Check if answer is correct based on study type rules
   - Get current level for this study type
   - Calculate next level and next review time using spaced repetition:
     - **Correct answer:** Advance to next level
     - **Incorrect answer:** Reset to level 0, review in 1 minute
   - Update database with new level and nextAt time
4. Return correctness boolean

**Spaced Repetition Intervals:**
- Level 0 → Level 1: 10 minutes
- Level 1 → Level 2: 1 hour
- Level 2 → Level 3: 1 day
- Level 3 → Level 4: 3 days
- Level 4 → Level 5: 1 week
- Level 5: 2 weeks (stays at level 5)
- Incorrect: Reset to Level 0, review in 1 minute

### Step 5: Show Result Card

**Display:**
- "Correct!" (green) or "Incorrect" (red) header
- Level progression display:
  - Previous level (star rating)
  - Arrow (→)
  - New level (star rating)
- Full vocabulary overview:
  - Chinese character/word
  - Pinyin
  - Audio button
  - English definition
  - Decomposition (for characters)

**User Action:**
- Click "Next" button OR press Enter to continue

### Step 6: Fetch Next Vocab Item

**Two Scenarios:**

#### a. More items available
- Backend returns `nextVocabItem` in the response from Step 4
- Frontend transitions back to Step 2 with new vocab item

#### b. Session complete
- Backend returns `null` for `nextVocabItem` (all items studied for now)
- Frontend shows completion screen:
  - "You're Done!" message
  - "Return to Study" button → navigates to `/study`

### Step 7: Loop

The flow loops back to Step 2 with the next vocab item until the session is complete.

## State Management

The frontend (`StudyPageContent` component) manages the following state:

```typescript
const [currentVocabItem, setCurrentVocabItem] = useState<VocabItemStudyDto | null>()
const [showingResult, setShowingResult] = useState(false)
const [isCorrect, setIsCorrect] = useState(false)
const [previousLevel, setPreviousLevel] = useState(0)
const [newLevel, setNewLevel] = useState(0)
const [userVocabItem, setUserVocabItem] = useState<UserVocabItemDto | null>(null)
const [isCompleted, setIsCompleted] = useState(false)
```

**State Transitions:**
1. `StudyCard` (showing study item)
   ↓ User submits answer
2. API call to `submitAnswer`
   ↓ Response received
3. `setShowingResult(true)` + store result data
4. `ResultCard` (showing result + next vocab item ready)
   ↓ User clicks Next
5. `setShowingResult(false)`
6. Back to `StudyCard` with new `currentVocabItem`

## Current Implementation Issues

Based on the code review, here are potential issues to address:

### Issue 1: Level Display Bug
**Location:** `src/app/study/[deckId]/page.tsx:515-516`

**Current Code:**
```typescript
setPreviousLevel(data.userVocabItem[levelKey]);
setNewLevel(data.userVocabItem[levelKey]);
```

**Problem:** Both previous and new level are set to the SAME value (the new level after update). The result card shows no level change.

**Fix:** Track previous level BEFORE submitting answer, or have backend return both old and new levels.

**Suggested Solution:**
```typescript
// Before submitting, if we had the user's progress:
const getPreviousLevel = () => {
  const studyType = currentVocabItem?.studyType as StudyType;
  const levelKey = `${studyType}Level` as "readingLevel" | "listeningLevel" | "understandingLevel" | "writingLevel";
  // Would need to fetch or cache user progress before submission
  return previousUserProgress[levelKey];
};
```

**OR** Backend should return:
```typescript
{
  correct: boolean
  previousLevel: number
  newLevel: number
  userVocabItem: UserVocabItemDto
  nextVocabItem: VocabItemStudyDto
}
```

### Issue 2: Missing Null Check
**Location:** `src/server/endpoints/studyRouter.ts:105-108`

**Current Code:**
```typescript
const nextVocabItem = await context.cradle.studyService.getNextVocabItem(
  userId,
  deckId,
);

return { correct, userVocabItem, nextVocabItem };
```

**Problem:** If no more items are due for study, `getNextVocabItem` throws an error instead of returning null.

**Current Behavior:** Throws `"No vocab items are due for study"`

**Expected Behavior:** Should return `null` to indicate session completion

**Fix:** Either:
1. Make `getNextVocabItem` return `null` instead of throwing
2. Catch the error and return `null` for `nextVocabItem`
3. Update output schema to allow `nextVocabItem: VocabItemStudyDto.nullable()`

### Issue 3: Missing Auto-Focus
The input field should auto-focus when a new study card is shown for better UX. This is currently implemented correctly with `inputRef.current?.focus()`.

### Issue 4: Memory Aids Section
**Location:** `src/app/study/[deckId]/page.tsx:113-124`

**Current Code:** Shows "Memory aids feature coming soon"

**Fix:** Integrate with the memory aids system similar to dictionary page:
- Fetch user's selected memory aid for this vocab item
- Display it during "new" item introduction
- Display it in result card for review

## Key Algorithms

### Study Type Selection Algorithm

From `StudyService.getNextVocabItem`:

```typescript
// For unseen items
if (!item.seen) {
  return { studyType: "new", ...fullVocabItem };
}

// For seen items, find study type with:
// - Is enabled for this deck
// - Next review time is due (null or <= now)
// - Has lowest level among eligible study types

for (const studyType of enabledStudyTypes) {
  const level = item[`${studyType}Level`];
  const nextAt = item[`${studyType}NextAt`];
  const isDue = nextAt === null || nextAt <= now;

  if (isDue && level < minLevel) {
    minLevel = level;
    selectedStudyType = studyType;
  }
}
```

### Answer Checking Algorithm

From `StudyService.processAnswer`:

```typescript
// Reading: Exact pinyin match
if (studyType === "reading") {
  correct = answer === vocabItem.pinyin;
}

// Listening: Pinyin OR character match
else if (studyType === "listening") {
  correct = answer === vocabItem.pinyin || answer === vocabItem.vocabItem;
}

// Understanding: Semantic similarity check
else if (studyType === "understanding") {
  correct = translationChecker.checkSimilarity(answer, vocabItem.translation);
}

// Writing: Exact character match
else if (studyType === "writing") {
  correct = answer === vocabItem.vocabItem;
}
```

## User Experience Notes

1. **Enter Key:** Always submits the current action (answer or continue)
2. **Audio Auto-play:** Only for `listening` type, plays once on mount
3. **Give Up Button:** Submits empty string, counts as incorrect
4. **Pinyin Input:** Automatically converts numbered tones (ni3 → nǐ)
5. **Focus Management:** Input fields auto-focus for seamless keyboard interaction
6. **Loading States:** Uses `StudyLoading` component during initial fetch
7. **Error Handling:** Uses `ErrorBoundary` to catch and display errors

## Database Schema Implications

### User Progress Tracking

Each user-vocab relationship (`userVocabItems` table) tracks:
- `seen`: boolean - Whether user has encountered this item
- `readingLevel`: 0-5
- `listeningLevel`: 0-5
- `understandingLevel`: 0-5
- `writingLevel`: 0-5
- `readingNextAt`: timestamp | null
- `listeningNextAt`: timestamp | null
- `understandingNextAt`: timestamp | null
- `writingNextAt`: timestamp | null
- `memoryAidId`: reference to user's chosen memory aid

### Deck Settings

Each user-deck relationship (`userDecks` table) controls:
- `includeConstituents`: boolean - Include component characters
- `readingEnabled`: boolean
- `listeningEnabled`: boolean
- `understandingEnabled`: boolean
- `writingEnabled`: boolean

These settings determine which study types are available for the session.
