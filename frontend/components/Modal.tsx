"use client";

import { KeyboardEvent, useEffect, useId, useRef } from "react";
import { Icon } from "./Icons";

export function Modal({ title, children, onClose, footer, width = 680 }: { title: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode; width?: number }) {
  const titleId = useId();
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstControl = modalRef.current?.querySelector<HTMLElement>(".modal-body input:not([disabled]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled]), .modal-body button:not([disabled]), footer button:not([disabled])");
    firstControl?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") || []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ maxWidth: width }} onKeyDown={handleKeyDown} onMouseDown={(e) => e.stopPropagation()}>
      <header><h2 id={titleId}>{title}</h2><button aria-label="Close" onClick={onClose}><Icon name="close" /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  </div>;
}
