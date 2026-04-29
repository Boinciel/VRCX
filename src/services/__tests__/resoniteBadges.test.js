import { afterEach, describe, expect, test } from 'vitest';

import {
    clearResoniteBadgeResolverCache,
    resolveResoniteBadges
} from '../resoniteBadges';

afterEach(() => {
    clearResoniteBadgeResolverCache();
});

describe('resolveResoniteBadges', () => {
    test('resolves known tag badges to assets.resonite.com URLs', () => {
        const badges = resolveResoniteBadges({
            tags: [
                'potato',
                'supporter',
                '[linux]',
                'mmc25 participant',
                'vfe22'
            ]
        });

        expect(badges).toHaveLength(5);
        expect(badges.map((badge) => badge.label)).toEqual([
            'Potato',
            'Supporter',
            'Linux',
            'MMC25 Participant',
            'Virtual Furnal Equinox 2022'
        ]);
        expect(
            badges.every((badge) =>
                badge.imageUrl.startsWith('https://assets.resonite.com/')
            )
        ).toBe(true);
    });

    test('derives registration year and Bread Day badges from registrationDate', () => {
        const badges = resolveResoniteBadges({
            registrationDate: '2023-04-27T12:00:00.000Z',
            now: new Date('2026-04-27T08:00:00.000Z')
        });

        expect(badges.map((badge) => badge.label)).toEqual([
            '2023 Dawn Spire',
            'Baguette'
        ]);
        expect(
            badges.every((badge) =>
                badge.imageUrl.startsWith('https://assets.resonite.com/')
            )
        ).toBe(true);
    });

    test('keeps unknown tags with text fallback and no image', () => {
        const badges = resolveResoniteBadges({
            tags: ['some unknown event tag']
        });

        expect(badges).toEqual([
            {
                id: 'tag:some unknown event tag',
                key: 'some unknown event tag',
                source: 'tag',
                tag: 'some unknown event tag',
                label: 'some unknown event tag',
                assetUri: '',
                imageUrl: '',
                isKnown: false
            }
        ]);
    });

    test('resolves pride tags with the pride prefix to documented badge assets', () => {
        const badges = resolveResoniteBadges({
            tags: [
                'pride transgender',
                'pride asexual',
                'pride intersexprogress'
            ]
        });

        expect(badges).toHaveLength(3);
        expect(badges.map((badge) => badge.label)).toEqual([
            'Transgender pride flag',
            'Asexual',
            'Intersex Inclusive Progress'
        ]);
        expect(badges.map((badge) => badge.imageUrl)).toEqual([
            'https://assets.resonite.com/2f6dd9b4495d4709df522aa720fdb305797c4c024eeb07414ee2386b253ecacd',
            'https://assets.resonite.com/9626de7c84f7c4e20f8bc2ea1a30649ae071bf463250d85d8dc18872c49ff134',
            'https://assets.resonite.com/620b302e3c8d980ba7f92e71abe465cd01b0e77fe959b93444b1f3c0d38bc668'
        ]);
    });

    test('resolves additional documented event, fruit, and retired badges', () => {
        const badges = resolveResoniteBadges({
            tags: [
                'festa4 participant',
                'unifesta2024 participant',
                'lbe competition 2025',
                'vket24 participant',
                'orange',
                'patreon supporter'
            ]
        });

        expect(badges).toHaveLength(6);
        expect(badges.map((badge) => badge.label)).toEqual([
            'Festa 4 Participant',
            'UniFesta2024 Participant',
            'LBE Competition 2025',
            'VKet 2024',
            'Orange',
            'Patreon Supporter'
        ]);
        expect(
            badges.every((badge) =>
                badge.imageUrl.startsWith('https://assets.resonite.com/')
            )
        ).toBe(true);
    });

    test('resolves newly observed event tags with documented images or text fallbacks', () => {
        const badges = resolveResoniteBadges({
            tags: [
                'mmc24 participant',
                'mmc24 honorable mention',
                'unifesta 2024 participant',
                'mmc25 world',
                'mmc25 gifty',
                'halloween24 participant',
                'halloween25 participant',
                'MMC26 Gifty',
                'mmc26 participant',
                'mmc26 art'
            ]
        });

        expect(badges.map((badge) => badge.label)).toEqual([
            'MMC24 Participant',
            'MMC24 Honorable Mention',
            'UniFesta2024 Participant',
            'MMC25 World',
            'MMC25 Gifty',
            'Halloween24 Participant',
            'Halloween25 Participant',
            'MMC26 Gifty',
            'MMC26 Participant',
            'MMC26 Art'
        ]);
        expect(badges.map((badge) => badge.imageUrl)).toEqual([
            'https://media.wiki.resonite.com/9/91/MMC24-Participation.png',
            'https://media.wiki.resonite.com/b/bb/MMC24-HonorableMention.png',
            'https://assets.resonite.com/0a2665175e528c1887bff6b63c2729a64cdf37a7ffedef2784feba41af1999be',
            'https://media.wiki.resonite.com/2/2b/MMC25-World.png',
            '',
            '',
            '',
            '',
            '',
            ''
        ]);
    });

    test('resolves custom badge hashes to direct Resonite asset URLs', () => {
        const badges = resolveResoniteBadges({
            tags: [
                'custom badge:453d0a57159437f866d21e89ecb41e1ea290ca4daab0c55a0c32b5a2af19dce2'
            ]
        });

        expect(badges).toEqual([
            expect.objectContaining({
                source: 'tag',
                label: 'Custom Badge',
                assetUri:
                    'resdb:///453d0a57159437f866d21e89ecb41e1ea290ca4daab0c55a0c32b5a2af19dce2',
                imageUrl:
                    'https://assets.resonite.com/453d0a57159437f866d21e89ecb41e1ea290ca4daab0c55a0c32b5a2af19dce2',
                isKnown: true
            })
        ]);
    });

    test('prioritizes profile display badges and dedupes repeated tag entries', () => {
        const badges = resolveResoniteBadges({
            tags: ['potato', 'Potato', 'potato'],
            displayBadges: [
                {
                    id: 'custom-1',
                    ownerId: 'U-custom',
                    enabled: true,
                    name: 'Custom Contributor',
                    assetUrl: 'resdb:///0123456789abcdef0123456789abcdef.png'
                }
            ]
        });

        expect(badges).toHaveLength(2);
        expect(badges[0]).toMatchObject({
            source: 'display',
            label: 'Custom Contributor',
            imageUrl:
                'https://assets.resonite.com/0123456789abcdef0123456789abcdef'
        });
        expect(badges[1]).toMatchObject({
            source: 'tag',
            key: 'potato'
        });
    });

    test('ignores unsupported display badges that omit explicit asset url fields', () => {
        const badges = resolveResoniteBadges({
            displayBadges: [
                {
                    id: 'custom:fedcba9876543210fedcba9876543210',
                    name: 'Custom Badge'
                }
            ]
        });

        expect(badges).toEqual([]);
    });

    test('keeps inventory-backed custom 3D badges when only a badge path is available', () => {
        const badges = resolveResoniteBadges({
            displayBadges: [
                {
                    id: 'custom 3D badge:G-Resonite/Inventory/3D_Badges/Patreon/TheHoneybee',
                    name: 'Custom 3D Badge',
                    badgeType: '3D'
                }
            ]
        });

        expect(badges).toEqual([
            expect.objectContaining({
                source: 'display',
                label: 'TheHoneybee',
                imageUrl: '',
                inventoryOwnerId: 'G-Resonite',
                inventoryPath: 'Inventory\\3D_Badges\\Patreon\\TheHoneybee',
                badgeType: '3d',
                isKnown: true
            })
        ]);
    });

    test('supports shipped BadgeDefinition field names and ignores disabled badges', () => {
        const badges = resolveResoniteBadges({
            displayBadges: [
                {
                    id: 'team-badge',
                    ownerId: 'U-Resonite',
                    enabled: false,
                    assetURL:
                        'resdb:///da11582c477cfd9afd957268c72961cca4130f64bea8440e381840425c898078.png',
                    badgeType: 'static2D',
                    name: 'Team',
                    description: 'Resonite Team'
                },
                {
                    id: 'custom-pixel',
                    ownerId: 'U-custom',
                    enabled: true,
                    assetURL: 'resdb:///0123456789abcdef0123456789abcdef.png',
                    badgeType: 'static2D',
                    pointFiltering: true,
                    name: 'Pixel Badge',
                    description: 'Custom pixel badge'
                }
            ]
        });

        expect(badges).toHaveLength(1);
        expect(badges[0]).toMatchObject({
            source: 'display',
            ownerId: 'U-custom',
            badgeType: 'static2d',
            pointFiltering: true,
            label: 'Pixel Badge',
            description: 'Custom pixel badge',
            imageUrl:
                'https://assets.resonite.com/0123456789abcdef0123456789abcdef'
        });
    });
});
