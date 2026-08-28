Executive report PDF export flow
=================================

The report system no longer uses a headless PDF exporter or the browser
print dialog. PDF generation happens entirely in the frontend.

Use the in-app report viewer instead:

- Generate a report from `/reports`
- Open the saved report from the archive or the report detail page
- Click the `Download PDF` button
- The frontend renders the report to canvas with `html2canvas` and builds
  the PDF client-side with `jsPDF`, then downloads it directly from the browser

This keeps the export flow simple, reliable, and fully client-side —
no backend rendering step is involved.
