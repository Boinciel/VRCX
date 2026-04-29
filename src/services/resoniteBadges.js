const RESONITE_ASSET_BASE_URL = 'https://assets.resonite.com/';

const REGISTRATION_YEAR_BADGES = Object.freeze({
    2018: {
        label: '2018 Spark',
        assetUri:
            'resdb:///758f482be4799543d4399ca3602dd15e1cccc8895d681730fe3a8be2d10e1e40.png'
    },
    2019: {
        label: '2019 Flame',
        assetUri:
            'resdb:///8dec49b9f77d631607223dd0dd9f47817a7f34b508e9f4a2c97a601b9e36103f.png'
    },
    2020: {
        label: '2020 Bonfire',
        assetUri:
            'resdb:///e829026c8bc2d7e0b98da11757289f9ec85261cd1d97c8863e353246204fbce9.png'
    },
    2021: {
        label: '2021 Firework',
        assetUri:
            'resdb:///aed9b3fadec212ed91eb5c0ff81d2ec9e9ba017ea3ab58587c8c654d5405d43e.png'
    },
    2022: {
        label: '2022 Snowflake',
        assetUri:
            'resdb:///36a607c8b4c0f26624300d55462892ceb0999dcfc17e4fd7abebbf66f5a7af78.png'
    },
    2023: {
        label: '2023 Dawn Spire',
        assetUri:
            'resdb:///af48a3afdf433f3f33ea532028a9a7ccf82f2504231a27edf0593b33814c3899.png'
    }
});

const BREAD_DAY_BADGE = Object.freeze({
    label: 'Baguette',
    assetUri:
        'resdb:///1e836cc2cdf38f588aac629aa51e3ad5ac8db5b22ee4a3247e7e10a6826ea482.png'
});

const DOCUMENTED_BADGES = Object.freeze([
    {
        keys: ['vblfc 2021', 'vblfc2021'],
        label: 'VBLFC 2021',
        assetUri:
            'resdb:///a3a9380f5e4b97b686dbc64e30fd7eae6ff325eb00eba785c1646df5d451431f.png'
    },
    {
        keys: ['festa 3 ambassador', 'festa3 ambassador'],
        label: 'Festa 3 Ambassador',
        assetUri:
            'resdb:///8f329d39f0f6c4778afe7dd1f2c85461cfd0c57a79ebdbe648cfb5de797261b1.png'
    },
    {
        keys: ['festa 3 participant', 'festa3 participant'],
        label: 'Festa 3 Participant',
        assetUri:
            'resdb:///db19e650645cc15516a4e95f02253e3aefd7bd2a9ffeb838d95a08d9eb4334f1.png'
    },
    {
        keys: ['festa 4 ambassador', 'festa4 ambassador'],
        label: 'Festa 4 Ambassador',
        assetUri:
            'resdb:///23f645e2084a43d7c96fb1fd7cb9f732faa66baa703ac128f3796c974e3f5bb8.png'
    },
    {
        keys: ['festa 4 participant', 'festa4 participant'],
        label: 'Festa 4 Participant',
        assetUri:
            'resdb:///b3e14476da9ee56a2bfd618e3281b7314999797ba654eabb0588852ee1ef04aa.png'
    },
    {
        keys: ['unifesta idea participant', 'unifestaidea participant'],
        label: 'UniFesta Idea Participant',
        assetUri:
            'resdb:///fa88adba5c5c3910052ec801852ed56138ac606b45e66a5f4f51a02af032166e.png'
    },
    {
        keys: ['unifesta2024 ambassador', 'uni festa 2024 ambassador'],
        label: 'UniFesta2024 Ambassador',
        assetUri:
            'resdb:///b50d3e85bee612408dd17afc58a2b99f3785599984dc796bbf82d35889eca483.png'
    },
    {
        keys: [
            'unifesta2024 participant',
            'unifesta 2024 participant',
            'uni festa 2024 participant'
        ],
        label: 'UniFesta2024 Participant',
        assetUri:
            'resdb:///0a2665175e528c1887bff6b63c2729a64cdf37a7ffedef2784feba41af1999be.png'
    },
    {
        keys: ['lbe competition 2025', 'lbecompetition2025'],
        label: 'LBE Competition 2025',
        assetUri:
            'resdb:///eaf36b29d1c728a91ed8c22ec7735b2b9f42804c6d19699ac1cf054fd08b61e8.png'
    },
    {
        keys: ['orange'],
        label: 'Orange',
        assetUri:
            'resdb:///54d578102c1b23cfd3d99aa7afeea5e8e3dfb20466ca8ae6ee29d6ef69d2f564.png'
    },
    {
        keys: ['blueberry'],
        label: 'Blueberry',
        assetUri:
            'resdb:///b1eb93861c2ab23510f3c525c2bbc69be5371a1715e80cd1880e8c771ac8bbf1.png'
    },
    {
        keys: ['mango'],
        label: 'Mango',
        assetUri:
            'resdb:///77cae650f07d32a36b31d1af896bc666eecbfdba5c37aecb869c982b2678ebda.png'
    },
    {
        keys: ['patreon supporter'],
        label: 'Patreon Supporter',
        assetUri:
            'resdb:///1489377b6ab624f50ff7aa1a8651ead76c85792dc395f8bca1e2d3459bdb6c76.png'
    }
]);

