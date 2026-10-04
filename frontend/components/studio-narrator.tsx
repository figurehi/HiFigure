"use client";

import { useMemo, type ReactNode } from "react";
import type { NarratorMessage } from "../lib/workspace-state";

function MessageBubble({
  message,
}: {
  message: NarratorMessage;
}) {
  const label = message.speaker === "assistant" ? "Guide" : message.speaker === "author" ? "You" : "Status";
  return (
    <article
      className={`guided-message is-${message.speaker} tone-${message.tone} ${message.status === "stale" ? "is-stale" : ""}`}
      data-template-id={message.templateId}
    >
      <div className="guided-message-meta">
        <span>{label}</span>
        {message.status === "stale" ? <span className="guided-message-state">Earlier context</span> : null}
        {message.tone === "cached" ? <span className="guided-message-state">Cached</span> : null}
        {message.tone === "fallback" ? <span className="guided-message-state">Fallback</span> : null}
      </div>
      <p>{message.summary}</p>
    </article>
  );
}

export function GuidedConversationPanel({
  eyebrow,
  title,
  messages,
  collapsed,
  onToggle,
  actions,
  turnContent,
  composer,
  emptyMessage = "I’ll guide the next decision here.",
}: {
  eyebrow: string;
  title: string;
  messages: NarratorMessage[];
  collapsed: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  turnContent?: ReactNode;
  composer?: {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    disabled?: boolean;
    inputDisabled?: boolean;
    label: string;
    meta?: string;
    placeholder?: string;
    hint?: string;
    sendLabel?: string;
    onRestore?: () => void;
    restoreLabel?: string;
  };
  emptyMessage?: string;
}) {
  const { earlier, recent } = useMemo(() => {
    const visibleCount = 7;
    return messages.length > visibleCount
      ? { earlier: messages.slice(0, -visibleCount), recent: messages.slice(-visibleCount) }
      : { earlier: [], recent: messages };
  }, [messages]);

  return (
    <section className={`guided-conversation ${collapsed ? "is-collapsed" : ""}`} aria-label={`${eyebrow} conversation`}>
      <header className="guided-conversation-header">
        <div>
          <span className="label-text">{eyebrow}</span>
          <strong>{title}</strong>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle} aria-expanded={!collapsed}>
          {collapsed ? "Open" : "Collapse"}
        </button>
      </header>
      {!collapsed ? (
        <>
          <div className="guided-conversation-thread" role="log" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 ? (
              <article className="guided-message is-assistant">
                <div className="guided-message-meta"><span>Guide</span></div>
                <p>{emptyMessage}</p>
              </article>
            ) : null}
            {earlier.length > 0 ? (
              <details className="guided-earlier-messages">
                <summary>{earlier.length} earlier message{earlier.length === 1 ? "" : "s"}</summary>
                <div>
                  {earlier.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </div>
              </details>
            ) : null}
            {recent.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {turnContent ? <div className="guided-conversation-choice-panel">{turnContent}</div> : null}
            {composer ? (
              <form
                className="guided-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!composer.disabled) composer.onSend();
                }}
              >
                <label className="guided-composer-label">
                  <span>{composer.label}</span>
                  {composer.meta ? <small>{composer.meta}</small> : null}
                </label>
                <textarea
                  className="textarea"
                  value={composer.value}
                  onChange={(event) => composer.onChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    if (event.shiftKey) return;
                    if (event.metaKey || event.ctrlKey) {
                      event.preventDefault();
                      if (!composer.disabled) composer.onSend();
                      return;
                    }
                    event.preventDefault();
                    if (!composer.disabled) composer.onSend();
                  }}
                  placeholder={composer.placeholder}
                  disabled={composer.inputDisabled ?? composer.disabled}
                />
                <div className="guided-composer-controls">
                  <div>
                    {composer.hint ? <small>{composer.hint}</small> : null}
                    {composer.onRestore ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={composer.onRestore}>
                        {composer.restoreLabel ?? "Restore"}
                      </button>
                    ) : null}
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={composer.disabled}>
                    {composer.sendLabel ?? "Send"}
                  </button>
                </div>
              </form>
            ) : null}
            {actions ? (
              <div className="guided-turn-actions" role="group" aria-label="Suggested next actions">
                <span>Suggested next step</span>
                <div>{actions}</div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <small className="guided-conversation-collapsed-summary">
          {messages[messages.length - 1]?.summary ?? emptyMessage}
        </small>
      )}
    </section>
  );
}
