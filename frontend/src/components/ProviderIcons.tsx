import type { SVGProps } from 'react';
import type { SourceType } from '../types';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" {...props} />;
}

export function GoogleDriveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polygon points="8.2,4 15.8,4 22,14.7 14.4,14.7" fill="#4285F4" />
      <polygon points="8.2,4 2,14.7 5.8,21 12,10.3" fill="#0F9D58" />
      <polygon points="15.8,4 12,10.3 18.2,21 22,14.7" fill="#F4B400" />
      <polygon points="5.8,21 12,10.3 18.2,21" fill="#1A73E8" opacity="0.92" />
    </BaseIcon>
  );
}

export function ExcelUploadIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path
        d="M6 3.5h7.3L18.5 8v12.5A1.5 1.5 0 0 1 17 22H6A1.5 1.5 0 0 1 4.5 20.5v-15A2 2 0 0 1 6 3.5Z"
        fill="#1D6F42"
      />
      <path d="M13.3 3.5V8H18.5" fill="#A7F3D0" opacity="0.95" />
      <path
        d="M6.4 8.8h10.9v10.9a1 1 0 0 1-1 1H7.4a1 1 0 0 1-1-1V8.8Z"
        fill="#F3FFF8"
      />
      <path d="M13.3 3.5V8h5.2" fill="none" stroke="#D1FAE5" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M8 10.4h2.1l1.3 2.2 1.4-2.2H15l-2.4 3.7 2.5 3.8h-2.1l-1.4-2.3-1.4 2.3H8l2.5-3.8-2.5-3.7Z" fill="#1D6F42" />
      <path d="M8 15.1h7.1v1.1H8z" fill="#D1FAE5" opacity="0.9" />
    </BaseIcon>
  );
}

export function GmailIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" fill="#FFFFFF" stroke="#EA4335" strokeWidth="1.6" />
      <path d="M4.8 7.2 12 12.7l7.2-5.5" fill="none" stroke="#EA4335" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4.8 17.2V8.2L12 13.7l7.2-5.5v9" fill="none" stroke="#EA4335" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5.1 7.4 12 12.6l6.9-5.2" fill="none" stroke="#EA4335" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function MicrosoftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.3" fill="#F25022" />
      <rect x="13" y="4" width="7" height="7" rx="1.3" fill="#7FBA00" />
      <rect x="4" y="13" width="7" height="7" rx="1.3" fill="#00A4EF" />
      <rect x="13" y="13" width="7" height="7" rx="1.3" fill="#FFB900" />
    </BaseIcon>
  );
}

export function OneDriveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8.2 14.4a4.2 4.2 0 0 1 7.6-2.1A3.7 3.7 0 0 1 19 16.1a3.2 3.2 0 0 1-3.2 3.2H8.2a3.2 3.2 0 0 1 0-6.4Z" fill="#0078D4" />
      <path d="M8.3 14.2 12 11.9l2.4 1.2 1.3 1.3-2.2 1.1-1.7-.5-1.9.8-1.6-.6Z" fill="#2B88D8" opacity="0.95" />
    </BaseIcon>
  );
}

export function SharePointIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="12" r="4.7" fill="#0F6CBD" />
      <circle cx="14.5" cy="10" r="5.3" fill="#2B88D8" opacity="0.9" />
      <circle cx="14.5" cy="15" r="4.3" fill="#084C8D" opacity="0.9" />
      <path d="M8.1 12.3h8.4" stroke="#E6F3FF" strokeWidth="1.3" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OutlookIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="5" width="8" height="14" rx="1.5" fill="#0078D4" />
      <path d="M12 7h8v10h-8z" fill="#DDF0FF" />
      <path d="m6 10 3 2 3-2" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 9.2h5M13.5 12h5M13.5 14.8h4" stroke="#0078D4" strokeWidth="1.2" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function GoogleSheetsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 3.5h7.3L18.5 8v12.5A1.5 1.5 0 0 1 17 22H6A1.5 1.5 0 0 1 4.5 20.5v-15A2 2 0 0 1 6 3.5Z" fill="#188038" />
      <path d="M13.3 3.5V8H18.5" fill="#C8E6C9" opacity="0.95" />
      <rect x="7.2" y="9.3" width="9.6" height="9.6" rx="0.9" fill="#F5FFF7" />
      <path d="M7.2 12.5h9.6M10.4 9.3v9.6M13.6 9.3v9.6" stroke="#188038" strokeWidth="0.9" />
    </BaseIcon>
  );
}

export function PowerPointIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" fill="#D24726" />
      <path d="M8 8h4.5a3 3 0 0 1 0 6H8z" fill="#FFF2ED" opacity="0.95" />
      <path d="M8 13h5.5a2.5 2.5 0 0 0 0-5H8z" fill="#B93E22" opacity="0.95" />
      <path d="M8 17h8" stroke="#FFF2ED" strokeWidth="1.2" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function WordIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" fill="#2B579A" />
      <path d="M7.2 8.2 9 15.8l2-4.3 1.8 4.3 1.8-7.6" fill="none" stroke="#F3F8FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 17h9.2" stroke="#CFE0FF" strokeWidth="1.2" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function PdfIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" fill="#D32F2F" />
      <path d="M8 8.2h2.5a1.8 1.8 0 0 1 0 3.6H8z" fill="#FFECEC" />
      <path d="M12 8.2h3.2v1.4H12zm0 3.6h2.6v1.4H12zm0 3.6h3.2v1.4H12z" fill="#FFECEC" opacity="0.95" />
    </BaseIcon>
  );
}

export function OneNoteIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" fill="#7719AA" />
      <path d="M7.5 8.2h4.2l2.8 4.1V8.2h1.9v7.6h-1.9l-4.5-4.5v4.5H7.5z" fill="#F5E8FF" />
    </BaseIcon>
  );
}

export function ProviderIcon({ type, ...props }: { type: SourceType; className?: string } & IconProps) {
  switch (type) {
    case 'GOOGLE_DRIVE':
      return <GoogleDriveIcon {...props} />;
    case 'EXCEL_UPLOAD':
      return <ExcelUploadIcon {...props} />;
    case 'GMAIL':
      return <GmailIcon {...props} />;
    case 'ONEDRIVE':
      return <OneDriveIcon {...props} />;
    case 'SHAREPOINT':
      return <SharePointIcon {...props} />;
    case 'OUTLOOK':
      return <OutlookIcon {...props} />;
    case 'GOOGLE_SHEETS':
      return <GoogleSheetsIcon {...props} />;
    case 'POWERPOINT':
      return <PowerPointIcon {...props} />;
    case 'WORD':
      return <WordIcon {...props} />;
    case 'PDF_DOC':
      return <PdfIcon {...props} />;
    case 'ONENOTE':
      return <OneNoteIcon {...props} />;
    default:
      return null;
  }
}
