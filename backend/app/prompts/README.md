# Prompt Modules

This folder centralizes prompt templates that are sent to model providers.

## Files

- `image_generation.py`
  - Final provider prompt for the OpenAI SDK, OpenAI Responses image tool, and OpenAI Images API.
  - Under `inspiration`, sends the compact Skeleton + Style generation prompt plus reference-image role text.
  - Reference images are appearance-only; layout authority stays in text skeleton/structure sections.

## Still Inline In `services.py`

Some prompts remain inline because they are tightly coupled to local data-shaping helpers:

- medium skeleton reference-template, semantic-graph, and layout-assignment prompts
- final fresh/refine/relayout image prompts

Move those here next when their helper dependencies are untangled.
