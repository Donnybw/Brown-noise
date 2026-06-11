// Formatting helpers and clipboard utility.
// Extracted from app.js during the modular refactor (no behavior changes).

export function formatFeet(feet) {
    if (!Number.isFinite(feet)) return '--';
    return `${feet.toFixed(1)} ft`;
}

export function formatFeetInches(feet) {
    if (!Number.isFinite(feet)) return '--';
    const sign = feet < 0 ? '-' : '';
    const absFeet = Math.abs(feet);
    const totalInches = Math.round(absFeet * 12);
    const ft = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${sign}${ft}' ${inches}"`;
}

export function formatFeetCompactNumber(feet, decimals = 1) {
    if (!Number.isFinite(feet)) return '--';
    const factor = 10 ** decimals;
    const rounded = Math.round(feet * factor) / factor;
    const asInt = Math.round(rounded);
    if (Math.abs(rounded - asInt) < 1e-9) return String(asInt);
    return rounded.toFixed(decimals);
}

export function formatDimensionArrowText(value, axis) {
    if (!Number.isFinite(value)) return '';
    const n = Math.round(value);
    if (!Number.isFinite(n)) return '';
    const ax = axis?.x ?? 1;
    const ay = axis?.y ?? 0;
    const isVertical = Math.abs(ay) > Math.abs(ax);
    return isVertical ? `↑\n${n}\n↓` : `←${n}→`;
}

export async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', 'true');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            return true;
        } catch (e2) {
            return false;
        }
    }
}