const PRIDE_BADGES = Object.freeze([
    {
        key: 'aegosexual',
        label: 'Aegosexual',
        assetUri:
            'resdb:///769485d31a479c68498c5eca7da554b77da5a112732929deef8096301fe346f6.png'
    },
    {
        key: 'agender',
        label: 'Agender',
        assetUri:
            'resdb:///297be8fcbdd068ae455cfcb2dc38bca3b9200f754dd0933bab91dc26fdc3a285.png'
    },
    {
        key: 'aroace',
        label: 'Aroace',
        assetUri:
            'resdb:///570faae678b96aa12997cdc0a9e3de2206443eaf974e56fc01732bc67b7f3909.png'
    },
    {
        key: 'aromantic',
        label: 'Aromantic',
        assetUri:
            'resdb:///5c590e5a043f1742043b5a1fdd36d13e0595fa2aed48837034df9cf23a030301.png'
    },
    {
        key: 'asexual',
        label: 'Asexual',
        assetUri:
            'resdb:///9626de7c84f7c4e20f8bc2ea1a30649ae071bf463250d85d8dc18872c49ff134.png'
    },
    {
        key: 'bigender',
        label: 'Bigender',
        assetUri:
            'resdb:///63ab831861ec0070f21a610014f5c7512a38248610da2bd8507b6f4406f3a263.png'
    },
    {
        key: 'bisexual',
        label: 'Bisexual',
        assetUri:
            'resdb:///9857be8f5f4c07b6e87d1afeccefed6207041104a4a817b91a2eebc59fc55617.png'
    },
    {
        key: 'demigender',
        label: 'Demigender',
        assetUri:
            'resdb:///4fedb1ee4d04a857b93d59654708731bb2e509484cdb6acff3c3428ddcbf67d0.png'
    },
    {
        key: 'demisexual',
        label: 'Demisexual',
        assetUri:
            'resdb:///1d91263dab15f808f63c12465e2cc47aaad63604f87c031a4915cbac6583c235.png'
    },
    {
        key: 'genderfluid',
        label: 'Genderfluid',
        assetUri:
            'resdb:///d3e565d1a0171e2e56a2941f089780ebcdad09932902bffd2becb0fe670759b5.png'
    },
    {
        key: 'genderqueer',
        label: 'Genderqueer',
        assetUri:
            'resdb:///7949039b81a3f03e009a24f06bae7754f317b78a0fb1d9f218a42f1466b8c63c.png'
    },
    {
        key: 'gilbertbaker',
        label: 'GilbertBaker',
        assetUri:
            'resdb:///85646735020bfd453c66d79eaf4d67f70977fa9f0483d1eef5e7eded740d461f.png'
    },
    {
        key: 'graysexual',
        label: 'Graysexual',
        assetUri:
            'resdb:///dc3b38d5aa52fb14b1e27e8d663d0634272616bf476c14cf216752e12fecfa10.png'
    },
    {
        key: 'intersex',
        label: 'Intersex',
        assetUri:
            'resdb:///0d68100934e9bfc5ca3d54200554f2d970ec2ef16a09a6921c42426929ca3464.png'
    },
    {
        key: 'intersexprogress',
        label: 'Intersex Inclusive Progress',
        assetUri:
            'resdb:///620b302e3c8d980ba7f92e71abe465cd01b0e77fe959b93444b1f3c0d38bc668.png'
    },
    {
        key: 'lesbian',
        label: 'Lesbian',
        assetUri:
            'resdb:///338f7d2be0bebda0c3259aaee9c9a9b169e9709bace9f7450a80f803bdcc79da.png'
    },
    {
        key: 'nonbinary',
        label: 'Nonbinary',
        assetUri:
            'resdb:///073cbb69d17602f80db0de3d2e57e0bb6cf050e83ed8e3da5545ced8e759f45c.png'
    },
    {
        key: 'pansexual',
        label: 'Pansexual',
        assetUri:
            'resdb:///cbad0c44666bf0e296009728fde15d896a4501cfa72d0707ae5007f32701a1af.png'
    },
    {
        key: 'philadelphia',
        label: 'Philadelphia',
        assetUri:
            'resdb:///ab8d4da13ae4e7a943d16adf0366edc71e84b2cd4a0a0cb5a42aed5e158b4e6d.png'
    },
    {
        key: 'polyamory',
        label: 'Polyamory',
        assetUri:
            'resdb:///bb93292e28191128224f04cc08cb9dddb718f83cce1308daabc71dcbe90888fc.png'
    },
    {
        key: 'polysexual',
        label: 'Polysexual',
        assetUri:
            'resdb:///11af349f00b85b494096e3cef204570345e81ba4a7d872ab5d2ab361ade958cb.png'
    },
    {
        key: 'progress',
        label: 'Progress',
        assetUri:
            'resdb:///737eb782d38415986f1d00cab50a49f471488c04204030b1909971dfa9c3d99e.png'
    },
    {
        key: 'queer',
        label: 'Queer',
        assetUri:
            'resdb:///3740560694e95f46acab5a55e38725e7300398a5911a956138a87d9f2f516236.png'
    },
    {
        key: 'queerpeopleofcolor',
        label: 'Queer people of color',
        assetUri:
            'resdb:///f9ef99e54d0207f76feff1e65d301fbc5029a236ab7fa06ba88598b909ccc852.png'
    },
    {
        key: 'straightally',
        label: 'Straight Ally',
        assetUri:
            'resdb:///9013e041e2051e6f7494fb911f90f449e2dd3130a9307061383c201d2cde04a9.png'
    },
    {
        key: 'traditional',
        label: 'Traditional pride flag',
        assetUri:
            'resdb:///e3e7903309aac2692d04daf9ed46ebf8b438353aef02df5b5f3bb75240aa8156.png'
    },
    {
        key: 'transfeminine',
        label: 'Transfeminine pride flag',
        assetUri:
            'resdb:///13dcfcd37ca50678c2a2760ccc7194dc9bae66046f4633367bb3c83472cecc2a.png'
    },
    {
        key: 'transgender',
        label: 'Transgender pride flag',
        assetUri:
            'resdb:///2f6dd9b4495d4709df522aa720fdb305797c4c024eeb07414ee2386b253ecacd.png'
    },
    {
        key: 'transinclusivegaymen',
        label: 'Trans Inclusive Gay Mens pride flag',
        assetUri:
            'resdb:///d70dd654b10126b4fe93365dfe6ad78a9faf63194c7974d5b757cd4dd5e5c8fe.png'
    },
    {
        key: 'transmasculine',
        label: 'Transmasculine pride flag',
        assetUri:
            'resdb:///9675c4cce538300d7df6cbb340c4fd1d7db6bfd4bb861e8fb2e5e9aea800430c.png'
    },
    {
        key: 'twospirit',
        label: 'Two Spirit pride flag',
        assetUri:
            'resdb:///b2fd0fa3988c33293d8d4a1320be99b12aab02d75ee47d31076a860628138206.png'
    }
]);

