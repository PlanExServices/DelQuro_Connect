import { useEffect, useState, useRef } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

export function ImageViewer({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pinch = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clamp = (s) => Math.min(5, Math.max(1, s));

  const onWheel = (e) => {
    e.preventDefault();
    setScale((s) => clamp(s - e.deltaY * 0.002));
  };

  // Mouse drag
  const onDown = (e) => {
    if (scale <= 1) return;
    drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onUp = () => (drag.current = null);

  // Touch: pinch to zoom, single-finger pan when zoomed
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinch.current = { d: dist(e.touches), s: scale };
    } else if (e.touches.length === 1 && scale > 1) {
      drag.current = { x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const ratio = dist(e.touches) / pinch.current.d;
      setScale(clamp(pinch.current.s * ratio));
    } else if (e.touches.length === 1 && drag.current) {
      setPos({ x: e.touches[0].clientX - drag.current.x, y: e.touches[0].clientY - drag.current.y });
    }
  };
  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length === 0) drag.current = null;
  };

  const btn = { width: 44, height: 44, background: "rgba(255,255,255,0.14)" };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-up"
      style={{ background: "rgba(15,58,95,0.92)", touchAction: "none" }}
      onClick={onClose}
      onMouseMove={onMove}
      onMouseUp={onUp}
      data-testid="image-viewer"
    >
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => clamp(s + 0.5)); }} className="grid place-items-center rounded-full text-white" style={btn} data-testid="viewer-zoom-in"><ZoomIn size={20} /></button>
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => clamp(s - 0.5)); }} className="grid place-items-center rounded-full text-white" style={btn} data-testid="viewer-zoom-out"><ZoomOut size={20} /></button>
        <button onClick={onClose} className="grid place-items-center rounded-full text-white" style={btn} data-testid="viewer-close"><X size={20} /></button>
      </div>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-white/70 z-10 pointer-events-none">Pinch, scroll, or use buttons to zoom · drag to pan</div>
      <img
        src={src}
        alt="attachment"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={onDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        draggable={false}
        className="max-h-[90vh] max-w-[92vw] select-none rounded-lg"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "default", transition: drag.current || pinch.current ? "none" : "transform 0.15s ease" }}
      />
    </div>
  );
}
