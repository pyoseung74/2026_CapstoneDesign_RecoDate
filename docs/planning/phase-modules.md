# RecoDate Phase Module Draft

This document maps the final flowchart into implementation modules.

## Module Strategy

The product should be split by phase first, with shared business logic extracted into common modules.

Backend implementation target:

- Python
- FastAPI
- service-oriented recommendation modules

## Phase Modules

### `phase1-initial-input`

Responsibility:

- entry from main dashboard
- base input form
- quick start action
- deep dive action

Owns:

- transport input
- region input
- time input
- navigation to quick start or deep dive

Submodules:

- `base-info-form`
- `quick-start-action`
- `deep-dive-form`
- `region-scope-selector`

### `phase2-selection-hub`

Responsibility:

- run recommendation request
- show 3 to 5 full-course cards
- handle retry and reselection paths

Owns:

- result list state
- simple refresh
- condition-change re-search entry
- course selection

Submodules:

- `course-list`
- `simple-refresh`
- `condition-research`

### `phase3-customizing`

Responsibility:

- open selected course detail
- allow user-driven edits
- rebuild and reorganize edited course output

Owns:

- open-swap
- reorder
- element editing
- confirm edited course
- overwrite current recommendation with recalculated result
- collect satisfaction or dissatisfaction after overwrite

Submodules:

- `course-detail`
- `open-swap-editor`
- `reorder-editor`
- `course-review-and-rebuild`
- `post-edit-satisfaction-check`

### `phase4-execution`

Responsibility:

- save and share
- route guidance start
- real-time course revision during execution

Owns:

- save or favorite
- SNS share
- live navigation
- live replanning on interruption

Submodules:

- `save-share`
- `live-navigation`
- `live-replanning`

## Shared Modules

These should stay outside phase-specific UI modules.

### `recommendation-engine`

- quick start recommendation
- deep dive filtered recommendation
- refresh with same conditions

### `course-state`

- active conditions
- selected course
- edited course draft
- finalized course

### `place-search`

- search by region
- search by category
- search for replacement places

### `course-rebuild`

- validate edited route
- recalculate order, time, and route
- produce a cleaned course result after manual edits

### `execution-context`

- current location
- active navigation session
- interruption handling

## Immediate Development Implication

The temporary interface zip is useful as a visual prototype, but its current screen structure does not fully match the final flow:

- current `QuickStart` screen still uses `genre -> time`
- final flow requires `transport + region + time` first
- current result/detail screens are reusable as references
- community and mypage screens should be treated as secondary, not phase-core modules
- current MVP should be implemented as `Gangneung-si only`, while keeping the region model extensible
