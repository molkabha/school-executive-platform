import { useEffect, useState } from 'react';
import { ConfigService, AIService } from '../services/api';
import { AppShell } from '../components/AppShell';
import { SkeletonCard } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';
import { allowCustomAiBaseUrl } from '../config';

export function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<string>('openai');
  const [model, setModel] = useState<string>('gpt-4o-mini');
  // newApiKey is what the user types — never stores the masked value from the server
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);
  // Whether the server already has a real API key stored
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  // Test Connection State
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const customBaseUrlEnabled = allowCustomAiBaseUrl();

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await ConfigService.getAll();
      // Support both response shapes: array of configs, or {data, meta}
      const configs: Array<{ key: string; value: string; hasApiKey?: boolean }> = Array.isArray(res)
        ? res
        : (res as any).data || res;
      const meta = (res as any).meta;

      const map: Record<string, string> = {};
      let apiKeyConfigured = false;

      for (const c of configs) {
        map[c.key] = c.value;
        // The api_key record may carry the hasApiKey flag directly
        if (c.key === 'ai_api_key' && (c as any).hasApiKey) {
          apiKeyConfigured = true;
        }
      }

      // Also check the top-level meta field
      if (meta?.hasApiKey) apiKeyConfigured = true;

      if (map['ai_provider']) setProvider(map['ai_provider']);
      if (map['ai_model']) setModel(map['ai_model']);
      if (map['ai_base_url']) setBaseUrl(map['ai_base_url']);

      // NEVER load the masked key into the input — always keep it blank
      setNewApiKey('');
      setHasApiKey(apiKeyConfigured);
    } catch (err: any) {
      showToast('فشل تحميل الإعدادات من الخادم', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: 'ai_provider', value: provider },
        { key: 'ai_model', value: model },
        { key: 'ai_base_url', value: baseUrl },
      ];

      // Only include ai_api_key when the user actually typed a new value
      if (newApiKey && newApiKey.trim().length > 0) {
        updates.push({ key: 'ai_api_key', value: newApiKey.trim() });
      }

      await ConfigService.bulkUpdate(updates);
      setSaving(false);

      // If user saved a new key, mark it as configured and clear the field
      if (newApiKey && newApiKey.trim().length > 0) {
        setHasApiKey(true);
        setNewApiKey('');
      }

      showToast('تم حفظ إعدادات موفر الذكاء الاصطناعي بنجاح ✓', 'success');
    } catch (err: any) {
      setSaving(false);
      showToast(err.response?.data?.message || 'فشل حفظ الإعدادات', 'error');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestSuccess(null);
    try {
      // Pass the newly typed key if provided, otherwise let the server use the stored key
      const overrides: Record<string, string> = { provider, model };
      if (newApiKey && newApiKey.trim().length > 0) {
        overrides.apiKey = newApiKey.trim();
      }
      if (baseUrl) overrides.baseUrl = baseUrl;

      const result = await AIService.testConnection(overrides);
      setTesting(false);
      setTestSuccess(result.connected);
      if (result.connected) {
        showToast('تم الاتصال بموفر الذكاء الاصطناعي بنجاح ✓', 'success');
      } else {
        showToast(`فشل الاتصال: ${result.error || 'تأكد من المفتاح والنطاق'}`, 'error');
      }
    } catch (err: any) {
      setTesting(false);
      setTestSuccess(false);
      showToast('فشل اختبار الاتصال بالخادم', 'error');
    }
  };

  return (
    <AppShell
      activePage="settings"
      title="إعدادات AI والنظام"
      subtitle="لوحة إعدادات النظام الداخلي للمشرفة العامة: إعدادات مزود الذكاء الاصطناعي والتكاملات الأساسية."
    >
      {loading ? (
        <SkeletonCard />
      ) : (
        <div className="card max-w-3xl">
          <div className="chart-box-header">
            <div>
              <h3>تكوين محرك الذكاء الاصطناعي والإعدادات النظامية</h3>
              <p className="text-muted text-xs">إعدادات النظام الداخلي تشمل مفاتيح API، موفر AI، ونطاق التكامل.</p>
            </div>
            <span className="badge badge-gold">إعدادات النظام الداخلي</span>
          </div>

          <form onSubmit={handleSaveConfig} className="settings-form mt-4">
            {/* Provider Selection */}
            <div className="form-group mb-4">
              <label>موفر خدمة الذكاء الاصطناعي (AI Provider)</label>
              <div className="provider-select-row">
                <div
                  className={`provider-card-select ${provider === 'openai' ? 'active' : ''}`}
                  onClick={() => {
                    setProvider('openai');
                    setModel('gpt-4o-mini');
                  }}
                >
                  <i className="fa-brands fa-openai" />
                  <strong>OpenAI / Compatible</strong>
                  <span>GPT-4o / GPT-4o-mini</span>
                </div>

                <div
                  className={`provider-card-select ${provider === 'gemini' ? 'active' : ''}`}
                  onClick={() => {
                    setProvider('gemini');
                    setModel('gemini-1.5-flash');
                  }}
                >
                  <i className="fa-brands fa-google text-success" />
                  <strong>Google Gemini</strong>
                  <span>Gemini 1.5 Flash / Pro</span>
                </div>

                <div
                  className={`provider-card-select ${provider === 'groq' ? 'active' : ''}`}
                  onClick={() => {
                    setProvider('groq');
                    setModel('llama-3.3-70b-versatile');
                  }}
                >
                  <i className="fa-solid fa-rocket text-info" />
                  <strong>Groq</strong>
                  <span>llama-3.3-70b-versatile</span>
                </div>

                <div
                  className={`provider-card-select ${provider === 'claude' ? 'active' : ''}`}
                  onClick={() => {
                    setProvider('claude');
                    setModel('claude-3-5-haiku-20241022');
                  }}
                >
                  <i className="fa-solid fa-brain text-warning" />
                  <strong>Anthropic Claude</strong>
                  <span>Claude 3.5 Haiku / Sonnet</span>
                </div>
              </div>
            </div>

            {/* Model Name */}
            <div className="form-group mb-3">
              <label>اسم النموذج (Model Name)</label>
              <input
                type="text"
                className="form-control"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini / gemini-1.5-flash / claude-3-5-haiku-20241022"
                required
              />
            </div>

            {/* API Key — protected input */}
            <div className="form-group mb-3">
              <label>
                مفتاح API الخاص بالموفر (API Key)
                {hasApiKey && (
                  <span className="badge badge-success ms-2" style={{ marginRight: '8px', fontSize: '0.7rem' }}>
                    <i className="fa-solid fa-circle-check" /> API Key configured ✓
                  </span>
                )}
              </label>
              <div className="input-group">
                <input
                  type="password"
                  className="form-control"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={hasApiKey ? '•••• Leave blank to keep current key' : 'sk-... Enter your API key'}
                  autoComplete="new-password"
                />
              </div>
              <small className="text-muted text-xs">
                {hasApiKey
                  ? 'مفتاح API محفوظ ومحمي. اتركه فارغاً للإبقاء على المفتاح الحالي، أو أدخل مفتاحاً جديداً لاستبداله.'
                  : 'المفتاح مشفر ومحمي ولا يتم إظهاره للواجهة بالأصل.'}
              </small>
            </div>

            {/* Custom Base URL (Optional) */}
            {(provider === 'openai' || provider === 'groq') && customBaseUrlEnabled && (
              <div className="form-group mb-4">
                <label>نطاق مخصص (Custom Base URL - اختياري للموزعين المحليين)</label>
                <input
                  type="text"
                  className="form-control"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            )}

            {/* Actions Bar */}
            <div className="settings-actions-bar">
              <button
                type="button"
                className="btn btn-outline"
                disabled={testing}
                onClick={handleTestConnection}
              >
                {testing ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" /> جاري الاختبار...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-plug-circle-bolt" /> اختبار الاتصال مع الموفر
                  </>
                )}
              </button>

              <button type="submit" className="btn btn-primary btn-glow" disabled={saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ التكوين المحدث'}
              </button>
            </div>

            {testSuccess !== null && (
              <div className={`alert ${testSuccess ? 'alert-success' : 'alert-danger'} mt-3`}>
                <i className={`fa-solid ${testSuccess ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
                <span>
                  {testSuccess
                    ? 'نجح الاتصال بموفر الذكاء الاصطناعي بنجاح ✓'
                    : 'فشل الاتصال: يُرجى التأكد من المفتاح وتوفر الانترنت وصحة الاسم.'}
                </span>
              </div>
            )}
          </form>
        </div>
      )}
    </AppShell>
  );
}

export default SettingsPage;