const tagResolutionCache = new Map();
const knownBadgesByKey = Object.freeze(buildKnownBadgeMap());

function buildKnownBadgeMap() {
    const map = Object.create(null);

    addKnownBadge(
        map,
        ['potato'],
        'Potato',
        'resdb:///adf9ba7eee98dfa36e8fcf4130f2d6e60d353566c9f315c0f28a000dd06cad2c.png'
    );
    addKnownBadge(
        map,
        ['host', '[host]'],
        'Host',
        'resdb:///cef8313f2418512a52c718a505c8882684dfa6556bdf2af1da655d3e6a0f878e.png'
    );
    addKnownBadge(
        map,
        ['supporter', '[supporter]'],
        'Supporter',
        'resdb:///ef12d18cf37c0255ccae7ca1bf8d2856ed2d9d10f364ffd33cf1782a3143f0fc.png'
    );
    addKnownBadge(
        map,
        ['team', 'team member', 'resonite team'],
        'Team',
        'resdb:///da11582c477cfd9afd957268c72961cca4130f64bea8440e381840425c898078.png'
    );
    addKnownBadge(
        map,
        ['moderator'],
        'Moderator',
        'resdb:///43b2368b3779c9413d24ba77ec9a9e00fce4d16e021e386941cde3247bdd1aa5.png'
    );
    addKnownBadge(
        map,
        ['mentor'],
        'Mentor',
        'resdb:///b765be132f8ddce120665b531ce8874fd2034529103ca72b0de9dfa896dfc9fc.png'
    );
    addKnownBadge(
        map,
        ['translator'],
        'Translator',
        'resdb:///76152d6d2f7e125620ae7138c66a8d0408ebed45580bea727c6a673b325f2311.png'
    );
    addKnownBadge(
        map,
        ['htc ambassador'],
        'HTC Ambassador',
        'resdb:///f92c0a3e31882b8075081dfa2d0f4d3403b89422ccebf75acaf6cb8947f51175.png'
    );
    addKnownBadge(
        map,
        ['durian tester'],
        'Durian Tester',
        'resdb:///1c62e8c224af005c9293bc636dd3e93e8f6d2aba202287cf40cbcfe1259129d4.png'
    );

    addKnownBadge(
        map,
        ['linux', '[linux]'],
        'Linux',
        'resdb:///0a1ffbeb7be0b7378dd22e9e03696d826a2a19441aba7a2f541fa46a634726bc.png'
    );
    addKnownBadge(
        map,
        ['headless', '[headless]'],
        'Headless',
        'resdb:///2352f95409ee80e7a12d6ccb0e253aee2794673d2bd0db83fb5e4d4ea6eb17a2.png'
    );
    addKnownBadge(
        map,
        ['mobile', '[mobile]', 'android'],
        'Mobile',
        'resdb:///8d5159ddf47538624b3e39c820607da8af81ac962db2a8898cbc7204f2cd91e0.png'
    );

    addKnownBadge(
        map,
        ['hearing impaired', 'hearingimpaired'],
        'Hearing Impaired',
        'resdb:///b079a1bc258fd2bf2e56eefd88a0a1af04c47fe3dfed090fedfe04da523cab42.png'
    );
    addKnownBadge(
        map,
        ['color blind', 'colorblind'],
        'Color Blind',
        'resdb:///b079a1bc258fd2bf2e56eefd88a0a1af04c47fe3dfed090fedfe04da523cab42.png'
    );
    addKnownBadge(
        map,
        ['speech impaired', 'mute'],
        'Speech Impaired',
        'resdb:///89dcd8ab20fe52f799309e01b4a64a4f055bb864dd68ae52bce4382c0d1ea3b7.png'
    );
    addKnownBadge(
        map,
        ['vision impaired', 'visually impaired', 'visuallyimpaired'],
        'Vision Impaired',
        'resdb:///b4e2da97dd3ccc2d49da3bb3adbb7f3fe575d133537dce5aea931e7a75c25926.png'
    );

    addKnownBadge(
        map,
        ['baguette', '[baguette]', 'bread day'],
        BREAD_DAY_BADGE.label,
        BREAD_DAY_BADGE.assetUri
    );

    for (const [year, badge] of Object.entries(REGISTRATION_YEAR_BADGES)) {
        addKnownBadge(
            map,
            [year, `[${year}]`, badge.label],
            badge.label,
            badge.assetUri
        );
    }

    addKnownBadge(
        map,
        ['vfe22', 'vfe 2022', 'virtual furnal equinox 2022'],
        'Virtual Furnal Equinox 2022',
        'resdb:///d9654f19b527972427b4793fdfbad8abb680a1f159dd2e80ce1b35cf27590237.png'
    );
    addKnownBadge(
        map,
        [
            'vket 2024',
            'vket2024',
            'vket24',
            'vket24 participant',
            'vket 24 participant'
        ],
        'VKet 2024',
        'resdb:///c5c2029730efdf65b1eeed61dcc40103b16d10c2c42b76226593dd77b8dd193e.png'
    );
    addKnownBadge(
        map,
        ['vr jmof 2025', 'vrjmof2025'],
        'VR JMOF 2025',
        'resdb:///057beb177e1519bb6cd0cf37e961117b9739e966ee5ab5b4b9415aa33eb71660.png'
    );
    // NOTE: wiki links are placeholders until resdb links are known
    addKnownBadge(
        map,
        ['mmc24 participant', 'mmc 24 participant'],
        'MMC24 Participant',
        '',
        'https://media.wiki.resonite.com/9/91/MMC24-Participation.png'
    );
    addKnownBadge(
        map,
        ['mmc24 honorable mention', 'mmc 24 honorable mention'],
        'MMC24 Honorable Mention',
        '',
        'https://media.wiki.resonite.com/b/bb/MMC24-HonorableMention.png'
    );
    addKnownBadge(
        map,
        ['mmc25 participant', 'mmc 25 participant'],
        'MMC25 Participant',
        'resdb:///d18570e373b1b2ad96a0be5bd0e3b38632f40df61fa82e5ff6bb9fd534c0e98e.png'
    );
    addKnownBadge(
        map,
        ['mmc25 world', 'mmc 25 world'],
        'MMC25 World',
        '',
        'https://media.wiki.resonite.com/2/2b/MMC25-World.png'
    );
    addKnownBadge(map, ['mmc25 gifty', 'mmc 25 gifty'], 'MMC25 Gifty', '');
    addKnownBadge(
        map,
        [
            'halloween24 participant',
            'halloween 24 participant',
            'halloween 2024 participant'
        ],
        'Halloween24 Participant',
        ''
    );
    addKnownBadge(
        map,
        [
            'halloween25 participant',
            'halloween 25 participant',
            'halloween 2025 participant'
        ],
        'Halloween25 Participant',
        ''
    );
    addKnownBadge(map, ['mmc26 gifty', 'mmc 26 gifty'], 'MMC26 Gifty', '');
    addKnownBadge(
        map,
        ['mmc26 participant', 'mmc 26 participant'],
        'MMC26 Participant',
        ''
    );
    addKnownBadge(map, ['mmc26 art', 'mmc 26 art'], 'MMC26 Art', '');

    for (const badge of DOCUMENTED_BADGES) {
        addKnownBadge(map, badge.keys, badge.label, badge.assetUri);
    }

    for (const badge of PRIDE_BADGES) {
        addKnownBadge(
            map,
            [
                badge.key,
                `pride ${badge.key}`,
                badge.label,
                `pride ${badge.label.toLowerCase()}`
            ],
            badge.label,
            badge.assetUri
        );
    }

    return map;
}

