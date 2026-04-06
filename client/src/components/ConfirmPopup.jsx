import React from "react";

export default function ConfirmPopup({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false,
  onConfirm,
  onCancel,
  loading = false,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2 className="modal-card__title">{title}</h2>
        <p className="modal-card__message">{message}</p>

        <div className="modal-card__actions">
          <button type="button" className="button button--secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>

          <button
            type="button"
            className={`button ${isDanger ? "button--danger" : "button--primary"}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Please wait..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}