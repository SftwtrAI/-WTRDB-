import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";

export function FeedbackWidget() {
  const router = useRouter();
  const [state, setState] = useState("idle"); // idle | thanks
  const [mounted, setMounted] = useState(false);
  const [portalTarget, setPortalTarget] = useState(null);

  useEffect(() => {
    setMounted(true);
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    setState("idle");
  }, [router.pathname]);

  if (!mounted || !portalTarget) return null;

  return createPortal(
    <div className="page-feedback" aria-label="Page feedback">
      {state === "thanks" ? (
        <span className="page-feedback__thanks">
          Thanks for your feedback 🙏
        </span>
      ) : (
        <>
          <span className="page-feedback__label">Was this page helpful?</span>
          <button
            className="page-feedback__btn page-feedback__btn--yes"
            onClick={() => setState("thanks")}
            aria-label="Yes, helpful"
          >
            👍 Yes
          </button>
          <button
            className="page-feedback__btn page-feedback__btn--no"
            onClick={() => setState("thanks")}
            aria-label="No, not helpful"
          >
            👎 No
          </button>
        </>
      )}
    </div>,
    portalTarget,
  );
}
