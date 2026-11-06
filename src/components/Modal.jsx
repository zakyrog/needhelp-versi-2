"use client";

import { useEffect, useRef } from "react";

export function Modal({ isOpen, onClose, title, children }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 46, 51, 0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9990,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          maxWidth: "480px",
          width: "100%",
          padding: "24px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            borderBottom: "1px solid #cfdadc",
            paddingBottom: "8px",
          }}
        >
          <h2 id="modal-title" style={{ margin: 0, fontSize: "1.25rem", color: "#0f2e33" }}>
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#5e7a80",
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ color: "#284950", fontSize: "14px", lineHeight: 1.6 }}>
          {children}
        </div>
        <div style={{ marginTop: "24px", textAlign: "right" }}>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
