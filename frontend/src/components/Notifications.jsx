import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import { getAccessToken, getNotifications, getRealtimeOrigin, markAllNotificationsRead, markNotificationRead } from '../services/api.js';
import './phase11.css';

function useNotificationFeed() {
  const auth = useAuth();
  const [items, setItems] = useState([]), [unreadCount, setUnreadCount] = useState(0), [error, setError] = useState('');
  const reload = useCallback(async () => {
    try { const result = await getNotifications({ limit: 100 }); setItems(result.items || []); setUnreadCount(result.unreadCount || 0); setError(''); }
    catch (failure) { setError(failure.message); }
  }, []);
  useEffect(() => {
    if (!auth.user?.id) return undefined;
    reload();
    const socket = io(getRealtimeOrigin(), { path: '/socket.io', auth: { token: getAccessToken() }, transports: ['websocket', 'polling'] });
    socket.on('notification:new', item => { setItems(current => [item, ...current.filter(entry => entry._id !== item._id)].slice(0, 100)); setUnreadCount(value => value + 1); });
    socket.on('notification:read', reload);
    socket.on('notification:read-all', reload);
    return () => socket.disconnect();
  }, [auth.user?.id, reload]);
  const read = async id => {
    try { const item = await markNotificationRead(id); setItems(current => current.map(entry => entry._id === id ? item : entry)); setUnreadCount(current => Math.max(0, current - (items.find(entry => entry._id === id)?.readAt ? 0 : 1))); }
    catch (failure) { setError(failure.message); }
  };
  const readAll = async () => {
    try { await markAllNotificationsRead(); const now = new Date().toISOString(); setItems(current => current.map(item => ({ ...item, readAt: item.readAt || now }))); setUnreadCount(0); }
    catch (failure) { setError(failure.message); }
  };
  return { items, unreadCount, error, reload, read, readAll };
}

export function NotificationBell({ onViewAll }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const [open, setOpen] = useState(false);
  const feed = useNotificationFeed();
  return <div className="notification-center"><button className="icon-action notification" aria-label={t('notifications.ariaUnread', { count: feed.unreadCount })} onClick={() => { setOpen(value => !value); if (!open) feed.reload(); }}>♧{feed.unreadCount > 0 && <i/>}{feed.unreadCount > 0 && <span className="notification-count">{feed.unreadCount > 99 ? '99+' : feed.unreadCount}</span>}</button>{open && <div className="notification-popover"><div className="notification-popover-head"><div><b>{t('notifications.title')}</b><small>{t('notifications.unread', { count: feed.unreadCount })}</small></div><button onClick={feed.readAll} disabled={!feed.unreadCount}>{t('notifications.markAllRead')}</button></div>{feed.error && <p className="form-error">{feed.error}</p>}<div className="notification-popover-list">{feed.items.slice(0, 8).map(item => <button key={item._id} className={`notification-item ${item.readAt ? 'is-read' : 'is-unread'}`} onClick={() => !item.readAt && feed.read(item._id)}><span className={`notification-kind kind-${item.type}`}>{item.type === 'reminder' ? '◷' : item.type === 'referral' ? '↗' : item.type === 'report' ? '▤' : item.type === 'review' ? '✓' : '▣'}</span><span><b>{item.title}</b><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString(locale)}</time></span><i>{item.readAt ? t('notifications.read') : t('notifications.markRead')}</i></button>)}{!feed.items.length && <div className="notification-empty">{t('notifications.empty')}</div>}</div><button className="notification-view-all" onClick={() => { onViewAll?.(); setOpen(false); }}>{t('notifications.viewAll')}</button></div>}</div>;
}

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const feed = useNotificationFeed();
  useEffect(() => { feed.reload(); }, [feed.reload]);
  return <section className="panel notification-page"><div className="panel-heading"><div><h2>{t('notifications.centerTitle')}</h2><p>{t('notifications.description')}</p></div><button className="clinical-secondary" onClick={feed.readAll} disabled={!feed.unreadCount}>{t('notifications.markAllRead')} ({feed.unreadCount})</button></div>{feed.error && <div className="api-alert">{feed.error}<button onClick={feed.reload}>{t('notifications.retry')}</button></div>}<div className="notification-page-list">{feed.items.map(item => <article className={`notification-page-row ${item.readAt ? 'is-read' : 'is-unread'}`} key={item._id}><span className={`notification-kind kind-${item.type}`}>{item.type === 'reminder' ? '◷' : item.type === 'referral' ? '↗' : item.type === 'report' ? '▤' : item.type === 'review' ? '✓' : '▣'}</span><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString(locale)}</small></div>{!item.readAt && <button className="clinical-secondary" onClick={() => feed.read(item._id)}>{t('notifications.markRead')}</button>}</article>)}{!feed.items.length && <div className="empty-state"><b>{t('notifications.noNotifications')}</b><p>{t('notifications.emptyDescription')}</p></div>}</div></section>;
}
