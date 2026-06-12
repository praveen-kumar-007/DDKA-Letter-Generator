import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function debounce(fn, ms) {
  let t = 0;
  return () => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(), ms);
  };
}

export default function LetterPdfPreview({ pdfData, onSheetRef }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfDocRef = useRef(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (typeof onSheetRef === "function") {
      onSheetRef(wrapRef.current);
    }

    if (!(pdfData instanceof ArrayBuffer) || pdfData.byteLength === 0) {
      pdfDocRef.current = null;
      setBroken(false);
      return undefined;
    }

    let cancelled = false;
    let resizeObserver = null;

    async function disposeDocument() {
      const doc = pdfDocRef.current;
      pdfDocRef.current = null;
      if (!doc) return;
      await doc.destroy().catch(() => {});
    }

    const draw = async () => {
      if (cancelled) return;

      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;

      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const pdfDocument = pdfDocRef.current;

      if (!wrap || !canvas || !pdfDocument) return;

      let page;
      try {
        page = await pdfDocument.getPage(1);
      } catch {
        return;
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      renderTaskRef.current?.cancel();

      const cssW = wrap.clientWidth;
      if (cssW < 8) return;

      const dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2.25);
      const pageBase = page.getViewport({ scale: 1 });
      const scale = (cssW * dpr) / pageBase.width;
      const viewport = page.getViewport({ scale });

      const w = Math.floor(viewport.width);
      const h = Math.floor(viewport.height);
      if (w < 1 || h < 1) return;

      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${h / dpr}px`;

      const task = page.render({ canvas, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch {
        // Cancelled by newer draw or teardown; next draw repaints.
      } finally {
        renderTaskRef.current = null;
      }
    };

    const debouncedDraw = debounce(draw, 72);

    (async () => {
      try {
        setBroken(false);
        await disposeDocument();

        const pdfDocument =
          await pdfjsLib.getDocument({ data: pdfData }).promise;
        if (cancelled) {
          await pdfDocument.destroy().catch(() => {});
          return;
        }

        pdfDocRef.current = pdfDocument;

        const wrap = wrapRef.current;
        if (wrap) {
          resizeObserver = new ResizeObserver(debouncedDraw);
          resizeObserver.observe(wrap);
        }

        await draw();
      } catch {
        if (!cancelled) setBroken(true);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      void disposeDocument();
    };
  }, [pdfData]);

  return (
    <div className="pdf-page-preview-root">
      <div className="pdf-page-preview-sheet" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="pdf-page-preview-canvas"
          aria-label="Letter preview—matches downloaded PDF"
        />
      </div>
      {broken ? (
        <p className="pdf-page-preview-error" role="alert">
          Preview could not be displayed. Try downloading the PDF instead.
        </p>
      ) : null}
    </div>
  );
}
