"use client";
import { useEffect, useRef, useState } from "react";

const RENDER_WIDTH = 640;

/** Scaled-down live render of an email. Purely visual — not interactive. */
export function TemplateThumb({ html, title }: { html: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / RENDER_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-line bg-soft" aria-hidden>
      <iframe
        title={`${title} preview`}
        srcDoc={html}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        // Box is 4:5, so the unscaled frame is always 640 × 800.
        style={{ width: RENDER_WIDTH, height: RENDER_WIDTH * 1.25, transform: `scale(${scale})` }}
      />
    </div>
  );
}
