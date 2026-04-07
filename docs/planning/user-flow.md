# RecoDate Updated User Flow

Source: `데이트_코스_맞춤_추천_앱_Recodate_기획서_수정.pdf`

## 1. Quick Start

The user selects:

- transport method
- anchor place
- specific date time

This stage is designed to produce a recommendation with minimal input.

## 2. Deep Dive (Optional)

If the user wants finer control, they enter advanced settings:

- place characteristics
  - manually selected
  - random
  - food type
- budget cap
- movement range
- number of courses
- date genre or category

This stage exists for refinement, not as a required first step.

## 3. Full Course Generation And Selection

The system generates multiple course options with all selected conditions reflected.

- the user reviews several full-course results
- if the results are unsatisfying, they can:
  - request a fresh search
  - modify detailed categories and search again
- after that, the user enters a course detail page

## 4. Direct Editing And Customization

Inside the selected course, the user can directly edit the plan.

- all categories can be modified
- individual places can be replaced through full-database search
- course order can be rearranged
- route and travel time are automatically recalculated after edits

This is the key differentiation point of RecoDate.

## 5. Save, Share, And Execute

After final confirmation:

- save the course
- share the course
- optionally use route guidance if time allows implementation
- modify the course in real time during the date if needed

## Product Interpretation

The revised scenario makes the flow clearer:

- `Quick Start` now centers on `transport + place + time`
- `Deep Dive` holds detailed customization such as genre, movement range, and course count
- re-search is explicitly allowed before entering the detail page
- editing remains fully interactive through `Open-Swap` and reordering
