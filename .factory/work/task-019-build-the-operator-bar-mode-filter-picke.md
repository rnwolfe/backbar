---
id: task-019
title: Build the operator bar-mode filter picker and sweep screen
status: ready
priority: med
estimate: large
created: 2026-06-30T02:18:02.370Z
updated: 2026-06-30T02:18:02.370Z
labels:
  - feature-plan-task
sourcePlanId: si2b4s6gktmw3lko08yaaje9
---

## Acceptance

- [ ] A route or command-palette entry opens a bar-mode flow where the operator selects or confirms the bottle filter before the first bottle is shown.
- [ ] After filter selection, the screen shows one bottle at a time with large tap targets for empty/gone, 25%, 50%, 75%, and 100%.
- [ ] After a successful save, the UI immediately advances to the next bottle and shows a completion state when no bottles remain in the filtered sweep.
- [ ] The screen works at 375px width without horizontal overflow and remains usable on tablet-sized operator-console layouts.

## Notes

Emitted by feature plan si2b4s6g: "A rapid inventory update flow. The user rapidly goes through their bottles and selects fill level. Large buttons for quick tap. Immediately save and proceed to next bottle. On top of fractional fill levels, have a large button for empty/gone and continue."

