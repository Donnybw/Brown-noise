// Lightweight toast notifications (replaces blocking alert() calls).

let container = null;

function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
}

const ICONS = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
};

export function showToast(message, type = 'info', duration = 3200) {
    const host = ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = ICONS[type] || ICONS.info;

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = String(message ?? '');

    toast.appendChild(icon);
    toast.appendChild(text);
    host.appendChild(toast);

    // Trigger enter animation on next frame.
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    const dismiss = () => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Fallback removal if transitionend never fires.
        setTimeout(() => toast.remove(), 400);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
    return toast;
}
