import { renderResoniteRichText } from '../../shared/utils/resoniteRichText';

export function isResoniteFeedLocation(entry) {
    const provider = String(entry?.provider || '').trim();
    const userId = String(entry?.userId || '').trim();

    return provider === 'resonite' || userId.startsWith('resonite:');
}

export function renderFeedLocationRichText(location, worldName = '') {
    return renderResoniteRichText(String(worldName || location || '').trim());
}