function addKnownBadge(map, keys, label, assetUri, imageUrl = '') {
    const entry = Object.freeze({
        label,
        assetUri: String(assetUri || '').trim(),
        imageUrl: firstNonEmptyString(
            imageUrl,
            assetUri ? convertResoniteAssetUrl(assetUri) : ''
        )
    });
    for (const key of keys) {
        const normalizedKey = normalizeTagKey(key);
        if (normalizedKey) {
            map[normalizedKey] = entry;
        }
    }
}

function firstNonEmptyString(...values) {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (normalized) {
            return normalized;
        }
    }

    return '';
}

function normalizeTagKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function convertResoniteAssetUrl(url) {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) {
        return '';
    }

    const resdbMatch = normalizedUrl.match(
        /^resdb:\/\/(?:(?:\/)?)([a-f0-9]{32,})(?:\.[a-z0-9]+)?$/i
    );
    if (resdbMatch) {
        return `${RESONITE_ASSET_BASE_URL}${resdbMatch[1]}`;
    }

    const assetsMatch = normalizedUrl.match(
        /^https:\/\/assets\.resonite\.com\/([a-f0-9]{32,})(?:\.[a-z0-9]+)?$/i
    );
    if (assetsMatch) {
        return `${RESONITE_ASSET_BASE_URL}${assetsMatch[1]}`;
    }

    return normalizedUrl;
}

