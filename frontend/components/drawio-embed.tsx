"use client";

import { useEffect, useRef } from "react";

const EMBED_ORIGIN = "https://embed.diagrams.net";
// embed=1 + proto=json → postMessage protocol; ui=min keeps the chrome light.
const EMBED_URL = `${EMBED_ORIGIN}/?embed=1&proto=json&spin=1&libraries=1&ui=min&noExitBtn=1&saveAndExit=0&modified=unsavedChanges`;

/**
 * Embeds the real draw.io editor (diagrams.net) and loads mxGraph XML into it.
 * Live edits are streamed back through `onChange` via the autosave/save events.
 */
export function DrawioEmbed({
  xml,
  onChange,
  height = 420,
}: {
  xml: string;
  onChange?: (xml: string) => void;
  height?: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const xmlRef = useRef(xml);
  const onChangeRef = useRef(onChange);
  const readyRef = useRef(false);
  const lastEditorXmlRef = useRef<string | null>(null);
  const lastLoadedXmlRef = useRef<string | null>(null);
  xmlRef.current = xml;
  onChangeRef.current = onChange;

  function postToEditor(message: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), EMBED_ORIGIN);
  }

  function loadXml(nextXml: string) {
    lastLoadedXmlRef.current = nextXml;
    postToEditor({ action: "load", xml: nextXml, autosave: 1 });
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== EMBED_ORIGIN) return;
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      let msg: { event?: string; xml?: string; data?: string } | null = null;
      try {
        msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      if (msg.event === "init") {
        readyRef.current = true;
        loadXml(xmlRef.current);
      } else if ((msg.event === "autosave" || msg.event === "save") && typeof msg.xml === "string") {
        lastEditorXmlRef.current = msg.xml;
        onChangeRef.current?.(msg.xml);
        postToEditor({ action: "export", format: "xml", spin: "Updating preview" });
      } else if (msg.event === "export") {
        const exportedXml = typeof msg.xml === "string" ? msg.xml : typeof msg.data === "string" ? msg.data : null;
        if (exportedXml) {
          lastEditorXmlRef.current = exportedXml;
          onChangeRef.current?.(exportedXml);
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Reload when the XML is replaced externally (e.g. a fresh "Redraft").
  useEffect(() => {
    if (!readyRef.current) {
      return;
    }
    if (xml === lastEditorXmlRef.current || xml === lastLoadedXmlRef.current) {
      return;
    }
    loadXml(xml);
  }, [xml]);

  return (
    <iframe
      ref={iframeRef}
      title="draw.io editor"
      src={EMBED_URL}
      className="drawio-embed-frame"
      style={{ height }}
    />
  );
}
