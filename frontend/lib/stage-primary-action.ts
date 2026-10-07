import type { StageActionBarProps } from "../components/stage-action-bar";

/** Registered by child stages (Layout, Style) when the parent cannot own the handler. */
export type StagePrimaryActionRegistration = Pick<
  StageActionBarProps,
  | "meta"
  | "metaTitle"
  | "primaryLabel"
  | "disabled"
  | "loading"
  | "guideAnchor"
  | "secondaryLabel"
  | "secondaryDisabled"
> & {
  onPrimary: () => void;
  onSecondary?: () => void;
};

export function registrationToBarProps(
  registration: StagePrimaryActionRegistration,
): StageActionBarProps {
  return {
    meta: registration.meta,
    metaTitle: registration.metaTitle,
    primaryLabel: registration.primaryLabel,
    onPrimary: registration.onPrimary,
    disabled: registration.disabled,
    loading: registration.loading,
    guideAnchor: registration.guideAnchor,
    secondaryLabel: registration.secondaryLabel,
    onSecondary: registration.onSecondary,
    secondaryDisabled: registration.secondaryDisabled,
  };
}

/** Stable key for comparing registrations without comparing callback identity. */
export function stagePrimaryActionSignature(
  registration: StagePrimaryActionRegistration | null,
): string {
  if (!registration) return "";
  return JSON.stringify({
    meta: registration.meta ?? "",
    metaTitle: registration.metaTitle ?? "",
    primaryLabel: registration.primaryLabel,
    disabled: Boolean(registration.disabled),
    loading: Boolean(registration.loading),
    guideAnchor: registration.guideAnchor ?? "",
    secondaryLabel: registration.secondaryLabel ?? "",
    secondaryDisabled: Boolean(registration.secondaryDisabled),
  });
}
