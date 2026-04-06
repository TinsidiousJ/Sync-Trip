import React from "react";

export default function BottomBar({
  isVisible,
  title,
  description,
  mainButtonText,
  onMainClick,
  mainDisabled = false,
  altButtonText = "",
  onAltClick = null,
}) {
  if (!isVisible) return null;

  return (
    <div className="sticky-action">
      <div className="sticky-action__content">
        <div className="sticky-action__text">
          <p className="sticky-action__title">{title}</p>
          {description ? <p className="sticky-action__description">{description}</p> : null}
        </div>

        <div className="sticky-action__buttons">
          {altButtonText && onAltClick ? (
            <button type="button" className="button button--secondary" onClick={onAltClick}>
              {altButtonText}
            </button>
          ) : null}

          <button
            type="button"
            className="button button--primary"
            onClick={onMainClick}
            disabled={mainDisabled}
          >
            {mainButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}