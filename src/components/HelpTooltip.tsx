"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type HelpContextValue = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider(props: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <HelpContext.Provider value={value}>{props.children}</HelpContext.Provider>;
}

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used inside <HelpProvider />");
  return ctx;
}

export function HelpIcon(props: { id: string; text: string }) {
  const { id, text } = props;
  const { openId, setOpenId } = useHelp();
  const isOpen = openId === id;

  // Close on outside click / touch, Esc, or scroll
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      // Close if click is outside any tooltip container
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`[data-help-root="${id}"]`)) return;
      setOpenId(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };

    const onScroll = () => setOpenId(null);

    document.addEventListener("mousedown", onPointerDown, { passive: true });
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isOpen, id, setOpenId]);

  return (
    <span className="relative inline-flex items-center" data-help-root={id}>
      <button
        type="button"
        aria-label="Help"
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-xs text-neutral-300 hover:bg-neutral-900 active:bg-neutral-800"
        onClick={(e) => {
          e.stopPropagation();
          setOpenId(isOpen ? null : id);
        }}
      >
        ?
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className="absolute z-50 mt-2 w-72 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-200 shadow-lg"
          style={{ top: "100%", left: 0 }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
