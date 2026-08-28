export type SourceFamily = 'IMPORT' | 'DOCUMENT';

export interface SourceTypeDefinition {
  type: string;
  label: string;
  family: SourceFamily;
  requiresOAuth: boolean;
  provider: string;
}

export const SOURCE_TYPE_DEFINITIONS: SourceTypeDefinition[] = [
  { type: 'GOOGLE_DRIVE', label: 'Google Drive', family: 'IMPORT', requiresOAuth: false, provider: 'GOOGLE' },
  { type: 'EXCEL_UPLOAD', label: 'Excel Upload', family: 'IMPORT', requiresOAuth: false, provider: 'LOCAL' },
  { type: 'GMAIL', label: 'Gmail', family: 'IMPORT', requiresOAuth: true, provider: 'GOOGLE' },
  { type: 'ONEDRIVE', label: 'OneDrive', family: 'IMPORT', requiresOAuth: true, provider: 'MICROSOFT' },
  { type: 'SHAREPOINT', label: 'SharePoint', family: 'IMPORT', requiresOAuth: true, provider: 'MICROSOFT' },
  { type: 'OUTLOOK', label: 'Outlook', family: 'IMPORT', requiresOAuth: true, provider: 'MICROSOFT' },
  { type: 'GOOGLE_SHEETS', label: 'Google Sheets', family: 'IMPORT', requiresOAuth: false, provider: 'GOOGLE' },
  { type: 'POWERPOINT', label: 'PowerPoint', family: 'DOCUMENT', requiresOAuth: false, provider: 'MICROSOFT' },
  { type: 'WORD', label: 'Word', family: 'DOCUMENT', requiresOAuth: false, provider: 'MICROSOFT' },
  { type: 'PDF_DOC', label: 'PDF', family: 'DOCUMENT', requiresOAuth: false, provider: 'ADOBE' },
  { type: 'ONENOTE', label: 'OneNote', family: 'DOCUMENT', requiresOAuth: false, provider: 'MICROSOFT' },
];

export const SOURCE_TYPE_VALUES = SOURCE_TYPE_DEFINITIONS.map((entry) => entry.type);

export function isDocumentSourceType(type: string) {
  return SOURCE_TYPE_DEFINITIONS.some((entry) => entry.type === type && entry.family === 'DOCUMENT');
}

