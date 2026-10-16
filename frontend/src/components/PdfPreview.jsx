import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/build/pdf.mjs";
import { Loading, ErrorState } from "@/components/States";

GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;

export function PdfPreview({ src, title }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const task = getDocument({ url: src });
    setPdf(null); setPage(1); setRendering(true); setError("");
    task.promise.then((loadedPdf) => {
      if (active) setPdf(loadedPdf);
    }).catch(() => {
      if (active) setError("This PDF could not be previewed. Use Download PDF to open the original file.");
    });
    return () => { active = false; task.destroy(); };
  }, [src]);

  useEffect(() => {
    if (!pdf || !width) return;
    let active = true;
    let task;
    setRendering(true);
    const render = async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active) return;
      const canvas = canvasRef.current;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(1.5, width / base.width);
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * pixelRatio });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.floor(base.width * scale)}px`;
      canvas.style.height = `${Math.floor(base.height * scale)}px`;
      task = pdfPage.render({ canvas, canvasContext: canvas.getContext("2d"), viewport });
      await task.promise;
      if (active) setRendering(false);
    };
    render().catch((e) => {
      if (active && e?.name !== "RenderingCancelledException") setError("This PDF could not be previewed. Use Download PDF to open the original file.");
    });
    return () => { active = false; task?.cancel(); };
  }, [pdf, page, width]);

  return (
    <div ref={containerRef} className="w-full">
      {error ? <ErrorState message={error} /> : !pdf ? <Loading label="Loading PDF…" /> : (
        <>
          <div className="min-h-48 max-h-[58vh] overflow-auto rounded-xl flex justify-center" style={{ background: "var(--surface-tertiary)" }}>
            <canvas ref={canvasRef} role="img" aria-label={`${title}, page ${page} of ${pdf.numPages}`} className="bg-white shadow-sm" />
          </div>
          {rendering && <p className="text-sm text-center mt-2" style={{ color: "var(--text-secondary)" }}>Rendering page…</p>}
          <div className="flex items-center justify-center gap-3 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            <button onClick={() => setPage((n) => n - 1)} disabled={page <= 1} aria-label="Previous PDF page" className="p-2 rounded-full disabled:opacity-40" style={{ background: "var(--surface-tertiary)" }}><ChevronLeft size={18} /></button>
            <span>Page {page} of {pdf.numPages}</span>
            <button onClick={() => setPage((n) => n + 1)} disabled={page >= pdf.numPages} aria-label="Next PDF page" className="p-2 rounded-full disabled:opacity-40" style={{ background: "var(--surface-tertiary)" }}><ChevronRight size={18} /></button>
          </div>
        </>
      )}
    </div>
  );
}
