import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { AgentService } from '../services/api';
import { AgentMessageItem } from '../types';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { useToast } from '../components/ui/Toast';

const SUGGESTED_QUESTIONS = [
  'ما هو تطور نسبة الحضور والغياب خلال آخر 3 أشهر؟',
  'أي المدارس تعاني من أعلى نسبة قضايا في الكادر؟',
  'لخص لي كافة ملاحظات صوت المعلم لهذا الفصل الدراسي',
  'ما هي أكبر مخاطر الأداء المرتقبة حالياً في المدارس؟',
  'قارن بين أداء مدرسة الإبداع ومدرسة المستقبل',
  'لماذا ارتفع مؤشر دوران الكادر وما هي أسبابه الرئيسية؟',
  'أنشئ تقريراً تنفيذياً كاملاً لمجلس الإدارة الآن',
  'استخرج القضايا الهامة من المستندات المرتبطة',
];

export function AssistantPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedSchoolId, selectedSchool } = useSchoolFilter();
  const [messages, setMessages] = useState<AgentMessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadHistory = async () => {
    setFetchingHistory(true);
    try {
      const history = await AgentService.getHistory({ schoolId: selectedSchoolId || undefined });
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history);
      } else {
        // Default welcome message
        setMessages([
          {
            role: 'assistant',
            content:
              'أهلاً بكِ سعادة المشرفة العامة. أنا المساعد التنفيذي الذكي الخاص بمجموعة المدارس.\n\nيمكنكِ سؤالي عن أي بيانات في النظام، مثل: معدلات الحضور، السكن والإقامة، صوت المعلم، دوران الكادر، أو طلب مقارنات وإنشاء تقارير لمجلس الإدارة.',
            // No dataSourcesUsed here: this is a static welcome message, not an
            // AI answer grounded in any actual data — showing fabricated
            // citations before a single question is asked was misleading.
            lastDataUpdate: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [selectedSchoolId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputMessage;
    if (!query.trim() || loading) return;

    const userMsg: AgentMessageItem = {
      role: 'user',
      content: query.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setLoading(true);

    try {
      // Prepare message history for RAG context
      const historyPayload = messages.map((m) => ({ role: m.role, content: m.content }));

      // Prepend school context if a specific school is selected
      let contextualQuery = query.trim();
      let schoolIdPayload: string | undefined = undefined;
      if (selectedSchoolId && selectedSchool) {
        contextualQuery = `[سياق: المدرسة المحددة هي "${selectedSchool.name}" (ID: ${selectedSchoolId})] ${contextualQuery}`;
        schoolIdPayload = selectedSchoolId;
      }

      const res = await AgentService.chat(contextualQuery, historyPayload, schoolIdPayload);

      const assistantMsg: AgentMessageItem = {
        role: 'assistant',
        content: res.answer,
        dataSourcesUsed: res.dataSourcesUsed || [],
        lastDataUpdate: res.lastDataUpdate,
        reportGenerated: res.reportGenerated,
        createdAt: new Date().toISOString(),
        generatedBy: res.generatedBy,
        aiUsed: res.aiUsed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'فشل الاتصال بالمساعد التنفيذي الذكي';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    // If a specific school is selected, scope the deletion to that school only.
    // Otherwise, warn the user that this is a cross-school purge before proceeding.
    if (selectedSchoolId) {
      if (!window.confirm('هل أنتِ متأكدة من مسح سجل المحادثة للمدرسة المحددة حالياً؟')) return;
      try {
        await AgentService.clearHistory({ schoolId: selectedSchoolId });
        showToast('تم مسح سجل المحادثة لهذه المدرسة بنجاح', 'success');
        loadHistory();
      } catch (err) {
        showToast('فشل مسح المحادثة', 'error');
      }
    } else {
      // No school selected — this is a full cross-school purge
      if (!window.confirm('تنبيه: سيتم مسح سجل جميع المحادثات عبر كافة المدارس، وليس المدرسة المحددة حالياً فقط. هل تريدين المتابعة؟')) return;
      try {
        await AgentService.clearHistory();
        showToast('تم مسح كامل سجل المحادثات بنجاح', 'success');
        loadHistory();
      } catch (err) {
        showToast('فشل مسح المحادثة', 'error');
      }
    }
  };

  return (
    <AppShell
      activePage="assistant"
      title="المساعد التنفيذي الذكي (AI Chief of Staff)"
      subtitle="استفسارات حية بالذكاء الاصطناعي على كامل بيانات المستندات والمدارس دون حدود للأسئلة."
    >
      {/* Top Banner Actions */}
      <div className="daily-summary-box mb-4">
        <div className="daily-summary-header">
          <div className="daily-summary-title">
            <div className="summary-spark-icon">
              <i className="fa-solid fa-robot" />
            </div>
            <div>
              <h3>المساعد الذكي للمشرفة العامة — RAG Intelligence Engine</h3>
              <p className="text-muted text-xs">
                يقرأ المستندات المرفوعة، ملفات Excel، الإيميلات، ومؤشرات DB ويجيب بدقة مع ذكر المصادر وتاريخ التحديث.
              </p>
            </div>
          </div>
          <div className="banner-actions">
            <button className="btn btn-outline btn-sm" onClick={handleClearHistory}>
              <i className="fa-solid fa-broom" /> مسح المحادثة
            </button>
            <button className="btn btn-secondary btn-glow btn-sm" onClick={() => navigate('/reports')}>
              <i className="fa-solid fa-file-invoice" /> أرشيف التقارير
            </button>
          </div>
        </div>
      </div>

      {/* Suggested Prompt Chips Carousel */}
      <div className="suggested-questions-wrap mb-4">
        <span className="suggested-title">
          <i className="fa-solid fa-wand-magic-sparkles text-gold" /> أسئلة سريعة مقترحة للمشرفة:
        </span>
        <div className="suggested-pills-row">
          {SUGGESTED_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              className="suggested-chip"
              disabled={loading}
              onClick={() => handleSendMessage(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area Card */}
      <div className="card chat-container-card">
        <div className="chat-messages-area">
          {fetchingHistory ? (
            <div className="text-center py-5 text-muted">
              <i className="fa-solid fa-spinner fa-spin fa-2x mb-2" />
              <p>جاري تحميل سجل الاستفسارات التنفيذية...</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div key={index} className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
                  <div className="chat-avatar">
                    <i className={`fa-solid ${isUser ? 'fa-user-tie' : 'fa-robot'}`} />
                  </div>

                  <div className="chat-bubble-content">
                    <div className="chat-bubble-header">
                      <span className="chat-sender-name">
                        {isUser ? 'المشرفة العامة' : 'المساعد التنفيذي الذكي'}
                        {!isUser && (
                          <span className={`badge ${msg.aiUsed !== false ? 'badge-primary' : 'badge-warning'} ms-2`} style={{ marginRight: '8px', fontSize: '0.65rem' }}>
                            {msg.aiUsed !== false ? 'ذكاء اصطناعي (AI)' : 'قاعدة البيانات (بدون AI)'}
                          </span>
                        )}
                      </span>
                      {msg.createdAt && (
                        <span className="chat-time">
                          {new Date(msg.createdAt).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="chat-text-body">
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>

                    {/* Report Generated Action Banner */}
                    {msg.reportGenerated && (
                      <div className="generated-report-card-banner mt-3">
                        <div className="report-banner-left">
                          <i className="fa-solid fa-file-circle-check text-gold" />
                          <div>
                            <strong>تم إنشاء وتوثيق تقرير تنفيذي جديد تلقائياً!</strong>
                            <p className="text-xs text-muted">{msg.reportGenerated.title}</p>
                          </div>
                        </div>
                        <button className="btn btn-primary btn-xs" onClick={() => navigate('/reports')}>
                          <i className="fa-solid fa-eye" /> عرض التقرير الآن
                        </button>
                      </div>
                    )}

                    {/* Cited Data Sources Box */}
                    {!isUser && msg.dataSourcesUsed && msg.dataSourcesUsed.length > 0 && (
                      <div className="chat-citations-box mt-3">
                        <div className="citations-header">
                          <i className="fa-solid fa-database text-primary" />
                          <span>مصادر بيانات مذكورة في هذه الإجابة:</span>
                        </div>
                        <div className="citations-tags">
                          {msg.dataSourcesUsed.map((src, i) => (
                            <span key={i} className="citation-tag">
                              <i className="fa-solid fa-file-excel text-success ml-1" />
                              {src}
                            </span>
                          ))}
                        </div>
                        {msg.lastDataUpdate && (
                          <div className="citations-update-date mt-1">
                            <i className="fa-solid fa-clock-rotate-left ml-1" />
                            تاريخ تحديث البيانات: {new Date(msg.lastDataUpdate).toLocaleString('ar-SA-u-nu-latn')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Loading Animation */}
          {loading && (
            <div className="chat-message-row assistant-row">
              <div className="chat-avatar">
                <i className="fa-solid fa-robot" />
              </div>
              <div className="chat-bubble-content">
                <div className="ai-loading-state p-2 text-right">
                  <div className="ai-radar-anim">
                    <div className="radar-circle" />
                    <div className="radar-circle delay-1" />
                    <i className="fa-solid fa-wand-magic-sparkles" />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    جاري قراءة البيانات الحية واستخلاص المؤشرات بواسطة RAG Engine...
                  </p>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="chat-input-bar"
        >
          <input
            type="text"
            className="chat-input-field"
            placeholder="اسألي المساعد التنفيذي عن الحضور، السكن، صوت المعلم، دوران الكادر، أو اطلبي تقريراً لمجلس الإدارة..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary btn-glow chat-send-btn" disabled={loading || !inputMessage.trim()}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
            <span>إرسال</span>
          </button>
        </form>
      </div>
    </AppShell>
  );
}

export default AssistantPage;
