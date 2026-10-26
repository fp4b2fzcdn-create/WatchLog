import { useEffect, useRef, type ReactNode } from 'react';
import { Film, X, Star, LoaderCircle } from 'lucide-react';
import type { Title } from '../shared/model';
import { year, name } from './lib';

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? 'wide' : ''}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Poster({ title, small = false }: { title: Title; small?: boolean }) {
  return (
    <div className={`poster ${small ? 'small' : ''}`}>
      {title.poster ? (
        <img
          loading="lazy"
          src={`watchlog-poster://image${title.poster}`}
          alt={`${title.title} poster`}
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <div className="poster-fallback" aria-hidden="true">
        <Film size={small ? 18 : 30} />
        {!small && (
          <>
            <strong>{title.originalTitle || title.title}</strong>
            <span>{year(title)}</span>
          </>
        )}
      </div>
      {!small && <span className="media-tag">{title.type === 'movie' ? 'FILM' : 'SERIES'}</span>}
    </div>
  );
}
export function Card({
  title,
  status,
  rating,
  caption,
  onClick,
  original = false,
  children,
}: {
  title: Title;
  status?: string;
  rating?: number | null;
  caption?: string;
  onClick: () => void;
  original?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className="title-card">
      <button className="card-main" onClick={onClick}>
        <Poster title={title} />
        <div className="card-label">
          <h3>{name(title, original)}</h3>
          {rating != null && (
            <span className="rating">
              <Star size={12} fill="currentColor" />
              {rating}
            </span>
          )}
        </div>
        <p>
          {year(title)}
          <span className="dot">·</span>
          {title.type === 'movie' ? 'Movie' : 'TV series'}
        </p>
        {status && (
          <div className="card-status">
            <span className={`status-dot s-${status.split(' ')[0]}`} />
            {status}
          </div>
        )}
        {caption && <p className="card-caption">{caption}</p>}
      </button>
      {children}
    </article>
  );
}
export function Empty({
  icon,
  heading,
  description,
  children,
}: {
  icon: ReactNode;
  heading: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-art">
        <div className="empty-tile back" />
        <div className="empty-tile front">{icon}</div>
      </div>
      <h2>{heading}</h2>
      <p>{description}</p>
      <div className="empty-actions">{children}</div>
    </div>
  );
}
export function Busy({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="busy" role="status">
      <LoaderCircle size={18} className="spin" />
      {label}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <div className="inline-error" role="alert">
      {error}
    </div>
  ) : null;
}
