export function getObserver() {
  if (typeof window === "undefined") return null;
  if (window.__wtrdb_observer) return window.__wtrdb_observer;
  window.__wtrdb_observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
          window.__wtrdb_observer?.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.06, rootMargin: "0px 0px -16px 0px" },
  );
  return window.__wtrdb_observer;
}

export function animatePageElements() {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    const observer = getObserver();
    if (!observer) return;
    const elements = document.querySelectorAll(
      ".use-case-card:not([data-animated]), .stat-card:not([data-animated]), .qs-step:not([data-animated])",
    );
    elements.forEach((el, i) => {
      el.dataset.animated = "true";
      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";
      el.style.transition = `opacity 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 45}ms, transform 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 45}ms`;
      observer.observe(el);
    });
  });
}
