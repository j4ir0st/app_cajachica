import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, FileText, ZoomIn } from 'lucide-react';
import { esArchivoPdf } from '../utils/archivoUtil';

/**
 * Modal universal para previsualizar comprobantes de gasto (Imágenes y PDFs).
 * Soporta archivos File/Blob locales y URLs remotas de SharePoint/Django.
 */
const ModalVisorComprobante = ({ archivo, onClose, titulo = 'Comprobante de Gasto' }) => {
  useEffect(() => {
    const manejarTecla = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [onClose]);

  if (!archivo) return null;

  const esObjetoFile = archivo instanceof File || archivo instanceof Blob;
  const urlArchivo = esObjetoFile ? URL.createObjectURL(archivo) : archivo;
  const esPdf = esArchivoPdf(archivo);
  const nombreArchivo = archivo?.name || (typeof archivo === 'string' ? archivo.split('/').pop()?.split('?')[0] : 'Comprobante');

  return createPortal(
    <div
      className="fixed inset-0 !m-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${esPdf ? 'max-w-4xl h-[90vh]' : 'max-w-3xl max-h-[90vh]'} bg-white rounded-3xl p-3 sm:p-4 shadow-2xl flex flex-col overflow-hidden animate-zoom-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Visor */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${esPdf ? 'bg-red-50 text-red-600' : 'bg-brand-light text-brand-primary'}`}>
              {esPdf ? <FileText size={18} /> : <ZoomIn size={18} />}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-brand-dark truncate">
                {titulo}
              </h3>
              <p className="text-[10px] text-gray-400 font-medium truncate">
                {nombreArchivo}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Botón para abrir en nueva pestaña / descargar */}
            <a
              href={urlArchivo}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-brand-light hover:text-brand-primary text-gray-700 text-xs font-bold transition-colors"
              title="Abrir en pestaña nueva"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Abrir en pestaña nueva</span>
            </a>

            {/* Botón Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              title="Cerrar visor"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido: PDF o Imagen */}
        <div className="flex-1 min-h-0 w-full flex items-center justify-center p-2 overflow-auto bg-gray-50/50 rounded-2xl mt-3">
          {esPdf ? (
            <div className="w-full h-full flex flex-col">
              <iframe
                src={`${urlArchivo}#toolbar=1`}
                title="Visor de Comprobante PDF"
                className="w-full h-full rounded-xl bg-white border border-gray-200 shadow-xs"
              />
              <p className="text-[11px] text-gray-400 text-center mt-2 shrink-0">
                ¿No visualiza el documento en su celular? Presione arriba en <strong>"Abrir en pestaña nueva"</strong>.
              </p>
            </div>
          ) : (
            <img
              src={urlArchivo}
              alt="Comprobante en alta resolución"
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-md"
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModalVisorComprobante;
