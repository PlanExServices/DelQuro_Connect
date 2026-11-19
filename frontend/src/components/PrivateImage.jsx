import { useEffect, useRef, useState } from "react";
import { fetchAttachment } from "@/lib/api";

export function PrivateImage({ fileId, onPreview, previewLabel, className, alt }) {
  const target = useRef(null);
  const [seen, setSeen] = useState(false);
  const [file, setFile] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSeen(true);
    });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    const controller = new AbortController();
    let objectUrl;
    setFile(null);
    setFailed(false);
    fetchAttachment(fileId, controller.signal).then((url) => {
      if (controller.signal.aborted) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setFile({ id: fileId, url });
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, seen]);

  const url = file?.id === fileId ? file.url : null;
  return (
    <div ref={target} className="min-h-5">
      {url ? (
        onPreview ? (
          <button type="button" onClick={() => onPreview(url)} aria-label={previewLabel || `Open ${alt}`} className="block max-w-full">
            <img src={url} alt={alt} className={className} />
          </button>
        ) : <img src={url} alt={alt} className={className} />
      ) : failed ? <span className="text-sm">Image unavailable</span> : null}
    </div>
  );
}
