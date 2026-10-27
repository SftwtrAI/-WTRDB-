import { useState, type ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type PanelVariant = "inspector" | "workspace" | "command" | "toast" | "dashboard" | "tray" | "reading";

interface HolographicPanelProps {
  title?: string;
  subtitle?: string;
  variant?: PanelVariant;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  onClose?: () => void;
}

export function HolographicPanel({
  title,
  subtitle,
  variant = "workspace",
  className,
  bodyClassName,
  children,
  footer,
  actions,
  collapsible = false,
  onClose,
}: HolographicPanelProps) {
  const [minimized, setMinimized] = useState(false);

  return (
    <section
      className={cn(
        "holographic-panel",
        `holographic-panel--${variant}`,
        minimized && "holographic-panel--minimized",
        className,
      )}
    >
      {(title || subtitle || collapsible || onClose || actions) && (
        <>
          <header className="holographic-panel__header">
            <div className="holographic-panel__title-wrap">
              {title ? <h2 className="holographic-panel__title">{title}</h2> : null}
              {subtitle ? <p className="holographic-panel__subtitle">{subtitle}</p> : null}
            </div>
            <div className="holographic-panel__actions">
              {actions}
              {collapsible ? (
                <button
                  type="button"
                  className="holographic-panel__icon-btn"
                  onClick={() => setMinimized((value) => !value)}
                  aria-label={minimized ? "Restore panel" : "Minimize panel"}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onClose ? (
                <button
                  type="button"
                  className="holographic-panel__icon-btn"
                  onClick={onClose}
                  aria-label="Close panel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </header>
          <div className="holographic-panel__divider" />
        </>
      )}
      {!minimized ? (
        <>
          <div className={cn("holographic-panel__body", bodyClassName)}>{children}</div>
          {footer ? <footer className="holographic-panel__footer">{footer}</footer> : null}
        </>
      ) : null}
    </section>
  );
}
