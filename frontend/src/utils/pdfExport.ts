/**
 * Exports a rendered report element to a downloadable PDF that matches the
 * on-screen version as closely as possible (WYSIWYG), without opening the
 * browser print dialog.
 *
 * Strategy
 * --------
 * The report markup (see ExecutiveReport.tsx) is a flat sequence of
 * top-level blocks under `.report-document`: the cover header, one
 * `<section class="report-section-pro">` per report section, and the
 * footer. Those blocks already carry the intended pagination hints
 * (`report-page-break` / `report-page-break-before`) used previously for
 * `@media print`.
 *
 * Each block is rasterized to its own canvas and placed on the PDF as a
 * whole image. Blocks are packed onto a page while they fit; a block is
 * NEVER split across a page boundary — if it doesn't fit in the remaining
 * space, it moves to a fresh page instead. This is what prevents cards,
 * tables, and KPI grids from being cut between pages.
 *
 * `foreignObjectRendering: true` is used so html2canvas hands the actual
 * painting off to the browser's native SVG+HTML pipeline instead of its
 * own manual text-layout engine. That's what preserves correct Arabic
 * letter shaping/joining and RTL layout, colors, fonts, and inline SVG
 * charts in the exported PDF.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const RENDER_OPTIONS = {
    scale: Math.max(2, window.devicePixelRatio || 1),
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    imageTimeout: 15000,
    logging: false,
} as const;

/**
 * Samples a grid of pixels to detect a canvas that rasterized to nothing
 * but background color. This happens when html2canvas's
 * `foreignObjectRendering: true` path silently fails to embed a resource
 * (historically: cross-origin webfonts) instead of throwing — the capture
 * "succeeds" with the right dimensions but no actual painted content.
 */
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return true;

    const cols = 12;
    const rows = 12;
    try {
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = Math.min(canvas.width - 1, Math.floor((canvas.width / cols) * i));
                const y = Math.min(canvas.height - 1, Math.floor((canvas.height / rows) * j));
                const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
                const isWhite = r > 250 && g > 250 && b > 250;
                const isTransparent = a === 0;
                if (!isWhite && !isTransparent) return false;
            }
        }
        return true;
    } catch {
        // Tainted canvas (cross-origin image somewhere) — can't sample pixels,
        // so we can't confirm it's blank. Assume it's fine rather than looping.
        return false;
    }
}

async function renderBlockToCanvas(
    html2canvas: typeof import('html2canvas').default,
    block: HTMLElement,
): Promise<HTMLCanvasElement> {
    const primary = await html2canvas(block, { ...RENDER_OPTIONS, foreignObjectRendering: true });
    if (!isCanvasBlank(primary)) return primary;

    // Fallback: html2canvas's manual DOM-to-canvas renderer. Slightly less
    // faithful Arabic letter joining than a correctly-working
    // foreignObjectRendering pass, but real content beats a blank page.
    return html2canvas(block, { ...RENDER_OPTIONS, foreignObjectRendering: false });
}

/** Slices an oversized canvas (taller than one page even on its own, e.g. a
 * very long table) into page-height strips. Used only as a fallback — the
 * normal path never needs to cut a block. */
function addSlicedImage(pdf: import('jspdf').jsPDF, canvas: HTMLCanvasElement, pageWidthMm: number, pageHeightMm: number) {
    const pxPerMm = canvas.width / pageWidthMm;
    const sliceHeightPx = Math.max(1, Math.floor(pageHeightMm * pxPerMm));
    let renderedPx = 0;
    let first = true;

    while (renderedPx < canvas.height) {
        const sliceHeightSrc = Math.min(sliceHeightPx, canvas.height - renderedPx);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightSrc;
        const ctx = sliceCanvas.getContext('2d');
        if (!ctx) break;
        ctx.drawImage(
            canvas,
            0, renderedPx, canvas.width, sliceHeightSrc,
            0, 0, canvas.width, sliceHeightSrc
        );

        if (!first) pdf.addPage();
        first = false;

        const sliceHeightMm = sliceHeightSrc / pxPerMm;
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidthMm, sliceHeightMm, undefined, 'FAST');

        renderedPx += sliceHeightSrc;
    }
}

export async function exportReportToPdf(elementId: string, filename: string): Promise<void> {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
    ]);

    const root = document.getElementById(elementId);
    if (!root) {
        throw new Error(`Element #${elementId} not found`);
    }

    const article = (root.querySelector('.report-document') as HTMLElement | null) ?? root;
    const blocks = Array.from(article.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement
    );

    if (blocks.length === 0) {
        throw new Error('No report content to export');
    }

    // Make sure webfonts (including the icon font) are loaded before
    // rasterizing, otherwise icons/Arabic text can capture with fallback glyphs.
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidthMm = pdf.internal.pageSize.getWidth() || A4_WIDTH_MM;
    const pageHeightMm = pdf.internal.pageSize.getHeight() || A4_HEIGHT_MM;

    let cursorYMm = 0;
    let hasContentOnPage = false;

    const startNewPage = () => {
        pdf.addPage();
        cursorYMm = 0;
        hasContentOnPage = false;
    };

    for (const block of blocks) {
        const style = window.getComputedStyle(block);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const forcesPageBefore = block.classList.contains('report-page-break-before');
        if (forcesPageBefore && hasContentOnPage) {
            startNewPage();
        }

        const canvas = await renderBlockToCanvas(html2canvas, block);
        const imgWidthMm = pageWidthMm;
        const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

        if (imgHeightMm > pageHeightMm) {
            // Block alone is taller than a full page — cannot avoid slicing it,
            // but this only happens for unusually long content (e.g. dozens of
            // table rows), not normal cards/sections.
            if (hasContentOnPage) startNewPage();
            addSlicedImage(pdf, canvas, pageWidthMm, pageHeightMm);
            hasContentOnPage = true;
            cursorYMm = pageHeightMm; // force the next block onto a fresh page
            continue;
        }

        if (hasContentOnPage && cursorYMm + imgHeightMm > pageHeightMm) {
            startNewPage();
        }

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, cursorYMm, imgWidthMm, imgHeightMm, undefined, 'FAST');
        cursorYMm += imgHeightMm;
        hasContentOnPage = true;

        if (block.classList.contains('report-page-break')) {
            startNewPage();
        }
    }

    // If the loop's last action was a forced page break (e.g. the final
    // block carries `report-page-break`), a trailing blank page exists.
    // Drop it rather than shipping an empty last page.
    const totalPages = pdf.getNumberOfPages();
    if (!hasContentOnPage && totalPages > 1) {
        pdf.deletePage(totalPages);
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
