import { useEffect, useMemo, useState } from 'react';
import { SourceType } from '../types';
import { ImportService, SourcesService } from '../services/api';
import { useToast } from './ui/Toast';
import { ProviderIcon } from './ProviderIcons';
import { IMPORT_SOURCE_TYPE_DEFINITIONS } from '../constants/sourceTypes';

interface DataSourceConnectorProps {
  module: string;
  defaultModuleName?: string;
  schoolId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PROVIDERS = IMPORT_SOURCE_TYPE_DEFINITIONS;

const DATASET_OPTIONS = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'housing', label: 'Housing' },
  { value: 'complaints', label: 'Complaints' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'staff_modules', label: 'Staff Modules' },
  { value: 'schools', label: 'Schools' },
  { value: 'kpi_snapshots', label: 'KPI Snapshots' },
];

const OUTLOOK_ATTACHMENT_TYPES = ['.xlsx', '.xls', '.csv'] as const;

const MICROSOFT_SOURCE_TYPES = new Set(['ONEDRIVE', 'SHAREPOINT', 'OUTLOOK']);
const GOOGLE_SOURCE_TYPES = new Set(['GOOGLE_DRIVE', 'GOOGLE_SHEETS']);

export function DataSourceConnector({
  module,
  defaultModuleName,
  schoolId,
  isOpen,
  onClose,
  onSuccess,
}: DataSourceConnectorProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedProvider, setSelectedProvider] = useState<SourceType>('GOOGLE_DRIVE');
  const [sourceName, setSourceName] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [datasetType, setDatasetType] = useState('attendance');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [excelUploadId, setExcelUploadId] = useState<string | null>(null);
  const [excelPreview, setExcelPreview] = useState<any | null>(null);
  const [gmailLabel, setGmailLabel] = useState('');
  const [gmailSender, setGmailSender] = useState('');
  const [gmailSubject, setGmailSubject] = useState('');
  const [gmailDateFrom, setGmailDateFrom] = useState('');
  const [gmailDateTo, setGmailDateTo] = useState('');
  const [gmailAttachmentOnly, setGmailAttachmentOnly] = useState(true);
  const [gmailAttachmentTypes, setGmailAttachmentTypes] = useState<Array<'.xlsx' | '.xls' | '.csv'>>(['.xlsx', '.xls', '.csv']);
  const [outlookSender, setOutlookSender] = useState('');
  const [outlookSubject, setOutlookSubject] = useState('');
  const [outlookDateFrom, setOutlookDateFrom] = useState('');
  const [outlookDateTo, setOutlookDateTo] = useState('');
  const [outlookAttachmentOnly, setOutlookAttachmentOnly] = useState(true);
  const [outlookAttachmentTypes, setOutlookAttachmentTypes] = useState<Array<'.xlsx' | '.xls' | '.csv'>>(['.xlsx', '.xls', '.csv']);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGlobalConfirmed, setIsGlobalConfirmed] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'failed'>('idle');

  const currentProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.type === selectedProvider) || PROVIDERS[0],
    [selectedProvider],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'microsoft-oauth-complete') return;

      if (event.data.status === 'connected') {
        showToast('Microsoft connection completed successfully.', 'success');
      } else {
        showToast(event.data.message || 'Microsoft connection failed.', 'error');
      }

      onSuccess();
      resetAndClose();
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuccess, showToast]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setStep(1);
    setTestResult('idle');
    setSourceName('');
    setExternalUrl('');
    setDatasetType('attendance');
    setSelectedFile(null);
    setExcelUploadId(null);
    setExcelPreview(null);
    setGmailLabel('');
    setGmailSender('');
    setGmailSubject('');
    setGmailDateFrom('');
    setGmailDateTo('');
    setGmailAttachmentOnly(true);
    setGmailAttachmentTypes(['.xlsx', '.xls', '.csv']);
    setOutlookSender('');
    setOutlookSubject('');
    setOutlookDateFrom('');
    setOutlookDateTo('');
    setOutlookAttachmentOnly(true);
    setOutlookAttachmentTypes(['.xlsx', '.xls', '.csv']);
    setIsGlobalConfirmed(false);
    onClose();
  };

  const ensureSourceName = () => {
    const fallback = `${currentProvider.label} - ${module}`;
    const value = sourceName.trim() || fallback;
    setSourceName(value);
    return value;
  };

  const isGoogleFlow = GOOGLE_SOURCE_TYPES.has(selectedProvider);
  const isMicrosoftFlow = MICROSOFT_SOURCE_TYPES.has(selectedProvider);

  const handleGoogleTest = async () => {
    if (!externalUrl.trim()) {
      showToast(`Please enter a ${selectedProvider === 'GOOGLE_SHEETS' ? 'Google Sheets' : 'Google Drive'} URL.`, 'warning');
      return;
    }

    setTesting(true);
    setTestResult('idle');
    try {
      await SourcesService.testConnection({
        type: selectedProvider === 'GOOGLE_SHEETS' ? 'GOOGLE_SHEETS' : 'GOOGLE_DRIVE',
        externalUrl: externalUrl.trim(),
      });
      setTestResult('success');
      setStep(4);
      showToast(`${currentProvider.label} connection verified successfully.`, 'success');
    } catch (error: any) {
      setTestResult('failed');
      showToast(error.response?.data?.message || `${currentProvider.label} connection test failed.`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleExcelPreview = async () => {
    if (!selectedFile) {
      showToast('Please choose an Excel or CSV file.', 'warning');
      return;
    }

    setPreviewing(true);
    try {
      const preview = await ImportService.previewExcelUpload(selectedFile, datasetType);
      setExcelUploadId(preview.uploadId);
      setExcelPreview(preview.preview);
      setStep(4);
      showToast('File uploaded and preview generated.', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to preview the uploaded file.', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleExcelImport = async () => {
    if (!excelUploadId) {
      showToast('Please upload and preview a file first.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const result = await ImportService.importExcelUpload({
        uploadId: excelUploadId,
        datasetType,
        sourceName: ensureSourceName(),
        module,
        schoolId: schoolId || undefined,
        mapping: excelPreview?.mappedHeaders,
      });

      setExcelPreview((current: any) => ({ ...current, result }));
      setStep(5);
      showToast('Excel upload imported successfully.', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to import the uploaded file.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const buildMicrosoftConfig = () => {
    if (selectedProvider === 'OUTLOOK') {
      return {
        sender: outlookSender || undefined,
        subject: outlookSubject || undefined,
        dateFrom: outlookDateFrom || undefined,
        dateTo: outlookDateTo || undefined,
        attachmentOnly: outlookAttachmentOnly,
        attachmentTypes: outlookAttachmentTypes.join(','),
      };
    }

    return {
      externalUrl: externalUrl || undefined,
    };
  };

  const openMicrosoftAuthPopup = async () => {
    setSaving(true);
    try {
      const source = await SourcesService.create({
        name: ensureSourceName(),
        type: selectedProvider,
        provider: selectedProvider,
        module,
        schoolId: schoolId || undefined,
        externalUrl: selectedProvider === 'OUTLOOK' ? undefined : externalUrl || undefined,
        connectionConfig: buildMicrosoftConfig(),
      });

      const auth = await SourcesService.startMicrosoftAuth(source.id);
      const popup = window.open(auth.authUrl, 'microsoft-oauth', 'width=650,height=780');
      if (!popup) {
        window.location.href = auth.authUrl;
      }

      setStep(4);
      showToast('Microsoft OAuth window opened.', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to start Microsoft connection.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGmailConnect = async () => {
    setSaving(true);
    try {
      const source = await SourcesService.create({
        name: ensureSourceName(),
        type: 'GMAIL',
        provider: 'GMAIL',
        module,
        schoolId: schoolId || undefined,
        connectionConfig: {
          label: gmailLabel || undefined,
          sender: gmailSender || undefined,
          subject: gmailSubject || undefined,
          dateFrom: gmailDateFrom || undefined,
          dateTo: gmailDateTo || undefined,
          attachmentOnly: gmailAttachmentOnly,
          attachmentTypes: gmailAttachmentTypes.join(','),
        },
      });

      const auth = await SourcesService.startGmailAuth(source.id);
      window.location.href = auth.authUrl;
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to start Gmail connection.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGoogleReference = async () => {
    setSaving(true);
    try {
      await SourcesService.create({
        name: ensureSourceName(),
        type: selectedProvider,
        provider: selectedProvider,
        module,
        externalUrl: externalUrl || undefined,
        schoolId: schoolId || undefined,
        connectionConfig: {
          sourceKind: selectedProvider,
          externalUrl: externalUrl || undefined,
          liveTested: testResult === 'success',
        },
      });
      setStep(5);
      showToast(`${currentProvider.label} connection saved.`, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || `Failed to save the ${currentProvider.label} source.`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderGoogleConfigure = () => (
    <>
      <label>{selectedProvider === 'GOOGLE_SHEETS' ? 'Google Sheet URL' : 'Google Drive folder or file URL'}</label>
      <input
        type="url"
        className="form-control"
        value={externalUrl}
        onChange={(e) => setExternalUrl(e.target.value)}
        placeholder={selectedProvider === 'GOOGLE_SHEETS' ? 'https://docs.google.com/spreadsheets/...' : 'https://drive.google.com/file/d/...'}
      />
      <small className="form-help">
        {selectedProvider === 'GOOGLE_SHEETS'
          ? 'The backend exports the sheet to XLSX before parsing it.'
          : 'The backend reads the file server-side using the configured Google service account.'}
      </small>
    </>
  );

  const renderMicrosoftDriveConfigure = () => (
    <>
      <label>Microsoft shared link</label>
      <input
        type="url"
        className="form-control"
        value={externalUrl}
        onChange={(e) => setExternalUrl(e.target.value)}
        placeholder="https://1drv.ms/..."
      />
      <small className="form-help">
        Use a OneDrive or SharePoint shared link. Microsoft OAuth will be completed in the next step.
      </small>
    </>
  );

  const renderOutlookConfigure = () => (
    <>
      <label>Sender filter</label>
      <input
        type="email"
        className="form-control"
        value={outlookSender}
        onChange={(e) => setOutlookSender(e.target.value)}
        placeholder="reports@example.com"
      />

      <label>Subject filter</label>
      <input
        type="text"
        className="form-control"
        value={outlookSubject}
        onChange={(e) => setOutlookSubject(e.target.value)}
        placeholder="attendance"
      />

      <div className="provider-select-row">
        <div>
          <label>From date</label>
          <input
            type="date"
            className="form-control"
            value={outlookDateFrom}
            onChange={(e) => setOutlookDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label>To date</label>
          <input
            type="date"
            className="form-control"
            value={outlookDateTo}
            onChange={(e) => setOutlookDateTo(e.target.value)}
          />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          checked={outlookAttachmentOnly}
          onChange={(e) => setOutlookAttachmentOnly(e.target.checked)}
        />
        Attachment-only mode
      </label>

      <div className="provider-select-row">
        {OUTLOOK_ATTACHMENT_TYPES.map((type) => (
          <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={outlookAttachmentTypes.includes(type)}
              onChange={(e) => {
                setOutlookAttachmentTypes((current) =>
                  e.target.checked ? Array.from(new Set([...current, type])) : current.filter((item) => item !== type)
                );
              }}
            />
            {type}
          </label>
        ))}
      </div>

      <small className="form-help">
        Outlook uses Microsoft Graph and only requests read-only mail access.
      </small>
    </>
  );

  const renderStepThreeTitle = () => {
    if (selectedProvider === 'EXCEL_UPLOAD') return 'Upload and preview';
    if (isMicrosoftFlow) return 'Connect with Microsoft';
    if (selectedProvider === 'GMAIL') return 'Connect Gmail';
    return `Verify ${currentProvider.label}`;
  };

  const renderStepThreeBody = () => {
    if (selectedProvider === 'EXCEL_UPLOAD') {
      return 'Upload the actual file to the backend so it can be parsed and previewed.';
    }
    if (isMicrosoftFlow) {
      return 'A Microsoft sign-in window will open. Finish the authorization there, then return here.';
    }
    if (selectedProvider === 'GMAIL') {
      return 'Google will verify the OAuth connection before Gmail access is saved.';
    }
    return `The backend will verify access to the ${currentProvider.label} file or folder.`;
  };

  const renderStepFourSummary = () => (
    <div className="connection-summary-box">
      <div className="alert alert-success">
        <i className="fa-solid fa-circle-check" />
        <span>
          {selectedProvider === 'EXCEL_UPLOAD'
            ? 'File preview generated. Review it before importing.'
            : selectedProvider === 'GMAIL'
              ? 'Gmail connection will open Google OAuth and finish on the backend callback.'
              : isMicrosoftFlow
                ? 'Microsoft authorization will complete in the popup and close automatically.'
                : `${currentProvider.label} connection verified successfully.`}
        </span>
      </div>

      <div className="meta-list">
        <div className="meta-item">
          <strong>Source name:</strong> <span>{sourceName || `${currentProvider.label} - ${module}`}</span>
        </div>
        <div className="meta-item">
          <strong>Provider:</strong> <span>{currentProvider.label}</span>
        </div>
        <div className="meta-item">
          <strong>Module:</strong> <span>{module}</span>
        </div>
        <div className="meta-item">
          <strong>School scope:</strong> <span>{schoolId || 'Global'}</span>
        </div>
        {selectedProvider === 'EXCEL_UPLOAD' && selectedFile && (
          <div className="meta-item">
            <strong>File:</strong> <span>{selectedFile.name}</span>
          </div>
        )}
        {selectedProvider === 'GMAIL' && (
          <div className="meta-item">
            <strong>Query:</strong>{' '}
            <span>
              {[gmailLabel && `label:${gmailLabel}`, gmailSender && `from:${gmailSender}`, gmailSubject && `subject:${gmailSubject}`]
                .filter(Boolean)
                .join(' ') || 'Default Gmail search'}
            </span>
          </div>
        )}
        {selectedProvider === 'OUTLOOK' && (
          <div className="meta-item">
            <strong>Query:</strong>{' '}
            <span>
              {[outlookSender && `from:${outlookSender}`, outlookSubject && `subject:${outlookSubject}`]
                .filter(Boolean)
                .join(' ') || 'Default Outlook search'}
            </span>
          </div>
        )}
      </div>

      {selectedProvider === 'EXCEL_UPLOAD' && excelPreview && (
        <div className="card mt-3 p-3">
          <h4 className="mb-2">Preview</h4>
          <div className="text-xs mb-2">
            <strong>File:</strong> {excelPreview.fileName}
            <br />
            <strong>Rows:</strong> {excelPreview.rowCount}
            <br />
            <strong>Mapped headers:</strong> {Object.keys(excelPreview.mappedHeaders || {}).length}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', maxHeight: '280px', overflow: 'auto' }}>
            {JSON.stringify(
              {
                headers: excelPreview.headers,
                mappedHeaders: excelPreview.mappedHeaders,
                sampleRows: excelPreview.sampleRows,
                errors: excelPreview.errors,
                result: excelPreview.result || null,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={resetAndClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <i className="fa-solid fa-plug" />
            <span>Connect Data Source - {defaultModuleName || module}</span>
          </div>
          <button className="icon-action-btn" onClick={resetAndClose} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="wizard-steps">
          {[
            { num: 1, title: 'Provider' },
            { num: 2, title: 'Configure' },
            { num: 3, title: 'Action' },
            { num: 4, title: 'Review' },
            { num: 5, title: 'Done' },
          ].map((s) => (
            <div key={s.num} className={`step-item ${step === s.num ? 'active' : step > s.num ? 'completed' : ''}`}>
              <div className="step-circle">{step > s.num ? <i className="fa-solid fa-check" /> : s.num}</div>
              <span>{s.title}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div>
              <p className="section-desc">Choose the data provider that stores the school file or document.</p>
              <div className="provider-grid">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.type}
                    className={`provider-card ${selectedProvider === provider.type ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedProvider(provider.type as SourceType);
                      if (!sourceName) setSourceName(`${provider.label} - ${module}`);
                    }}
                  >
                    <div className="provider-icon" style={{ background: `${provider.color}15`, color: provider.color }}>
                      <ProviderIcon type={provider.type as SourceType} />
                    </div>
                    <div className="provider-info">
                      <h4>{provider.label}</h4>
                      <p>{provider.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-group-wrap">
              <label>Source name</label>
              <input
                type="text"
                className="form-control"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={`${currentProvider.label} - ${module}`}
              />

              {isGoogleFlow && renderGoogleConfigure()}
              {selectedProvider === 'EXCEL_UPLOAD' && (
                <>
                  <label>Dataset</label>
                  <select className="form-control" value={datasetType} onChange={(e) => setDatasetType(e.target.value)}>
                    {DATASET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <label>Excel or CSV file</label>
                  <input
                    type="file"
                    className="form-control"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  {selectedFile && (
                    <small className="form-help">
                      Selected: {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
                    </small>
                  )}
                  <small className="form-help">
                    Accepts .xlsx, .xls, and .csv files. The file is uploaded to the backend for preview and import.
                  </small>
                </>
              )}

              {selectedProvider === 'GMAIL' && (
                <>
                  <label>Gmail label</label>
                  <input
                    type="text"
                    className="form-control"
                    value={gmailLabel}
                    onChange={(e) => setGmailLabel(e.target.value)}
                    placeholder="finance"
                  />

                  <label>Sender filter</label>
                  <input
                    type="email"
                    className="form-control"
                    value={gmailSender}
                    onChange={(e) => setGmailSender(e.target.value)}
                    placeholder="reports@example.com"
                  />

                  <label>Subject filter</label>
                  <input
                    type="text"
                    className="form-control"
                    value={gmailSubject}
                    onChange={(e) => setGmailSubject(e.target.value)}
                    placeholder="attendance"
                  />

                  <div className="provider-select-row">
                    <div>
                      <label>From date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={gmailDateFrom}
                        onChange={(e) => setGmailDateFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label>To date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={gmailDateTo}
                        onChange={(e) => setGmailDateTo(e.target.value)}
                      />
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={gmailAttachmentOnly}
                      onChange={(e) => setGmailAttachmentOnly(e.target.checked)}
                    />
                    Attachment-only mode
                  </label>

                  <div className="provider-select-row">
                    {(['.xlsx', '.xls', '.csv'] as const).map((type) => (
                      <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={gmailAttachmentTypes.includes(type)}
                          onChange={(e) => {
                            setGmailAttachmentTypes((current) =>
                              e.target.checked ? Array.from(new Set([...current, type])) : current.filter((item) => item !== type)
                            );
                          }}
                        />
                        {type}
                      </label>
                    ))}
                  </div>

                  <small className="form-help">
                    Gmail uses the Gmail API with a real OAuth flow and only requests read-only access.
                  </small>
                </>
              )}

              {(selectedProvider === 'ONEDRIVE' || selectedProvider === 'SHAREPOINT') && renderMicrosoftDriveConfigure()}

              {selectedProvider === 'OUTLOOK' && renderOutlookConfigure()}

              {!schoolId && (
                <div className="form-group mt-4 p-3 bg-light rounded border">
                  <label className="d-flex align-items-center mb-0" style={{ gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isGlobalConfirmed}
                      onChange={(e) => setIsGlobalConfirmed(e.target.checked)}
                      style={{ width: '1.2rem', height: '1.2rem' }}
                    />
                    <strong className="text-danger">Confirm global source (applies to all schools)</strong>
                  </label>
                  <p className="form-help mt-2 mb-0">
                    No school is selected, so this source will be visible globally.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-4">
              <div className="test-icon-box">
                {testing || previewing ? (
                  <i className="fa-solid fa-circle-notch fa-spin text-primary" style={{ fontSize: '2.5rem' }} />
                ) : testResult === 'failed' ? (
                  <i className="fa-solid fa-circle-xmark text-danger" style={{ fontSize: '2.5rem' }} />
                ) : (
                  <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '2.5rem' }} />
                )}
              </div>
              <h3 className="mt-3">{renderStepThreeTitle()}</h3>
              <p className="text-muted">{renderStepThreeBody()}</p>

              {selectedProvider === 'EXCEL_UPLOAD' && selectedFile && !excelPreview && (
                <div className="alert alert-info">Ready to upload: {selectedFile.name}</div>
              )}
            </div>
          )}

          {step === 4 && renderStepFourSummary()}

          {step === 5 && (
            <div className="text-center py-4">
              <div className="success-badge-large">
                <i className="fa-solid fa-check" />
              </div>
              <h2>Source ready</h2>
              <p className="lead-text">
                {selectedProvider === 'EXCEL_UPLOAD'
                  ? 'The uploaded file was imported into PostgreSQL.'
                  : isMicrosoftFlow
                    ? 'Microsoft authorization is complete. The source will finish syncing once the callback closes.'
                    : selectedProvider === 'GMAIL'
                      ? 'Gmail authorization is complete. Use the source import flow to ingest attachments.'
                      : 'The source is connected and ready for live imports.'}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step > 1 && step < 5 && (
            <button className="btn btn-outline" onClick={() => setStep((current) => (current - 1) as any)}>
              Back
            </button>
          )}

          {step === 1 && (
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              Next: configure
            </button>
          )}

          {step === 2 && isGoogleFlow && (
            <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!schoolId && !isGlobalConfirmed}>
              Continue
            </button>
          )}

          {step === 2 && selectedProvider === 'EXCEL_UPLOAD' && (
            <button
              className="btn btn-primary"
              onClick={() => setStep(3)}
              disabled={!selectedFile || (!schoolId && !isGlobalConfirmed)}
            >
              Continue
            </button>
          )}

          {step === 2 && (selectedProvider === 'GMAIL' || isMicrosoftFlow) && (
            <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!schoolId && !isGlobalConfirmed}>
              Continue
            </button>
          )}

          {step === 3 && isGoogleFlow && (
            <button className="btn btn-primary" onClick={handleGoogleTest} disabled={testing}>
              {testing ? 'Testing...' : `Test ${currentProvider.label}`}
            </button>
          )}

          {step === 3 && selectedProvider === 'EXCEL_UPLOAD' && (
            <button className="btn btn-primary" onClick={handleExcelPreview} disabled={previewing || !selectedFile}>
              {previewing ? 'Uploading...' : 'Upload & Preview'}
            </button>
          )}

          {step === 3 && selectedProvider === 'GMAIL' && (
            <button className="btn btn-primary" onClick={handleGmailConnect} disabled={saving}>
              {saving ? 'Connecting...' : 'Connect Gmail'}
            </button>
          )}

          {step === 3 && isMicrosoftFlow && (
            <button className="btn btn-primary" onClick={openMicrosoftAuthPopup} disabled={saving}>
              {saving ? 'Connecting...' : 'Connect with Microsoft'}
            </button>
          )}

          {step === 4 && isGoogleFlow && (
            <button className="btn btn-primary" onClick={handleSaveGoogleReference} disabled={saving || testResult !== 'success'}>
              {saving ? 'Saving...' : 'Save connection'}
            </button>
          )}

          {step === 4 && selectedProvider === 'EXCEL_UPLOAD' && (
            <button className="btn btn-primary" onClick={handleExcelImport} disabled={saving || !excelUploadId}>
              {saving ? 'Importing...' : 'Import file'}
            </button>
          )}

          {step === 4 && selectedProvider === 'GMAIL' && (
            <button className="btn btn-primary" onClick={handleGmailConnect} disabled={saving}>
              {saving ? 'Connecting...' : 'Connect Gmail'}
            </button>
          )}

          {step === 4 && isMicrosoftFlow && (
            <button className="btn btn-primary" onClick={openMicrosoftAuthPopup} disabled={saving}>
              {saving ? 'Connecting...' : 'Connect with Microsoft'}
            </button>
          )}

          {step === 5 && (
            <button
              className="btn btn-primary"
              onClick={() => {
                onSuccess();
                resetAndClose();
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataSourceConnector;
