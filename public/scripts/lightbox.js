(() => {
  const css = `
    .lb-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(5, 11, 22, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      cursor: zoom-out;
      padding: 24px;
      box-sizing: border-box;
      opacity: 0;
      transition: opacity 0.22s ease;
    }
    .lb-overlay.lb-open {
      display: flex;
    }
    .lb-overlay.lb-visible {
      opacity: 1;
    }
    .lb-overlay img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 6px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
      pointer-events: none;
      transform: scale(0.94);
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .lb-overlay.lb-visible img {
      transform: scale(1);
    }
    .lb-close {
      position: absolute;
      top: 20px;
      right: 24px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(236, 232, 225, 0.18);
      border-radius: 50%;
      background: rgba(24, 31, 40, 0.72);
      color: rgba(236, 232, 225, 0.7);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      transition: background 0.18s ease, color 0.18s ease;
    }
    .lb-close:hover {
      background: rgba(36, 44, 56, 0.9);
      color: #fff;
    }
    figure img {
      cursor: zoom-in;
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'lb-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'lb-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  const img = document.createElement('img');
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  function open(src, alt) {
    img.src = src;
    img.alt = alt || '';
    document.body.style.overflow = 'hidden';
    overlay.classList.add('lb-open');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('lb-visible'));
    });
  }

  function close() {
    overlay.classList.remove('lb-visible');
    overlay.addEventListener('transitionend', () => {
      overlay.classList.remove('lb-open');
      img.src = '';
      document.body.style.overflow = '';
    }, { once: true });
  }

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('lb-visible')) close();
  });

  document.querySelectorAll('figure img').forEach(el => {
    el.addEventListener('click', () => open(el.src, el.alt));
  });
})();
