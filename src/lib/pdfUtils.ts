/**
 * AUTOVAULT ERP — PDF Export Utility Layer (Phase 2.9G HTML2PDF Isolation Redesign)
 * 
 * Creates a completely isolated export document inside an off-screen <iframe> context.
 * The isolated document contains:
 * - NO globals.css
 * - NO Tailwind runtime or @import "tailwindcss"
 * - NO application shell / dark mode
 * - Minimal plain CSS stylesheet with standard HEX/RGB colors ONLY
 * 
 * Prevents html2canvas from scanning document.styleSheets for OKLCH/OKLAB color rules.
 */

export interface PdfExportOptions {
  filename: string;
  isA5?: boolean;
}

export async function exportElementToPdf(
  elementId: string,
  options: PdfExportOptions
): Promise<void> {
  if (typeof window === "undefined") return;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Printable element #${elementId} not found.`);
  }

  const html2pdf = (await import("html2pdf.js")).default;
  const isA5 = !!options.isA5;

  // 1. Create an isolated hidden iframe container
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = isA5 ? "148mm" : "210mm";
  iframe.style.height = "1200px";
  iframe.style.border = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error("Failed to create isolated document context for PDF export.");
    }

    // 2. Clone the element's HTML structure
    const clone = element.cloneNode(true) as HTMLElement;

    // 3. Write a clean, isolated document into the iframe with plain CSS (HEX/RGB colors only)
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            /* ─────────────────────────────────────────────────────────────
               ISOLATED PLAIN CSS FOR PDF EXPORT (HEX / RGB COLORS ONLY)
               ───────────────────────────────────────────────────────────── */
            html, body {
              margin: 0;
              padding: 0;
              background-color: #ffffff !important;
              color: #0f172a !important;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              font-size: 11px;
              line-height: 1.35;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            *, *::before, *::after {
              box-sizing: border-box !important;
            }

            img {
              max-width: 100%;
              height: auto;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            /* Main Printable Container */
            #${elementId}, .printable-container {
              background-color: #ffffff !important;
              color: #0f172a !important;
              border: 4px double #0a121f !important;
              padding: ${isA5 ? "10px" : "16px"} !important;
              width: 100% !important;
              max-width: ${isA5 ? "148mm" : "210mm"} !important;
              margin: 0 auto !important;
              box-shadow: none !important;
              border-radius: 0px !important;
            }

            /* Layout utilities */
            .flex { display: flex !important; }
            .flex-col { display: flex !important; flex-direction: column !important; }
            .items-center { align-items: center !important; }
            .items-start { align-items: flex-start !important; }
            .items-end { align-items: flex-end !important; }
            .items-baseline { align-items: baseline !important; }
            .justify-between { justify-content: space-between !important; }
            .justify-center { justify-content: center !important; }
            .justify-end { justify-content: flex-end !important; }
            .flex-1 { flex: 1 1 0% !important; }
            .flex-wrap { flex-wrap: wrap !important; }
            .shrink-0 { flex-shrink: 0 !important; }

            /* Grid utilities */
            .grid { display: grid !important; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
            .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
            .grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)) !important; }
            .col-span-5 { grid-column: span 5 / span 5 !important; }
            .col-span-7 { grid-column: span 7 / span 7 !important; }

            /* Spacing utilities */
            .gap-1 { gap: 4px !important; }
            .gap-1\\.5 { gap: 6px !important; }
            .gap-2 { gap: 8px !important; }
            .gap-3 { gap: 12px !important; }
            .gap-4 { gap: 16px !important; }
            .gap-x-4 { column-gap: 16px !important; }
            .gap-y-1 { row-gap: 4px !important; }

            .p-0 { padding: 0px !important; }
            .p-1 { padding: 4px !important; }
            .p-2 { padding: 8px !important; }
            .p-2\\.5 { padding: 10px !important; }
            .p-3 { padding: 12px !important; }
            .p-4 { padding: 16px !important; }
            .p-5 { padding: 20px !important; }

            .py-0\\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
            .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
            .py-1\\.5 { padding-top: 6px !important; padding-bottom: 6px !important; }
            .py-2 { padding-top: 8px !important; padding-bottom: 8px !important; }

            .px-1 { padding-left: 4px !important; padding-right: 4px !important; }
            .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
            .px-2\\.5 { padding-left: 10px !important; padding-right: 10px !important; }
            .px-3 { padding-left: 12px !important; padding-right: 12px !important; }
            .px-4 { padding-left: 16px !important; padding-right: 16px !important; }

            .mb-0\\.5 { margin-bottom: 2px !important; }
            .mb-1 { margin-bottom: 4px !important; }
            .mb-1\\.5 { margin-bottom: 6px !important; }
            .mb-2 { margin-bottom: 8px !important; }
            .mb-3 { margin-bottom: 12px !important; }
            .mb-4 { margin-bottom: 16px !important; }

            .mt-0\\.5 { margin-top: 2px !important; }
            .mt-1 { margin-top: 4px !important; }
            .mt-1\\.5 { margin-top: 6px !important; }
            .mt-2 { margin-top: 8px !important; }
            .mt-3 { margin-top: 12px !important; }
            .mt-4 { margin-top: 16px !important; }

            .pb-0\\.5 { padding-bottom: 2px !important; }
            .pb-1 { padding-bottom: 4px !important; }
            .pb-1\\.5 { padding-bottom: 6px !important; }
            .pb-2 { padding-bottom: 8px !important; }
            .pb-3 { padding-bottom: 12px !important; }

            .pt-0\\.5 { padding-top: 2px !important; }
            .pt-1 { padding-top: 4px !important; }
            .pt-1\\.5 { padding-top: 6px !important; }
            .pt-2 { padding-top: 8px !important; }
            .pt-3 { padding-top: 12px !important; }

            /* Sizing */
            .w-full { width: 100% !important; }
            .w-10 { width: 40px !important; }
            .w-12 { width: 48px !important; }
            .w-14 { width: 56px !important; }
            .w-16 { width: 64px !important; }
            .w-24 { width: 96px !important; }
            .w-28 { width: 112px !important; }
            .w-32 { width: 128px !important; }
            .h-10 { height: 40px !important; }
            .h-14 { height: 56px !important; }

            /* Typography */
            .text-left { text-align: left !important; }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }

            .text-\\[8\\.5px\\] { font-size: 8.5px !important; }
            .text-\\[9px\\] { font-size: 9px !important; }
            .text-\\[10px\\] { font-size: 10px !important; }
            .text-\\[11px\\] { font-size: 11px !important; }
            .text-xs { font-size: 12px !important; }
            .text-sm { font-size: 14px !important; }
            .text-base { font-size: 16px !important; }
            .text-xl { font-size: 20px !important; }
            .text-2xl { font-size: 24px !important; }

            .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
            .font-sans { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; }

            .font-normal { font-weight: 400 !important; }
            .font-medium { font-weight: 500 !important; }
            .font-semibold { font-weight: 600 !important; }
            .font-bold { font-weight: 700 !important; }
            .font-extrabold { font-weight: 800 !important; }
            .font-black { font-weight: 900 !important; }

            .uppercase { text-transform: uppercase !important; }
            .italic { font-style: italic !important; }
            .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

            /* Borders */
            .border { border-width: 1px !important; border-style: solid !important; }
            .border-2 { border-width: 2px !important; border-style: solid !important; }
            .border-4 { border-width: 4px !important; border-style: solid !important; }
            .border-t { border-top-width: 1px !important; border-top-style: solid !important; }
            .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
            .border-r { border-right-width: 1px !important; border-right-style: solid !important; }
            .border-y { border-top-width: 1px !important; border-bottom-width: 1px !important; border-style: solid !important; }
            .border-dashed { border-style: dashed !important; }
            .border-double { border-style: double !important; }
            .rounded { border-radius: 4px !important; }
            .rounded-lg { border-radius: 8px !important; }
            .rounded-xl { border-radius: 12px !important; }

            /* STRICT HEX / RGB COLORS ONLY */
            .text-slate-400 { color: #94a3b8 !important; }
            .text-slate-500 { color: #64748b !important; }
            .text-slate-600 { color: #475569 !important; }
            .text-slate-700 { color: #334155 !important; }
            .text-slate-800 { color: #1e293b !important; }
            .text-slate-900 { color: #0f172a !important; }

            .text-navy-900 { color: #0f1a2e !important; }
            .text-navy-950 { color: #0a121f !important; }

            .text-red-500 { color: #ef4444 !important; }
            .text-red-600 { color: #dc2626 !important; }
            .text-red-700 { color: #b91c1c !important; }
            .text-red-800 { color: #991b1b !important; }

            .text-green-600 { color: #16a34a !important; }
            .text-green-700 { color: #15803d !important; }
            .text-green-800 { color: #166534 !important; }

            .text-emerald-700 { color: #047857 !important; }
            .text-purple-600 { color: #9333ea !important; }
            .text-purple-800 { color: #6b21a8 !important; }
            .text-blue-600 { color: #2563eb !important; }
            .text-blue-800 { color: #1e40af !important; }
            .text-orange-600 { color: #ea580c !important; }
            .text-orange-700 { color: #c2410c !important; }
            .text-orange-800 { color: #9a3412 !important; }
            .text-orange-900 { color: #7c2d12 !important; }

            .bg-white { background-color: #ffffff !important; }
            .bg-slate-50 { background-color: #f8fafc !important; }
            .bg-slate-50\\/70 { background-color: #f8fafc !important; }
            .bg-slate-100 { background-color: #f1f5f9 !important; }
            .bg-slate-100\\/80 { background-color: #f1f5f9 !important; }

            .bg-red-50 { background-color: #fef2f2 !important; }
            .bg-purple-50 { background-color: #faf5ff !important; }
            .bg-orange-50 { background-color: #fff7ed !important; }
            .bg-orange-50\\/50 { background-color: #fff7ed !important; }

            .border-slate-100 { border-color: #f1f5f9 !important; }
            .border-slate-200 { border-color: #e2e8f0 !important; }
            .border-slate-200\\/80 { border-color: #e2e8f0 !important; }
            .border-slate-300 { border-color: #cbd5e1 !important; }
            .border-slate-400 { border-color: #94a3b8 !important; }

            .border-navy-950 { border-color: #0a121f !important; }
            .border-red-500 { border-color: #ef4444 !important; }
            .border-red-600 { border-color: #dc2626 !important; }
            .border-purple-600 { border-color: #9333ea !important; }
            .border-orange-400 { border-color: #fb923c !important; }
            .border-orange-500 { border-color: #f97316 !important; }
            .border-orange-200 { border-color: #fed7aa !important; }

            /* Print responsive utilities */
            .print\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .print\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
            .print\\:grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)) !important; }
            .print\\:col-span-5 { grid-column: span 5 / span 5 !important; }
            .print\\:col-span-7 { grid-column: span 7 / span 7 !important; }
            .print\\:bg-white { background-color: #ffffff !important; }
            .print\\:bg-slate-50 { background-color: #f8fafc !important; }
            .print\\:border-none { border: none !important; }
            .print\\:p-0 { padding: 0px !important; }
            .print\\:mb-2 { margin-bottom: 8px !important; }
            .print\\:border-b-0 { border-bottom: none !important; }
          </style>
        </head>
        <body>
          <div id="isolated-pdf-target"></div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // 4. Move cloned HTML element into isolated target
    const target = iframeDoc.getElementById("isolated-pdf-target");
    if (!target) {
      throw new Error("Failed to initialize target element inside isolated document.");
    }
    target.appendChild(clone);

    // 5. Convert any remaining computed OKLCH/OKLAB colors on cloned elements inside isolated iframe to sRGB hex
    const allElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
    const iframeWin = iframe.contentWindow || window;

    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorCtx = colorCanvas.getContext("2d");

    const toHexRgb = (colStr: string): string => {
      if (!colStr || typeof colStr !== "string") return colStr;
      if (!colStr.includes("oklch") && !colStr.includes("oklab") && !colStr.includes("color(")) {
        return colStr;
      }
      if (!colorCtx) return colStr;
      try {
        colorCtx.fillStyle = "rgba(0, 0, 0, 0)";
        colorCtx.fillStyle = colStr;
        const res = colorCtx.fillStyle;
        return res && !res.includes("oklch") && !res.includes("oklab") ? res : colStr;
      } catch {
        return colStr;
      }
    };

    allElements.forEach((el) => {
      const computed = iframeWin.getComputedStyle(el);
      const props = [
        "color",
        "backgroundColor",
        "borderColor",
        "borderTopColor",
        "borderBottomColor",
        "borderLeftColor",
        "borderRightColor",
        "outlineColor",
      ] as const;

      props.forEach((p) => {
        const val = computed[p];
        if (val && (val.includes("oklch") || val.includes("oklab") || val.includes("color("))) {
          const hex = toHexRgb(val);
          if (hex) {
            el.style[p] = hex;
          }
        }
      });
    });

    const opt = {
      margin: isA5 ? 6 : 8,
      filename: options.filename,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: {
        unit: "mm",
        format: isA5 ? "a5" : "a4",
        orientation: "portrait" as const,
      },
    };

    // 6. Execute html2pdf strictly on the isolated element inside iframeDoc!
    await html2pdf().set(opt).from(clone).save();
  } finally {
    // 7. Destroy temporary isolated iframe container completely
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}
