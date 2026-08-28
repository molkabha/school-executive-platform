import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AIAnalysisResult } from '../types';
import { AIService } from '../services/api';
import { useToast } from './ui/Toast';

interface AIAnalysisPanelProps {
  module: string;
  documentType?: string;
  documentName?: string;
  sampleText?: string;
  initialAnalysis?: AIAnalysisResult | null;
  onAnalysisComplete?: (result: AIAnalysisResult) => void;
}

export function AIAnalysisPanel({
  module,
  documentType = 'excel',
  documentName,
  sampleText = 'تقرير الحضور والانصراف للكادر التعليمي لجميع المدارس. نسبة الحضور في مدرسة الإبداع 96.2% وفي الريادة 91.8%. تم تسجيل 4 حالات مغادرة في مدرسة الريادة.',
  initialAnalysis = null,
  onAnalysisComplete,
}: AIAnalysisPanelProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(initialAnalysis);
  const [error, setError] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'changes' | 'risks' | 'recommendations'>('summary');

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setNeedsConfig(false);

    try {
      const result = await AIService.analyze({
        documentType,
        module,
        summaryType: 'executive',
        text: sampleText,
        documentName: documentName || `${module}_report.xlsx`,
      });

      setAnalysis(result);
      setLoading(false);
      showToast('تم إكمال التحليل التنفيذي بالذكاء الاصطناعي بنجاح ✓', 'success');
      if (onAnalysisComplete) onAnalysisComplete(result);
    } catch (err: any) {
      setLoading(false);
      // 503 = AI provider/API key not configured or auth failed. Surface a
      // clear, friendly message and a direct path to Settings instead of a
      // raw server error. Never surface secrets, keys, JWTs, or stack traces
      // here — the backend already withholds those outside development mode.
      const status = err.response?.status;
      const isConfigIssue = status === 503;
      setNeedsConfig(isConfigIssue);

      const errMsg = isConfigIssue
        ? (err.response?.data?.message ||
           'لم يتم إعداد مزوّد الذكاء الاصطناعي بعد. يرجى الذهاب إلى الإعدادات وإدخال مفتاح API لتفعيل هذه الميزة.')
        : (err.response?.data?.message || 'فشل التحليل بالذكاء الاصطناعي. يُرجى التحقق من إعدادات API في الصفحة الإدارية.');
      setError(errMsg);
      showToast(errMsg, 'error');
    }
  };

  return (
    <div className="ai-analysis-card">
      <div className="ai-card-header">
        <div className="ai-header-title">
          <div className="brain-pulse-icon">
            <i className="fa-solid fa-brain" />
          </div>
          <div>
            <h4>التحليل الذكي التنفيذي (AI Engine)</h4>
            <p>تحليل مباشر بدون تكرار للملفات — استخراج ملخص وقضايا ومخاطر وتنفيذات</p>
          </div>
        </div>

        <button
          className={`btn ${analysis ? 'btn-subtle' : 'btn-primary'} btn-glow`}
          disabled={loading}
          onClick={handleAnalyze}
        >
          {loading ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin" /> جاري التحليل بالذكاء الاصطناعي...
            </>
          ) : (
            <>
              <i className="fa-solid fa-wand-magic-sparkles" /> {analysis ? 'إعادة التحليل الآن' : 'تحليل بالذكاء الاصطناعي'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mt-3">
          <i className="fa-solid fa-triangle-exclamation" />
          <div>
            <strong>{needsConfig ? 'إعداد الذكاء الاصطناعي مطلوب:' : 'خطأ في التحليل الذكي:'}</strong>
            <p>{error}</p>
            {needsConfig && (
              <Link to="/settings" className="btn btn-sm btn-outline mt-2">
                <i className="fa-solid fa-gear" /> الذهاب إلى الإعدادات
              </Link>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="ai-loading-state mt-4">
          <div className="ai-radar-anim">
            <div className="radar-circle" />
            <div className="radar-circle delay-1" />
            <i className="fa-solid fa-robot" />
          </div>
          <p className="mt-3">يقوم النموذج الفائق بقراءة المستند واستخراج المؤشرات والأنماط المخفية...</p>
        </div>
      )}

      {!loading && !analysis && !error && (
        <div className="ai-empty-prompt mt-3">
          <i className="fa-solid fa-sparkles" />
          <span>اضغط على "تحليل بالذكاء الاصطناعي" لاستخراج الملخص التنفيذي والتوصيات الفورية من هذا المصدر.</span>
        </div>
      )}

      {!loading && analysis && (
        <div className="ai-result-content mt-4">
          {/* Navigation tabs */}
          <div className="ai-tabs-row">
            <button
              className={`ai-tab ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              <i className="fa-solid fa-file-contract" /> الملخص التنفيذي
            </button>
            <button
              className={`ai-tab ${activeTab === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveTab('changes')}
            >
              <i className="fa-solid fa-right-left" /> أهم التغييرات ({analysis.mainChanges?.length || 0})
            </button>
            <button
              className={`ai-tab ${activeTab === 'risks' ? 'active' : ''}`}
              onClick={() => setActiveTab('risks')}
            >
              <i className="fa-solid fa-shield-cat" /> المخاطر والقضايا ({analysis.risks?.length || 0})
            </button>
            <button
              className={`ai-tab ${activeTab === 'recommendations' ? 'active' : ''}`}
              onClick={() => setActiveTab('recommendations')}
            >
              <i className="fa-solid fa-lightbulb" /> التوصيات الإستراتيجية ({analysis.recommendations?.length || 0})
            </button>
          </div>

          {/* TAB 1: Summary */}
          {activeTab === 'summary' && (
            <div className="ai-tab-pane fade-in">
              <div className="executive-summary-text-box">
                <i className="fa-solid fa-quote-right quote-bg" />
                <p>{analysis.executiveSummary || 'لا يوجد ملخص متوفر.'}</p>
              </div>
            </div>
          )}

          {/* TAB 2: Changes */}
          {activeTab === 'changes' && (
            <div className="ai-tab-pane fade-in">
              <ul className="bullet-list-custom">
                {analysis.mainChanges && analysis.mainChanges.length > 0 ? (
                  analysis.mainChanges.map((change, i) => (
                    <li key={i}>
                      <i className="fa-solid fa-arrow-trend-up text-primary" />
                      <span>{change}</span>
                    </li>
                  ))
                ) : (
                  <li>لا توجد تغييرات جوهرية مرصودة.</li>
                )}
              </ul>
            </div>
          )}

          {/* TAB 3: Risks */}
          {activeTab === 'risks' && (
            <div className="ai-tab-pane fade-in">
              <ul className="bullet-list-custom risks">
                {analysis.risks && analysis.risks.length > 0 ? (
                  analysis.risks.map((risk, i) => (
                    <li key={i}>
                      <i className="fa-solid fa-triangle-exclamation text-danger" />
                      <span>{risk}</span>
                    </li>
                  ))
                ) : (
                  <li>لم يتم كشف مخاطر حرجة.</li>
                )}
              </ul>
            </div>
          )}

          {/* TAB 4: Recommendations */}
          {activeTab === 'recommendations' && (
            <div className="ai-tab-pane fade-in">
              <ul className="bullet-list-custom recommendations">
                {analysis.recommendations && analysis.recommendations.length > 0 ? (
                  analysis.recommendations.map((rec, i) => (
                    <li key={i}>
                      <i className="fa-solid fa-circle-check text-success" />
                      <span>{rec}</span>
                    </li>
                  ))
                ) : (
                  <li>لا توجد توصيات إضافية.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
