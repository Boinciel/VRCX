import { describe, expect, test } from 'vitest';

import {
    isResoniteFeedLocation,
    renderFeedLocationRichText
} from '../feedLocation';

describe('feedLocation helpers', () => {
    test('detects Resonite feed entries', () => {
        expect(isResoniteFeedLocation({ provider: 'resonite' })).toBe(true);
        expect(isResoniteFeedLocation({ userId: 'resonite:U-123' })).toBe(true);
        expect(isResoniteFeedLocation({ provider: 'vrchat' })).toBe(false);
        expect(isResoniteFeedLocation({})).toBe(false);
    });

    test('renders Resonite rich text for feed locations', () => {
        expect(
            renderFeedLocationRichText(
                'worlds/<color=blue>TMSC<color=purple> Zutyo <color=red>Home'
            )
        ).toContain(
            'worlds/<span style="color:#0000ff">TMSC<span style="color:#8000ff"> Zutyo <span style="color:#ff0000">Home</span></span></span>'
        );
    });

    test('prefers worldName when provided', () => {
        expect(
            renderFeedLocationRichText('private', '<color=green>Session Name')
        ).toContain('<span style="color:#00ff00">Session Name</span>');
    });
});
