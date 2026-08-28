export type SourceFamily = 'IMPORT' | 'DOCUMENT';

export interface SourceTypeDefinition {
  type: string;
  label: string;
  family: SourceFamily;
  requiresOAuth: boolean;
  provider: string;
  description: string;
  color: string;
}

export const SOURCE_TYPE_DEFINITIONS: SourceTypeDefinition[] = [
  { type: 'GOOGLE_DRIVE', label: 'Google Drive', family: 'IMPORT', requiresOAuth: false, provider: 'GOOGLE', description: 'Connect a Drive file or folder and import Excel/CSV data.', color: '#4285F4' },
  { type: 'EXCEL_UPLOAD', label: 'Excel Upload', family: 'IMPORT', requiresOAuth: false, provider: 'LOCAL', description: 'Upload a spreadsheet directly for preview and import.', color: '#1D6F42' },
  { type: 'GMAIL', label: 'Gmail', family: 'IMPORT', requiresOAuth: true, provider: 'GOOGLE', description: 'Import Excel/CSV attachments from Gmail messages.', color: '#EA4335' },
  { type: 'ONEDRIVE', label: 'OneDrive', family: 'IMPORT', requiresOAuth: true, provider: 'MICROSOFT', description: 'Use Microsoft Graph to import a shared OneDrive file.', color: '#0078D4' },
  { type: 'SHAREPOINT', label: 'SharePoint', family: 'IMPORT', requiresOAuth: true, provider: 'MICROSOFT', description: 'Read a spreadsheet from a SharePoint library via Graph.', color: '#0F6CBD' },
  { type: 'OUTLOOK', label: 'Outlook', family: 'IMPORT', requiresOAuth: true, provider: 'MICROSOFT', description: 'Pull Excel/CSV attachments from Outlook mail.', color: '#0078D4' },
  { type: 'GOOGLE_SHEETS', label: 'Google Sheets', family: 'IMPORT', requiresOAuth: false, provider: 'GOOGLE', description: 'Export a Google Sheet to XLSX and import it.', color: '#34A853' },
  { type: 'POWERPOINT', label: 'PowerPoint', family: 'DOCUMENT', requiresOAuth: false, provider: 'MICROSOFT', description: 'Register a presentation reference for AI analysis.', color: '#D24726' },
  { type: 'WORD', label: 'Word', family: 'DOCUMENT', requiresOAuth: false, provider: 'MICROSOFT', description: 'Register a Word document reference for AI analysis.', color: '#2B579A' },
  { type: 'PDF_DOC', label: 'PDF', family: 'DOCUMENT', requiresOAuth: false, provider: 'ADOBE', description: 'Register a PDF reference for AI analysis.', color: '#D32F2F' },
  { type: 'ONENOTE', label: 'OneNote', family: 'DOCUMENT', requiresOAuth: false, provider: 'MICROSOFT', description: 'Register a OneNote reference for AI analysis.', color: '#7719AA' },
];

export const IMPORT_SOURCE_TYPE_DEFINITIONS = SOURCE_TYPE_DEFINITIONS.filter((entry) => entry.family === 'IMPORT');
export const DOCUMENT_SOURCE_TYPE_DEFINITIONS = SOURCE_TYPE_DEFINITIONS.filter((entry) => entry.family === 'DOCUMENT');
