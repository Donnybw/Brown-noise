// PropertyLine UI enhancements (v2 redesign)
// Layered on top of app.js — no core logic lives here.
(function () {
    'use strict';

    /* ------------------------------------------------------------------
       Theme toggle (dark default, persisted)
    ------------------------------------------------------------------ */
    const THEME_KEY = 'plTheme';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const themeToggle = document.getElementById('theme-toggle');

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.dataset.theme = 'light';
        } else {
            delete document.documentElement.dataset.theme;
        }
        if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#f4f6f9' : '#0b1118');
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) { }
    }

    let initialTheme = 'dark';
    try {
        initialTheme = localStorage.getItem(THEME_KEY) ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    } catch (e) { }
    applyTheme(initialTheme);

    themeToggle?.addEventListener('click', () => {
        const isLight = document.documentElement.dataset.theme === 'light';
        applyTheme(isLight ? 'dark' : 'light');
    });

    /* ------------------------------------------------------------------
       Tooltips: convert title -> data-tip for styled hover tooltips.
       Map tool buttons are created dynamically by app.js, so watch for them.
    ------------------------------------------------------------------ */
    const TIP_SELECTOR = '.control-btn, .action-bar-btn, .icon-btn, .header-btn';

    function hydrateTip(el) {
        if (!el.matches || !el.matches(TIP_SELECTOR)) return;
        const title = el.getAttribute('title');
        if (title) {
            el.setAttribute('data-tip', title);
            el.removeAttribute('title');
        }
    }

    function hydrateTipsWithin(root) {
        if (root.nodeType !== 1) return;
        hydrateTip(root);
        root.querySelectorAll?.(TIP_SELECTOR + '[title]').forEach(hydrateTip);
    }

    hydrateTipsWithin(document.body);

    new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach(hydrateTipsWithin);
            } else if (m.type === 'attributes' && m.target.getAttribute('title')) {
                hydrateTip(m.target);
            }
        }
    }).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title']
    });

    /* ------------------------------------------------------------------
       Welcome panel: hide once results are visible, and bring the
       workspace into view when an analysis starts.
    ------------------------------------------------------------------ */
    const welcome = document.getElementById('welcome');
    const results = document.getElementById('results');

    function syncWelcome() {
        const showing = results && results.style.display !== 'none';
        if (welcome) welcome.hidden = !!showing;
        return showing;
    }

    if (results) {
        let wasShowing = syncWelcome();
        new MutationObserver(() => {
            const showing = syncWelcome();
            if (showing && !wasShowing) {
                results.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            wasShowing = showing;
        }).observe(results, { attributes: true, attributeFilter: ['style'] });
    }

    /* ------------------------------------------------------------------
       Recent addresses: remember analyzed addresses, offer one-tap reuse.
    ------------------------------------------------------------------ */
    const RECENT_KEY = 'plRecentAddresses';
    const RECENT_MAX = 4;
    const recentWrap = document.getElementById('recent-addresses');
    const addressInput = document.getElementById('address');
    const analyzeBtn = document.getElementById('analyze-btn');

    function getRecents() {
        try {
            const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function rememberAddress(addr) {
        addr = (addr || '').trim();
        if (!addr) return;
        const list = getRecents().filter(a => a.toLowerCase() !== addr.toLowerCase());
        list.unshift(addr);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch (e) { }
        renderRecents();
    }

    function renderRecents() {
        if (!recentWrap) return;
        recentWrap.innerHTML = '';
        const list = getRecents();
        if (!list.length) return;

        const label = document.createElement('span');
        label.className = 'recent-label';
        label.textContent = 'Recent';
        recentWrap.appendChild(label);

        list.forEach(addr => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'recent-chip';
            chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
            const text = document.createElement('span');
            text.textContent = addr;
            chip.appendChild(text);
            chip.addEventListener('click', () => {
                if (addressInput) addressInput.value = addr;
                analyzeBtn?.click();
            });
            recentWrap.appendChild(chip);
        });
    }

    // app.js handles the actual analysis; we just observe the same triggers.
    analyzeBtn?.addEventListener('click', () => rememberAddress(addressInput?.value));
    addressInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') rememberAddress(addressInput.value);
    });
    renderRecents();

    /* ------------------------------------------------------------------
       Help & shortcuts modal
    ------------------------------------------------------------------ */
    const modal = document.getElementById('shortcuts-modal');
    const openBtn = document.getElementById('shortcuts-btn');
    const closeBtn = document.getElementById('shortcuts-close');

    function setModal(open) {
        if (!modal) return;
        modal.hidden = !open;
    }

    openBtn?.addEventListener('click', () => setModal(modal.hidden));
    closeBtn?.addEventListener('click', () => setModal(false));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) setModal(false);
    });

    document.addEventListener('keydown', (e) => {
        const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || '');
        if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setModal(modal?.hidden);
        } else if (e.key === 'Escape' && modal && !modal.hidden) {
            setModal(false);
        }
    });
})();
