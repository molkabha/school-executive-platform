import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'fa-folder-open',
  title,
  description,
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state-box">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
          border: '1px solid #BFDBFE',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <i
          className={`fa-solid ${icon}`}
          style={{ fontSize: '1.6rem', color: '#2563EB', opacity: 0.8 }}
        />
      </div>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: '1rem',
          fontWeight: 800,
          color: '#1E293B',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: '0 0 20px',
            fontSize: '0.85rem',
            color: '#64748B',
            lineHeight: 1.6,
            maxWidth: 360,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {description}
        </p>
      )}
      {actionText && onAction && (
        <button className="btn btn-primary btn-glow btn-sm" onClick={onAction}>
          <i className="fa-solid fa-plus" /> {actionText}
        </button>
      )}
    </div>
  );
}
