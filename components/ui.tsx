"use client";
import {
  Children,
  useState,
  useEffect,
  useRef,
  useId,
  isValidElement,
  cloneElement,
  ReactElement,
  ReactNode,
  ComponentProps,
} from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
export const isDemoPath = (path: string) =>
  path === "/demo" || path.startsWith("/demo/");
export function AppLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const demo = isDemoPath(usePathname());
  return (
    <NextLink
      {...props}
      href={
        demo &&
        typeof href === "string" &&
        href.startsWith("/") &&
        !isDemoPath(href)
          ? "/demo" + href
          : href
      }
    />
  );
}
export function DownloadLink({ href, ...props }: ComponentProps<"a">) {
  const demo = isDemoPath(usePathname());
  return (
    <a
      {...props}
      href={
        demo && href?.startsWith("/api/") ? "/api/demo/" + href.slice(5) : href
      }
    />
  );
}
export async function request(
  url: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const demo =
    typeof window !== "undefined" && isDemoPath(window.location.pathname);
  const response = await fetch((demo ? "/api/demo/" : "/api/") + url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : body
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = old;
      requestAnimationFrame(() => previous?.focus());
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        ref={ref}
        onCancel={(e) => {
          e.preventDefault();
          ref.current?.close();
          onClose();
        }}
        aria-modal="true"
        aria-label={title}
        className="modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            ref.current?.close();
            onClose();
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => {
              ref.current?.close();
              onClose();
            }}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </dialog>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const input = Children.map(children, (child) =>
    isValidElement(child) &&
    typeof child.type === "string" &&
    ["input", "select", "textarea"].includes(child.type)
      ? cloneElement(child as ReactElement<Record<string, unknown>>, {
          id,
          "aria-describedby": hint ? id + "-hint" : undefined,
        })
      : child,
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {input}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Form({
  children,
  onSubmit,
  className = "",
}: {
  children: ReactNode;
  onSubmit: (form: HTMLFormElement) => Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className={"form " + className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        try {
          await onSubmit(form);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p role="alert" className="error-text form-error">
          {error}
        </p>
      )}
      {busy && <small role="status">Saving…</small>}
    </form>
  );
}
export function Submit({
  children = "Save changes",
}: {
  children?: ReactNode;
}) {
  return (
    <button className="button primary" type="submit">
      {children}
    </button>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
