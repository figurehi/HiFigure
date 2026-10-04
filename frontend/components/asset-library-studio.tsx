"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  figureFontReferences,
  scientificIconDataUrl,
  scientificIconReferences,
} from "../lib/scientific-assets";
import { useWorkspaceState } from "../lib/workspace-state";

type AssetLibraryView = "all" | "icons" | "fonts";

export function AssetLibraryStudio({ view = "all" }: { view?: AssetLibraryView }) {
  const { state, setState } = useWorkspaceState();
  const [iconQuery, setIconQuery] = useState("");
  const [iconRole, setIconRole] = useState("all");
  const [fontQuery, setFontQuery] = useState("");
  const [fontTone, setFontTone] = useState("all");

  const selectedIconReferenceIds = useMemo(() => {
    const ids = state.iconReferenceIds?.length ? state.iconReferenceIds : [state.iconReferenceId];
    const known = ids.filter((id) => scientificIconReferences.some((item) => item.id === id));
    return Array.from(new Set(known.length ? known : [scientificIconReferences[0].id]));
  }, [state.iconReferenceId, state.iconReferenceIds]);
  const iconReferences = useMemo(
    () =>
      selectedIconReferenceIds
        .map((id) => scientificIconReferences.find((item) => item.id === id))
        .filter((item): item is (typeof scientificIconReferences)[number] => Boolean(item)),
    [selectedIconReferenceIds],
  );
  const iconReference = iconReferences[0] ?? scientificIconReferences[0];
  const fontReference =
    figureFontReferences.find((item) => item.id === state.fontReferenceId) ??
    figureFontReferences[0];

  const iconRoles = useMemo(
    () => Array.from(new Set(scientificIconReferences.map((item) => item.role))).sort(),
    [],
  );
  const fontTones = useMemo(
    () => Array.from(new Set(figureFontReferences.map((item) => item.tone))).sort(),
    [],
  );

  const filteredIcons = useMemo(() => {
    const query = iconQuery.trim().toLowerCase();
    return scientificIconReferences.filter((asset) => {
      const matchesRole = iconRole === "all" || asset.role === iconRole;
      const text = `${asset.label} ${asset.role} ${asset.description}`.toLowerCase();
      return matchesRole && (!query || text.includes(query));
    });
  }, [iconQuery, iconRole]);

  const filteredFonts = useMemo(() => {
    const query = fontQuery.trim().toLowerCase();
    return figureFontReferences.filter((font) => {
      const matchesTone = fontTone === "all" || font.tone === fontTone;
      const text = `${font.label} ${font.tone} ${font.description}`.toLowerCase();
      return matchesTone && (!query || text.includes(query));
    });
  }, [fontQuery, fontTone]);

  const showIcons = view === "all" || view === "icons";
  const showFonts = view === "all" || view === "fonts";

  function toggleIconReference(asset: (typeof scientificIconReferences)[number]) {
    setState((current) => {
      const currentIds = current.iconReferenceIds?.length ? current.iconReferenceIds : [current.iconReferenceId];
      const selected = currentIds.includes(asset.id);
      const nextIds = selected
        ? currentIds.filter((id) => id !== asset.id)
        : [...currentIds, asset.id];
      const normalizedIds = nextIds.length ? nextIds : [asset.id];
      return {
        ...current,
        iconReferenceIds: normalizedIds,
        iconReferenceId: normalizedIds[0],
        status: selected
          ? `${asset.label} removed from icon references.`
          : `${asset.label} added as icon reference.`,
      };
    });
  }

  return (
    <div className="page asset-page">
      <div className="page-inner asset-inner">
        <header className="asset-header">
          <div>
            <span className="label-text">Visual vocabulary</span>
            <h1>{view === "fonts" ? "Font Library" : view === "icons" ? "Icon Library" : "Asset Library"}</h1>
          </div>
          <p>
            Select paper-safe visual references. Icons are HiChart-authored SVG;
            fonts use OFL-backed typography presets.
          </p>
        </header>

        <nav className="asset-tabs" aria-label="Asset library sections">
          <Link href="/assets/icons" className={view === "icons" ? "is-active" : ""}>
            Icons
          </Link>
          <Link href="/assets/fonts" className={view === "fonts" ? "is-active" : ""}>
            Fonts
          </Link>
        </nav>

        <section className={`asset-board ${view !== "all" ? "asset-board-single" : ""}`}>
          {showIcons ? (
            <article className="asset-panel">
              <header>
                <div>
                  <span className="label-text">Icon reference</span>
                  <h2>{iconReferences.length === 1 ? iconReference.label : `${iconReferences.length} icons selected`}</h2>
                </div>
                <span className="asset-license-pill">Project-authored SVG</span>
              </header>
              <div className="asset-icon-preview">
                <div className="asset-icon-preview-stack">
                  {iconReferences.slice(0, 8).map((asset) => (
                    <img key={asset.id} src={scientificIconDataUrl(asset.id)} alt="" />
                  ))}
                </div>
                <p>
                  {iconReferences.length === 1
                    ? iconReference.description
                    : iconReferences.map((asset) => `${asset.label} (${asset.role})`).join(", ")}
                </p>
              </div>
              <div className="asset-controls">
                <label>
                  <span>Search icons</span>
                  <input
                    value={iconQuery}
                    onChange={(event) => setIconQuery(event.target.value)}
                    placeholder="robot, retrieval, DNA, warning..."
                  />
                </label>
                <label>
                  <span>Filter role</span>
                  <select value={iconRole} onChange={(event) => setIconRole(event.target.value)}>
                    <option value="all">All roles</option>
                    {iconRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="asset-count-row">
                <span>{filteredIcons.length} icons</span>
                <span>{scientificIconReferences.length} total</span>
              </div>
              <div className="asset-icon-grid">
                {filteredIcons.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={selectedIconReferenceIds.includes(asset.id) ? "is-selected" : ""}
                    onClick={() => toggleIconReference(asset)}
                  >
                    <img src={scientificIconDataUrl(asset.id)} alt="" />
                    <strong>{asset.label}</strong>
                    <span>{asset.role}</span>
                  </button>
                ))}
              </div>
            </article>
          ) : null}

          {showFonts ? (
            <article className="asset-panel">
              <header>
                <div>
                  <span className="label-text">Font reference</span>
                  <h2>{fontReference.label}</h2>
                </div>
                <span className="asset-license-pill">SIL OFL stack</span>
              </header>
              <div className="asset-font-preview" style={{ fontFamily: fontReference.cssFamily }}>
                <strong>Dynamic Multimodal Retrieval</strong>
                <span>{"Input image + question -> planner -> evidence -> answer"}</span>
                <small>{fontReference.description}</small>
              </div>
              <div className="asset-controls">
                <label>
                  <span>Search fonts</span>
                  <input
                    value={fontQuery}
                    onChange={(event) => setFontQuery(event.target.value)}
                    placeholder="paper, equation, callout, slide..."
                  />
                </label>
                <label>
                  <span>Filter tone</span>
                  <select value={fontTone} onChange={(event) => setFontTone(event.target.value)}>
                    <option value="all">All tones</option>
                    {fontTones.map((tone) => (
                      <option key={tone} value={tone}>
                        {tone}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="asset-count-row">
                <span>{filteredFonts.length} presets</span>
                <span>{figureFontReferences.length} total</span>
              </div>
              <div className="asset-font-grid">
                {filteredFonts.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    className={font.id === fontReference.id ? "is-selected" : ""}
                    style={{ fontFamily: font.cssFamily }}
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        fontReferenceId: font.id,
                        status: `${font.label} selected as font reference.`,
                      }))
                    }
                  >
                    <strong>Aa</strong>
                    <span>{font.label}</span>
                    <small>{font.tone}</small>
                  </button>
                ))}
              </div>
            </article>
          ) : null}
        </section>
      </div>
    </div>
  );
}