function parseCustomTagBadge(tag) {
    const displayName = String(tag || '').trim();
    const match = displayName.match(
        /^custom\s+badge\s*:\s*([a-f0-9]{32,})(?:\.[a-z0-9]+)?$/i
    );
    if (!match) {
        return null;
    }

    const assetUri = `resdb:///${match[1]}`;
    return {
        label: 'Custom Badge',
        assetUri,
        imageUrl: convertResoniteAssetUrl(assetUri)
    };
}

function createTagBadge(tag) {
    const key = normalizeTagKey(tag);
    const displayName = String(tag || '').trim();
    const knownBadge = knownBadgesByKey[key] || null;
    const customBadge = parseCustomTagBadge(displayName);
    const assetUri = firstNonEmptyString(
        knownBadge?.assetUri,
        customBadge?.assetUri
    );
    const imageUrl = firstNonEmptyString(
        knownBadge?.imageUrl,
        assetUri ? convertResoniteAssetUrl(assetUri) : '',
        customBadge?.imageUrl
    );

    return {
        id: `tag:${key}`,
        key,
        source: 'tag',
        tag: displayName,
        label: firstNonEmptyString(
            knownBadge?.label,
            customBadge?.label,
            displayName
        ),
        assetUri,
        imageUrl,
        isKnown: Boolean(knownBadge || customBadge?.imageUrl)
    };
}

