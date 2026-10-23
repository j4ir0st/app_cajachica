/**
 * archivoUtil.js
 * Utilidades para detección y manejo de archivos adjuntos (imágenes y PDFs).
 */

export const esArchivoPdf = (adj, preview = null) => {
  if (!adj && !preview) return false;

  if (adj instanceof File || adj instanceof Blob) {
    if (adj.type === 'application/pdf') return true;
    if (adj.name && adj.name.toLowerCase().endsWith('.pdf')) return true;
  }

  if (typeof adj === 'string') {
    const urlLimpia = adj.toLowerCase().split('?')[0];
    if (urlLimpia.endsWith('.pdf') || urlLimpia.includes('.pdf')) return true;
  }

  if (typeof preview === 'string') {
    const urlLimpia = preview.toLowerCase().split('?')[0];
    if (urlLimpia.endsWith('.pdf') || urlLimpia.includes('.pdf')) return true;
  }

  return false;
};
