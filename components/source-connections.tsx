"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  sourceProviderNames,
  type RemoteSource,
  type SourceConnectionResult,
  type SourceProvider,
} from "@/lib/source-connections";
import { Modal, request } from "./ui";

type ImportedSource = NonNullable<SourceConnectionResult["source"]>;

export function SourceConnections({
  providers,
  onImport,
}: {
  providers: SourceProvider[];
  onImport: (source: ImportedSource) => Promise<void>;
}) {
  const [provider, setProvider] = useState<SourceProvider | null>(null);
  function close() {
    setProvider(null);
  }
  return (
    <>
      <button
        className="button secondary"
        type="button"
        onClick={() => setProvider(providers[0])}
      >
        Import from connected apps
      </button>
      {provider &&
        createPortal(
          <ConnectionPicker
            key={provider}
            provider={provider}
            providers={providers}
            changeProvider={setProvider}
            onClose={close}
            onImport={onImport}
          />,
          document.body,
        )}
    </>
  );
}

function ConnectionPicker({
  provider,
  providers,
  changeProvider,
  onClose,
  onImport,
}: {
  provider: SourceProvider;
  providers: SourceProvider[];
  changeProvider: (provider: SourceProvider) => void;
  onClose: () => void;
  onImport: (source: ImportedSource) => Promise<void>;
}) {
  const [authorization, setAuthorization] = useState("");
  const [items, setItems] = useState<RemoteSource[] | null>(null);
  const [folders, setFolders] = useState<RemoteSource[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function perform(
    action: string,
    options: Record<string, unknown> = {},
    handle?: (result: SourceConnectionResult) => Promise<void> | void,
  ) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result: SourceConnectionResult = await request(
        "source-connections",
        { provider, action, ...options },
      );
      setAuthorization(result.authorization ?? "");
      if (!result.authorization) await handle?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function browse(nextFolders = folders, next?: string) {
    void perform(
      "browse",
      { folder: nextFolders.at(-1)?.id, cursor: next },
      async (result) => {
        if (result.picker) {
          setGoogleOpen(true);
          try {
            const { pickGoogleFile } = await import("./google-drive-picker");
            const item = await pickGoogleFile(result.picker);
            if (item) setItems([{ id: item.id, title: item.name }]);
          } finally {
            setGoogleOpen(false);
          }
          return;
        }
        setFolders(nextFolders);
        setCursor(result.cursor);
        setItems((current) =>
          next
            ? [...(current ?? []), ...(result.items ?? [])]
            : (result.items ?? []),
        );
      },
    );
  }

  function importItem(item: RemoteSource, transcript = false) {
    void perform(
      "import",
      { id: item.id, transcript, title: item.title.slice(0, 300) },
      async ({ source }) => {
        if (!source) return;
        await onImport(source);
        setStatus(
          source.duplicate
            ? "Reused a matching saved source."
            : "Added to your saved material.",
        );
      },
    );
  }

  if (googleOpen) return null;
  return (
    <Modal title="Import from connected apps" onClose={onClose}>
      <div
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement)
            event.preventDefault();
        }}
      >
        <p>
          Evidence saves a private copy of each item you import. When you
          analyze it, its text is sent to your configured AI provider.
        </p>
        <label>
          Source app
          <select
            value={provider}
            disabled={busy}
            onChange={(e) => changeProvider(e.target.value as SourceProvider)}
          >
            {providers.map((item) => (
              <option value={item} key={item}>
                {sourceProviderNames[item]}
              </option>
            ))}
          </select>
        </label>
        {provider === "confluence" ? (
          <>
            <label>
              Confluence Cloud page link
              <input
                type="url"
                value={link}
                disabled={busy}
                maxLength={2048}
                onChange={(e) => {
                  setLink(e.target.value);
                  setItems(null);
                }}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              disabled={busy || !link.trim()}
              onClick={() =>
                void perform("preview", { id: link.trim() }, (result) =>
                  setItems(result.items ?? []),
                )
              }
            >
              Preview page
            </button>
          </>
        ) : (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => browse([])}
          >
            {provider === "granola"
              ? "Browse recent meetings"
              : "Choose a file"}
          </button>
        )}
        {authorization && (
          <p>
            <a
              className="text-link"
              href={authorization}
              target="_blank"
              rel="noreferrer"
            >
              Authorize {sourceProviderNames[provider]} in a new tab
            </a>{" "}
            then return here and try again.
          </p>
        )}
        {folders.length > 0 && (
          <p>
            <button
              className="button ghost"
              type="button"
              disabled={busy}
              onClick={() => browse(folders.slice(0, -1))}
            >
              Back to parent folder
            </button>{" "}
            {folders.at(-1)?.title}
          </p>
        )}
        {items?.length === 0 && <p>No supported items found.</p>}
        {items && items.length > 0 && (
          <ul className="flow-connected-items">
            {items.map((item) => (
              <li key={item.id} className="flow-connected-item">
                {item.folder ? (
                  <button
                    className="button ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => browse([...folders, item])}
                  >
                    Open {item.title}
                  </button>
                ) : (
                  <>
                    <strong>{item.title}</strong>
                    {item.date ? " · " + item.date : ""}
                    <div className="button-row">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => importItem(item)}
                      >
                        {provider === "granola" ? "Import notes" : "Import"}
                        <span className="sr-only"> {item.title}</span>
                      </button>
                      {provider === "granola" && (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => importItem(item, true)}
                        >
                          Import transcript
                          <span className="sr-only"> {item.title}</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => browse(folders, cursor)}
          >
            Show more
          </button>
        )}
        {provider === "granola" && (
          <p>
            Notes are saved as company context. Transcripts require a paid
            Granola plan and workspace permission.
          </p>
        )}
        {provider === "confluence" && (
          <p>
            Pages are saved as company context. You can change the source type
            in Discovery.
          </p>
        )}
        {busy && (
          <p role="status">Working with {sourceProviderNames[provider]}…</p>
        )}
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
        {!authorization && (
          <button
            className="button ghost"
            type="button"
            disabled={busy}
            onClick={() =>
              void perform("disconnect", {}, () => {
                setItems(null);
                setFolders([]);
                setCursor(undefined);
                setStatus(
                  "Disconnected. Previously imported material remains saved.",
                );
              })
            }
          >
            Disconnect {sourceProviderNames[provider]}
          </button>
        )}
      </div>
    </Modal>
  );
}
