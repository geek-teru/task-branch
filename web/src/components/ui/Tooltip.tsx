import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Hover / focus delay before the first tooltip shows. Moving to the next element right after
// shows its tooltip at once (as native tooltips do).
const SHOW_DELAY = 500;
const WARM_FOR = 300;
const GAP = 6;
const EDGE = 8;

// One tooltip for the whole app, in the app's design instead of the browser's black box.
// Put the text on any element as data-tooltip (not title, which shows the native tooltip);
// "\n" starts a new line. Mount <TooltipLayer /> once at the root.
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; anchor: Element } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: Element | null = null;
    let hiddenAt = 0;

    const show = (el: Element) => {
      const text = el.getAttribute("data-tooltip");
      if (!text) return;
      current = el;
      window.clearTimeout(timer);
      const warm = Date.now() - hiddenAt < WARM_FOR;
      timer = window.setTimeout(() => setTip({ text, anchor: el }), warm ? 0 : SHOW_DELAY);
    };
    const hide = () => {
      window.clearTimeout(timer);
      if (current) hiddenAt = Date.now();
      current = null;
      setTip(null);
    };
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-tooltip]") : null);

    const onOver = (e: PointerEvent) => {
      // No tooltip while dragging (column widths, Gantt bars, Kanban cards).
      if (e.buttons !== 0) return;
      const el = target(e);
      if (el === current) return;
      if (el) show(el);
      else hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = target(e);
      // Keyboard focus only; a click also focuses the button.
      if (el && el.matches(":focus-visible")) show(el);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Hide when the element goes away (a row removed, a dialog closed) while its tooltip is up.
  useEffect(() => {
    if (!tip) return;
    const id = window.setInterval(() => {
      if (!tip.anchor.isConnected) setTip(null);
    }, 200);
    return () => window.clearInterval(id);
  }, [tip]);

  // Centered under the element; above it when there is no room below; kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) {
      setPos(null);
      return;
    }
    const a = tip.anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = boxRef.current;
    const below = a.bottom + GAP;
    const top = below + h > window.innerHeight - EDGE ? a.top - GAP - h : below;
    const left = Math.min(Math.max(a.left + a.width / 2 - w / 2, EDGE), window.innerWidth - w - EDGE);
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={boxRef}
      role="tooltip"
      className="pointer-events-none fixed z-[200] max-w-[320px] whitespace-pre-line break-words rounded-md border border-border bg-surface px-2 py-1 font-sans text-xs leading-snug text-fg shadow-md"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {tip.text}
    </div>
  );
}
