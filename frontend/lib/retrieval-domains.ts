import type { RetrievalDomain } from "./types";

export type RetrievalDomainOption = {
  value: RetrievalDomain;
  label: string;
};

export type RetrievalDomainGroup = {
  label: string;
  options: RetrievalDomainOption[];
};

export const referenceRetrievalDomainGroups: RetrievalDomainGroup[] = [
  {
    label: "Search goal",
    options: [
      { value: "idea_overview", label: "Idea formation" },
      { value: "structure_overview", label: "Layout" },
      { value: "style_overview", label: "Style" },
    ],
  },
];

export const defaultReferenceRetrievalDomain: RetrievalDomain = "idea_overview";
