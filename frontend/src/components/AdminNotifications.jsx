import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAdminNotification, getAdminNotificationRecipients, getAdminNotifications } from '../services/api.js';
import './admin-notifications.css';

const pageSize = 10;

export function AdminNotifications() {
  const { t, i18n } = useTranslation();
  const [recipientRole, setRecipientRole] = useState('patient');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipients, setRecipients] = useState([]);
  const [recipientPagination, setRecipientPagination] = useState(null);
  const [recipientLoading, setRecipientLoading] = useState(true);
  const [recipientError, setRecipientError] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [sentKey, setSentKey] = useState(0);
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecipientQuery(recipientSearch.trim());
      setRecipientPage(1);
      setRecipientId('');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [recipientSearch]);

  useEffect(() => {
    let active = true;
    setRecipientLoading(true);
    setRecipientError('');
    getAdminNotificationRecipients({ role: recipientRole, page: recipientPage, limit: pageSize, ...(recipientQuery ? { q: recipientQuery } : {}) })
      .then(result => {
        if (!active) return;
        setRecipients(result.items || []);
        setRecipientPagination(result.pagination || null);
      })
      .catch(failure => { if (active) setRecipientError(failure.message); })
      .finally(() => { if (active) setRecipientLoading(false); });
    return () => { active = false; };
  }, [recipientRole, recipientPage, recipientQuery]);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    getAdminNotifications({ page: historyPage, limit: pageSize, ...(status ? { status } : {}) })
      .then(result => { if (active) setHistory(result); })
      .catch(failure => { if (active) setHistoryError(failure.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [historyPage, status, reloadKey, sentKey]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      await createAdminNotification({ recipientId, title, message });
      setTitle('');
      setMessage('');
      setNotice(t('adminDashboard.notificationSent'));
      setSentKey(value => value + 1);
    } catch (failure) {
      setFormError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  const historyItems = history?.items || [];
  const historyPagination = history?.pagination;

  return <div className="admin-notifications">
    <section className="panel admin-notification-compose">
      <header className="panel-heading"><div><h2>{t('adminDashboard.sendNotification')}</h2><p>{t('adminDashboard.sendNotificationHelp')}</p></div></header>
      <form onSubmit={submit}>
        <label>{t('adminDashboard.recipientType')}<select value={recipientRole} onChange={event => { setRecipientRole(event.target.value); setRecipientPage(1); setRecipientId(''); }}>
          <option value="patient">{t('roles.patient')}</option>
          <option value="doctor">{t('roles.doctor')}</option>
        </select></label>
        <label>{t('adminDashboard.searchRecipients')}<input type="search" value={recipientSearch} maxLength={100} onChange={event => { setRecipientSearch(event.target.value); setRecipientId(''); }} placeholder={t('adminDashboard.searchRecipientsPlaceholder')}/></label>
        <label>{t('adminDashboard.recipient')}<select required value={recipientId} onChange={event => setRecipientId(event.target.value)} disabled={recipientLoading || !recipients.length}>
          <option value="">{recipientLoading ? t('adminDashboard.loading') : t('adminDashboard.chooseRecipient')}</option>
          {recipients.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
        </select></label>
        {recipientError && <p className="role-dashboard-error" role="alert">{recipientError}</p>}
        {!recipientLoading && !recipientError && !recipients.length && <p className="role-dashboard-empty">{t('adminDashboard.noRecipients')}</p>}
        {recipientPagination?.pages > 1 && <div className="admin-recipient-pagination">
          <button type="button" className="role-dashboard-secondary" disabled={recipientPage <= 1} onClick={() => setRecipientPage(value => value - 1)}>{t('adminDashboard.previousPage')}</button>
          <span>{t('adminDashboard.pageStatus', { page: recipientPagination.page, pages: recipientPagination.pages })}</span>
          <button type="button" className="role-dashboard-secondary" disabled={recipientPage >= recipientPagination.pages} onClick={() => setRecipientPage(value => value + 1)}>{t('adminDashboard.nextPage')}</button>
        </div>}
        <label>{t('adminDashboard.notificationTitle')}<input required maxLength={180} value={title} onChange={event => setTitle(event.target.value)}/></label>
        <label className="admin-notification-message">{t('adminDashboard.notificationMessage')}<textarea required rows="4" maxLength={1000} value={message} onChange={event => setMessage(event.target.value)}/></label>
        {formError && <p className="role-dashboard-error" role="alert">{formError}</p>}
        {notice && <p className="role-dashboard-success" role="status">{notice}</p>}
        <button className="role-dashboard-primary" type="submit" disabled={saving || !recipientId}>{saving ? t('adminDashboard.sending') : t('adminDashboard.sendNotification')}</button>
      </form>
    </section>
    <section className="panel admin-notification-history">
      <header className="panel-heading"><div><h2>{t('adminDashboard.notificationHistory')}</h2><p>{t('adminDashboard.notificationHistoryHelp')}</p></div>
        <label>{t('adminDashboard.filterByStatus')}<select value={status} onChange={event => { setStatus(event.target.value); setHistoryPage(1); }}>
          <option value="">{t('common.allStatuses')}</option><option value="unread">{t('adminDashboard.unread')}</option><option value="read">{t('adminDashboard.read')}</option>
        </select></label>
      </header>
      {historyError && <div className="api-alert" role="alert">{historyError}<button type="button" onClick={() => setReloadKey(value => value + 1)}>{t('common.retry')}</button></div>}
      {historyLoading ? <div className="loading-state"><span className="spinner"/>{t('adminDashboard.loading')}</div>
        : !historyError && historyItems.length ? <div className="admin-notification-list">{historyItems.map(item => <article key={item.id}>
            <div className="admin-notification-status"><span className={`status-tag ${item.readAt ? 'reviewed' : 'needs-review'}`}>{t(item.readAt ? 'adminDashboard.read' : 'adminDashboard.unread')}</span><small>{item.recipient?.name || '—'} · {t(`roles.${item.recipient?.role}`, { defaultValue: item.recipient?.role || '—' })}</small></div>
            <div><b>{item.title}</b><p>{item.message}</p><time>{item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : '—'}</time></div>
          </article>)}</div>
        : !historyError && <div className="empty-state"><b>{t('adminDashboard.noNotificationsSent')}</b></div>}
      {!historyLoading && !historyError && historyPagination?.pages > 1 && <nav className="admin-recipient-pagination" aria-label={t('adminDashboard.notificationPages')}>
        <button type="button" className="role-dashboard-secondary" disabled={historyPage <= 1} onClick={() => setHistoryPage(value => value - 1)}>{t('adminDashboard.previousPage')}</button>
        <span>{t('adminDashboard.pageStatus', { page: historyPagination.page, pages: historyPagination.pages })}</span>
        <button type="button" className="role-dashboard-secondary" disabled={historyPage >= historyPagination.pages} onClick={() => setHistoryPage(value => value + 1)}>{t('adminDashboard.nextPage')}</button>
      </nav>}
    </section>
  </div>;
}
