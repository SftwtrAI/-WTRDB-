import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AnalyticsScript } from "@wtrops/shared";

interface AnalyticsScriptsProps {
  placement?: "head" | "body" | "all";
}

export function AnalyticsScripts({ placement = "all" }: AnalyticsScriptsProps) {
  const injectedScriptsRef = useRef<Set<string>>(new Set());
  const cleanupFunctionsRef = useRef<Map<string, () => void>>(new Map());

  const { data: scripts } = useQuery<AnalyticsScript[]>({
    queryKey: ["/api/public/analytics-scripts"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!scripts || scripts.length === 0) {
      return;
    }

    const filteredScripts =
      placement === "all"
        ? scripts
        : scripts.filter((s) => {
            const placements = Array.isArray(s.placement)
              ? s.placement
              : [s.placement];
            return placements.includes(placement);
          });

    const sortedScripts = [...filteredScripts].sort(
      (a, b) => b.loadPriority - a.loadPriority,
    );

    sortedScripts.forEach((script) => {
      const scriptKey = `${script.id}-${script.updatedAt || "init"}`;

      if (injectedScriptsRef.current.has(scriptKey)) {
        return;
      }

      const oldCleanup = cleanupFunctionsRef.current.get(script.id);
      if (oldCleanup) {
        oldCleanup();
        cleanupFunctionsRef.current.delete(script.id);
      }

      const placements = Array.isArray(script.placement)
        ? script.placement
        : [script.placement];

      if (placement === "all") {
        placements.forEach((p) => {
          const cleanup = injectScript(script, p as "head" | "body");
          if (cleanup) {
            const existingCleanup = cleanupFunctionsRef.current.get(
              `${script.id}-${p}`,
            );
            if (existingCleanup) {
              const combinedCleanup = () => {
                existingCleanup();
                cleanup();
              };
              cleanupFunctionsRef.current.set(
                `${script.id}-${p}`,
                combinedCleanup,
              );
            } else {
              cleanupFunctionsRef.current.set(`${script.id}-${p}`, cleanup);
            }
          }
        });
      } else if (placements.includes(placement)) {
        const cleanup = injectScript(script, placement);
        if (cleanup) {
          cleanupFunctionsRef.current.set(`${script.id}-${placement}`, cleanup);
        }
      }

      injectedScriptsRef.current.add(scriptKey);
    });

    return () => {
      cleanupFunctionsRef.current.forEach((cleanup) => {
        cleanup();
      });
      cleanupFunctionsRef.current.clear();
      injectedScriptsRef.current.clear();
    };
  }, [scripts, placement]);

  return null;
}

function injectScript(
  script: AnalyticsScript,
  targetPlacement: "head" | "body",
): (() => void) | null {
  const targetElement =
    targetPlacement === "head" ? document.head : document.body;
  const insertedElements: Element[] = [];

  const scriptPlacements = Array.isArray(script.placement)
    ? script.placement
    : [script.placement];
  const isDualPlacement =
    scriptPlacements.includes("head") && scriptPlacements.includes("body");

  const headCode = ((script as any).headCode || "").trim();
  const bodyCode = ((script as any).bodyCode || "").trim();
  const legacyCode = (script.code || "").trim();
  const hasNewFields = headCode || bodyCode;

  let codeToInject: string;
  let usingNewFields = false;
  if (hasNewFields) {
    codeToInject = targetPlacement === "head" ? headCode : bodyCode;
    usingNewFields = true;
  } else if (legacyCode) {
    codeToInject = legacyCode;
  } else {
    return null;
  }

  if (!codeToInject) {
    return null;
  }

  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = codeToInject;

    const elements = Array.from(tempDiv.children);

    elements.forEach((element) => {
      const tagName = element.tagName.toLowerCase();

      if (tagName === "script") {
        if (!usingNewFields && isDualPlacement && targetPlacement !== "head") {
          return;
        }
        const newScript = document.createElement("script");

        Array.from(element.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });

        if (script.async) {
          newScript.async = true;
        }
        if (script.defer) {
          newScript.defer = true;
        }

        newScript.setAttribute("data-analytics-id", script.id);
        newScript.setAttribute("data-analytics-name", script.name);
        newScript.setAttribute("data-analytics-placement", targetPlacement);

        if (element.textContent) {
          newScript.textContent = element.textContent;
        }

        targetElement.appendChild(newScript);
        insertedElements.push(newScript);
      } else if (tagName === "noscript") {
        if (!usingNewFields && isDualPlacement && targetPlacement !== "body") {
          return;
        }
        const newNoscript = document.createElement("noscript");
        newNoscript.innerHTML = element.innerHTML;
        newNoscript.setAttribute("data-analytics-id", script.id);
        newNoscript.setAttribute("data-analytics-placement", targetPlacement);
        document.body.appendChild(newNoscript);
        insertedElements.push(newNoscript);
      } else if (
        tagName === "link" ||
        tagName === "style" ||
        tagName === "meta"
      ) {
        if (!usingNewFields && isDualPlacement && targetPlacement !== "head") {
          return;
        }
        if (tagName === "link") {
          const newLink = document.createElement("link");
          Array.from(element.attributes).forEach((attr) => {
            newLink.setAttribute(attr.name, attr.value);
          });
          newLink.setAttribute("data-analytics-id", script.id);
          newLink.setAttribute("data-analytics-placement", targetPlacement);
          targetElement.appendChild(newLink);
          insertedElements.push(newLink);
        } else if (tagName === "style") {
          const newStyle = document.createElement("style");
          newStyle.textContent = element.textContent;
          newStyle.setAttribute("data-analytics-id", script.id);
          newStyle.setAttribute("data-analytics-placement", targetPlacement);
          targetElement.appendChild(newStyle);
          insertedElements.push(newStyle);
        } else {
          const newMeta = document.createElement("meta");
          Array.from(element.attributes).forEach((attr) => {
            newMeta.setAttribute(attr.name, attr.value);
          });
          newMeta.setAttribute("data-analytics-id", script.id);
          newMeta.setAttribute("data-analytics-placement", targetPlacement);
          targetElement.appendChild(newMeta);
          insertedElements.push(newMeta);
        }
      } else {
        if (!usingNewFields && isDualPlacement && targetPlacement !== "body") {
          return;
        }
        const clone = element.cloneNode(true) as Element;
        clone.setAttribute("data-analytics-id", script.id);
        clone.setAttribute("data-analytics-placement", targetPlacement);
        targetElement.appendChild(clone);
        insertedElements.push(clone);
      }
    });

    const rawScriptMatch = codeToInject.match(
      /<script[^>]*>([\s\S]*?)<\/script>/gi,
    );
    if (!rawScriptMatch && codeToInject.trim() && !codeToInject.includes("<")) {
      if (usingNewFields || !isDualPlacement || targetPlacement === "head") {
        const rawScript = document.createElement("script");
        rawScript.textContent = codeToInject;
        if (script.async) {
          rawScript.async = true;
        }
        if (script.defer) {
          rawScript.defer = true;
        }
        rawScript.setAttribute("data-analytics-id", script.id);
        rawScript.setAttribute("data-analytics-name", script.name);
        rawScript.setAttribute("data-analytics-placement", targetPlacement);
        targetElement.appendChild(rawScript);
        insertedElements.push(rawScript);
      }
    }

    return () => {
      insertedElements.forEach((el) => {
        try {
          el.remove();
        } catch (e) {}
      });
    };
  } catch (error) {
    console.error(`Failed to inject analytics script "${script.name}":`, error);
    return null;
  }
}

export default AnalyticsScripts;
