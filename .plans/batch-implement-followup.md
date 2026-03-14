# Batch Implementation Follow-Up — Stunning Dashboard (Plans 01–08)

## Controversial Decisions

- **Plan 03**: Used `position: fixed` for TopBar instead of `sticky` (per code review). This means TopBar overlaps content when visible — acceptable since it only appears after scrolling past the hero map.
- **Plan 04**: Used Tailwind arbitrary value syntax `bg-[var(--surface-1)]` for CSS variable integration. This works in Tailwind v4 but generates longer class names. Alternative was defining custom theme colors in Tailwind config.

## Skipped Items

- **Plan 04**: Content pages (ImprintPage, PrivacyPage, SourcesPage, NoTrackingPage) still use `dark:bg-gray-900` / `dark:bg-gray-950`. These are secondary pages; migrating them is straightforward but deferred to avoid scope creep. The CSS variables still work (just not used in those files yet).
- **Plan 04**: CouncilMeetingsStrip has `dark:bg-gray-900/95` for a sticky header — not migrated since it's a data strip with specific opacity needs.

## User Input Needed
_Questions that blocked progress on specific items._

## DB Migrations
_Schema changes that need to be applied._

## Files to Delete
_Files that should be removed._

## Implementation Issues
_Problems encountered during execution._

## Borderline Insights
_Findings that might warrant persisting to the project's knowledge system._

## Suggested Follow-Up Work
_Potential new work items that emerged during execution._
