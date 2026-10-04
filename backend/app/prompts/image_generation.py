def responses_reference_preface(reference_images: list[str], reference_role: str) -> str:
    if not reference_images:
        return "No reference images are attached."
    if reference_role == "canonical_relayout":
        return (
            "Attached image #1 is a canonical render. Redraw it with a new layout while "
            "preserving labels, colors, and visual language."
        )
    if reference_role == "masked_inpaint":
        return (
            "Attached image #1 is the source diagram and image #2 is a mask. Preserve source "
            "image regions outside the editable mask and repaint only the allowed zones."
        )
    if reference_role == "locked_refine":
        return (
            "Image #1 is the complete draft. Preserve its content and geometry; use later images only for the "
            "roles in FINAL REFERENCE MANIFEST and follow the prompt's AUTHORITY RULES. Redraw rather than paste."
        )
    if reference_role == "match_refine":
        return (
            "Image #1 is the authoritative complete pass-1 draft. Apply only explicit Match bindings and make the "
            "smallest local spacing, sizing, or route adjustments required to integrate them. Later images are "
            "consistency references for changed targets only; preserve all unbound draft regions."
        )
    if reference_role == "annotation_edit":
        return (
            "Attached image #1 is the clean source figure. Attached image #2 is the same figure with "
            "semi-transparent violet mask rectangles and optional local style cue panels on top. "
            "Treat each violet mask as its own editable area and apply its accompanying mask note or style cue "
            "inside that rectangle. "
            "If later images are attached, use them only as optional icon/style/color references for the "
            "masked edit. Apply the requested changes locally, preserve unmasked content, and remove all mask "
            "overlays and cue panels from the final image."
        )
    return (
        f"{len(reference_images[:4])} reference image(s) are attached. Use them as style or "
        "structural inspiration according to the prompt. Do not copy them verbatim."
    )


def image_generation_provider_prompt(
    *,
    prompt: str,
    reference_images: list[str],
    reference_role: str,
    output_instruction: str,
) -> str:
    if reference_images and reference_role == "inspiration":
        return "\n\n".join(
            [
                "Generate one publication-quality methodology figure for an academic paper.",
                reference_image_role_prompt(reference_images),
                prompt,
                output_instruction,
            ]
        )
    return "\n\n".join(
        [
            responses_reference_preface(reference_images, reference_role),
            prompt,
            output_instruction,
        ]
    )


def reference_image_role_prompt(reference_images: list[str]) -> str:
    count = len(reference_images)
    if count:
        return (
            f"Reference images ({count} attached). FINAL REFERENCE MANIFEST and AUTHORITY RULES define every image's role. "
            "Use LAYOUT only for macro composition, STYLE only for appearance, SKELETON only for semantic topology, and ICON references only for named glyph identity. "
            "Never copy source content, reference-card UI, crop frames, annotations, or watermarks."
        )
    return "No reference images are attached."
