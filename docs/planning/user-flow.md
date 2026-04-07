# RecoDate Final User Flow

Source:

- `데이트_코스_맞춤_추천_앱_Recodate_기획서_수정.pdf`
- final flowchart confirmed on `2026-04-07`

## Flow Summary

RecoDate now follows a 4-phase structure:

1. `Initial Input`
2. `Selection Hub`
3. `Customizing`
4. `Execution`

This flow separates fast recommendation from detailed editing more clearly than the previous draft.

## Phase 1. Initial Input

The user enters from the main dashboard.

- tap the `Rec❤️Date` or course creation entry button
- move to the initial input screen
- set the minimum required information:
  - transport method
  - region
  - time

Below the base input area, two actions exist:

- `Quick Start`
- `세부 카테고리 설정`

### Quick Start

Quick Start is the fast path.

- use the minimum inputs only
- start recommendation immediately

### Deep Dive

Deep Dive is optional and supports users who want finer customization.

Additional settings include:

- place characteristic
  - directly selected
  - random
  - food type
- budget cap
- movement range
- number of courses
- date genre or category

## Phase 2. Selection Hub

The recommendation engine builds and returns the result list.

- show `3 to 5` full-course cards
- let the user compare and choose a course

If the user is not satisfied, there are two different retry paths:

### 1. Simple Refresh

- pull to refresh
- or use the refresh button
- rerun search with the same Phase 1 input

### 2. Re-search After Condition Change

- return to detailed condition editing
- modify Deep Dive conditions
- run search again with updated filters

If the user likes one of the results:

- open the selected course detail page

## Phase 3. Customizing

Inside the selected course detail page, the user can either confirm the course or edit it directly.

Editing mode includes:

- unlimited place swap based on the whole database
- reorder course items
- modify course elements

The meaning of direct editing here is:

- the user replaces parts they do not like from the recommended course
- after edits are submitted, the system should review the modified course and reorganize it into a cleaner final result

This phase is the strongest differentiation point of the product.

## Phase 4. Execution

After the user finalizes the course:

- save or favorite the course
- share it through SNS
- start real-time route guidance

If a real-world interruption happens during the date:

- generate a real-time revised course based on the current location

If not:

- complete the date flow

## Product Interpretation

The final structure is now stable enough to modularize:

- `Phase 1` is a dual-entry input module with fast and detailed paths
- `Phase 2` is a result hub, not just a simple list page
- `Phase 3` is a dedicated editing module for user-driven course repair
- `Phase 4` is an execution and live-adjustment module
