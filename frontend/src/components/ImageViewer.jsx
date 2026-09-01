import { useEffect, useState, useRef } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

export function ImageViewer({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onWheel = (e) => {
    e.preventDefault();
    setScale((s) => Math.min(5, Math.max(1, s - e.deltaY * 0.002)));
  };

  const onDown = (e) => {
    if (scale <= 1) return;
    drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onUp = () => (drag.current = null);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-up"
      style={{ background: "rgba(15,58,95,0.92)" }}
      onClick={onClose}
      onMouseMove={onMove}
      onMouseUp={onUp}
      data-testid="image-viewer"
    >
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(5, s + 0.5)); }} className="grid place-items-center rounded-full text-white" style={{ width: 44, height: 44, background: "rgba(255,255,255,0.14)" }} data-testid="viewer-zoom-in"><ZoomIn size={20} /></button>
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(1, s - 0.5)); }} className="grid place-items-center rounded-full text-white" style={{ width: 44, height: 44, background: "rgba(255,255,255,0.14)" }} data-testid="viewer-zoom-out"><ZoomOut size={20} /></button>
        <button onClick={onClose} className="grid place-items-center rounded-full text-white" style={{ width: 44, height: 44, background: "rgba(255,255,255,0.14)" }} data-testid="viewer-close"><X size={20} /></button>
      </div>
      <img
        src={src}
        alt="attachment"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={onDown}
        draggable={false}
        className="max-h-[90vh] max-w-[92vw] select-none rounded-lg"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "default", transition: drag.current ? "none" : "transform 0.15s ease" }}
      />
    </div>
  );
}
