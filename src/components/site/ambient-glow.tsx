"use client";

import { useEffect, useRef } from "react";

/**
 * Pointer-reactive ambient lighting — a soft brand-green glow that drifts
 * toward the cursor. Implementation notes:
 *  - Renders ONE fixed decorative element; the rAF loop writes
 *    `transform: translate3d(...)` directly on the DOM node (compositor-only,
 *    no React state, no re-renders, no layout).
 *  - Lerp (0.07/frame) keeps the motion smooth and organic.
 *  - Enabled only for fine pointers (mouse/trackpad) with reduced-motion
 *    respected; on touch devices and for reduced-motion users the layer
 *    stays a static, very soft top-light (or hidden entirely).
 *  - pointer-events: none — never interferes with clicks/selection/scroll.
 */
export function AmbientGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return; // layer stays invisible via its default opacity

    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.28;
    let cx = tx;
    let cy = ty;
    let running = true;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (el.style.opacity !== "1") el.style.opacity = "1";
    };
    const onLeave = () => {
      el.style.opacity = "0";
    };
    const onVisibility = () => {
      // Stop the loop entirely when the tab is hidden — no background work.
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    };

    const loop = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      // Element is centered at its top-left corner (-size/2 margins in CSS),
      // so translate3d to the cursor positions the glow on it.
      el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      if (running) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <div ref={ref} className="pointer-glow" aria-hidden="true" />;
}