function resolveTagBadge(tag) {
    const key = normalizeTagKey(tag);
    if (!key) {
        return null;
    }

    const cached = tagResolutionCache.get(key);
    if (cached) {
        return cached;
    }

    const resolved = createTagBadge(tag);
    tagResolutionCache.set(key, resolved);
    return resolved;
}

function extractDisplayBadgePreviewUrl(displayBadge) {
    return firstNonEmptyString(
        displayBadge?.thumbnailUrl,
        displayBadge?.thumbnailURL,
        displayBadge?.ThumbnailUrl,
        displayBadge?.ThumbnailURL,
        displayBadge?.thumbnailUri,
        displayBadge?.thumbnailURI,
        displayBadge?.ThumbnailUri,
        displayBadge?.ThumbnailURI,
        displayBadge?.imageUrl,
        displayBadge?.imageURL,
        displayBadge?.ImageUrl,
        displayBadge?.ImageURL,
        displayBadge?.iconUrl,
        displayBadge?.iconURL,
        displayBadge?.IconUrl,
        displayBadge?.IconURL,
        displayBadge?.previewUrl,
        displayBadge?.previewURL,
        displayBadge?.PreviewUrl,
        displayBadge?.PreviewURL
    );
}

function extractDisplayBadgeInventoryReference(displayBadge) {
    const candidates = [
        displayBadge?.inventoryPath,
        displayBadge?.InventoryPath,
        displayBadge?.badgeUrl,
        displayBadge?.badgeURL,
        displayBadge?.BadgeUrl,
        displayBadge?.BadgeURL,
        displayBadge?.url,
        displayBadge?.URL,
        displayBadge?.Url,
        displayBadge?.id,
        displayBadge?.Id,
        displayBadge?.badgeId,
        displayBadge?.BadgeId,
        displayBadge?.name,
        displayBadge?.label,
        displayBadge?.Name,
        displayBadge?.Label
    ];

    for (const candidate of candidates) {
        const normalizedCandidate = String(candidate || '').trim();
        if (!normalizedCandidate) {
            continue;
        }

        const match = normalizedCandidate.match(
            /([UG]-[A-Za-z0-9._-]+)[\\/](Inventory(?:[\\/][^\\/?#:*"<>|]+)+)/i
        );
        if (!match) {
            continue;
        }

        return {
            inventoryOwnerId: match[1],
            inventoryPath: match[2]
                .replace(/[\\/]+/g, '\\')
                .replace(/^\\+|\\+$/g, '')
        };
    }

    return {
        inventoryOwnerId: '',
        inventoryPath: ''
    };
}

function inferInventoryBadgeLabel(inventoryPath) {
    const segments = String(inventoryPath || '')
        .split(/[\\/]+/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    return segments.length > 0 ? segments[segments.length - 1] : '';
}

function looksLikeGenericCustomBadgeLabel(label) {
    return /^custom(?:\s+[23]d)?\s+badge(?::.*)?$/i.test(
        String(label || '').trim()
    );
}

function resolveDerivedBadges({
    registrationDate = '',
    now = new Date()
} = {}) {
    const parsedRegistrationDate = new Date(
        String(registrationDate || '').trim()
    );
    if (Number.isNaN(parsedRegistrationDate.getTime())) {
        return [];
    }

    const results = [];
    const registrationYear = parsedRegistrationDate.getUTCFullYear();
    const registrationYearBadge =
        REGISTRATION_YEAR_BADGES[registrationYear] || null;

    if (registrationYearBadge) {
        results.push({
            id: `derived:registration-year:${registrationYear}`,
            key: `derived:registration-year:${registrationYear}`,
            source: 'derived',
            tag: '',
            label: registrationYearBadge.label,
            assetUri: registrationYearBadge.assetUri,
            imageUrl: convertResoniteAssetUrl(registrationYearBadge.assetUri),
            isKnown: true
        });
    }

    const currentDate = now instanceof Date ? now : new Date(now);
    if (!Number.isNaN(currentDate.getTime())) {
        const sameMonth =
            parsedRegistrationDate.getUTCMonth() === currentDate.getUTCMonth();
        const sameDay =
            parsedRegistrationDate.getUTCDate() === currentDate.getUTCDate();

        if (sameMonth && sameDay) {
            results.push({
                id: 'derived:bread-day',
                key: 'derived:bread-day',
                source: 'derived',
                tag: '',
                label: BREAD_DAY_BADGE.label,
                assetUri: BREAD_DAY_BADGE.assetUri,
                imageUrl: convertResoniteAssetUrl(BREAD_DAY_BADGE.assetUri),
                isKnown: true
            });
        }
    }

    return results;
}

function resolveDisplayBadge(displayBadge, index) {
    if (displayBadge?.enabled === false) {
        return null;
    }

    const rawLabel = firstNonEmptyString(
        displayBadge?.name,
        displayBadge?.label,
        displayBadge?.Name,
        displayBadge?.Label
    );
    const assetUri = firstNonEmptyString(
        displayBadge?.assetUrl,
        displayBadge?.assetURL,
        displayBadge?.AssetURL,
        displayBadge?.assetUri,
        displayBadge?.AssetUri
    );
    const previewUrl = extractDisplayBadgePreviewUrl(displayBadge);
    const imageUrl = convertResoniteAssetUrl(
        firstNonEmptyString(assetUri, previewUrl)
    );
    const { inventoryOwnerId, inventoryPath } =
        extractDisplayBadgeInventoryReference(displayBadge);

    if (!assetUri && !imageUrl && !inventoryPath) {
        return null;
    }

    const id = firstNonEmptyString(displayBadge?.id, `display:${index}`);
    const inferredInventoryLabel = inferInventoryBadgeLabel(inventoryPath);
    const label = looksLikeGenericCustomBadgeLabel(rawLabel)
        ? firstNonEmptyString(inferredInventoryLabel, rawLabel)
        : firstNonEmptyString(rawLabel, inferredInventoryLabel);

    if (!label && !imageUrl && !inventoryPath) {
        return null;
    }

    const ownerId = firstNonEmptyString(
        displayBadge?.ownerId,
        displayBadge?.OwnerId
    );
    const badgeType = firstNonEmptyString(
        displayBadge?.badgeType,
        displayBadge?.BadgeType
    ).toLowerCase();

    return {
        id: `display:${id}`,
        key: firstNonEmptyString(
            inventoryOwnerId && inventoryPath
                ? `display:inventory:${inventoryOwnerId}:${inventoryPath}`
                : '',
            ownerId ? `display:${ownerId}:${id}` : '',
            imageUrl,
            `display:${id}`
        ),
        source: 'display',
        tag: '',
        label: label || 'Resonite Badge',
        description: firstNonEmptyString(
            displayBadge?.description,
            displayBadge?.Description
        ),
        assetUri,
        imageUrl,
        ownerId,
        inventoryOwnerId,
        inventoryPath,
        badgeType,
        pointFiltering:
            displayBadge?.pointFiltering === true ||
            displayBadge?.PointFiltering === true,
        isKnown: Boolean(imageUrl || inventoryPath)
    };
}

export function resolveResoniteBadges({
    tags = [],
    displayBadges = [],
    registrationDate = '',
    now = new Date()
} = {}) {
    const results = [];
    const seenKeys = new Set();
    const seenImageUrls = new Set();

    function appendBadge(badge) {
        if (!badge) {
            return;
        }

        if (seenKeys.has(badge.key)) {
            return;
        }

        if (badge.imageUrl && seenImageUrls.has(badge.imageUrl)) {
            return;
        }

        seenKeys.add(badge.key);
        if (badge.imageUrl) {
            seenImageUrls.add(badge.imageUrl);
        }
        results.push(badge);
    }

    for (let i = 0; i < displayBadges.length; i += 1) {
        appendBadge(resolveDisplayBadge(displayBadges[i], i));
    }

    for (const badge of resolveDerivedBadges({ registrationDate, now })) {
        appendBadge(badge);
    }

    for (const tag of Array.isArray(tags) ? tags : []) {
        appendBadge(resolveTagBadge(tag));
    }

    return results;
}

export function clearResoniteBadgeResolverCache() {
    tagResolutionCache.clear();
}
