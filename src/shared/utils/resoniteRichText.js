const OPEN_TAG = /^<([A-Za-z][A-Za-z0-9-]*)([^>]*)>/;
const CLOSE_TAG = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>/;

const DEFAULT_MARK_ALPHA = '40';

const SUPPORTED_PAIRED_TAGS = new Set([
    'align',
    'allcaps',
    'alpha',
    'b',
    'closeallblock',
    'color',
    'font',
    'gradient',
    'i',
    'line-height',
    'lowercase',
    'mark',
    'nobr',
    'noparse',
    's',
    'size',
    'smallcaps',
    'sub',
    'sup',
    'u',
    'uppercase'
]);

const RESONITE_COLOR_MAP = {
    clear: 'rgba(0,0,0,0)',
    white: '#ffffff',
    gray: '#808080',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    blue: '#0000ff',
    yellow: '#ffff00',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    orange: '#ff8000',
    purple: '#8000ff',
    lime: '#bfff00',
    pink: '#ff0080',
    brown: '#400000',
    'neutrals.dark': '#11151d',
    'neutrals.mid': '#2b2f35',
    'neutrals.midlight': '#86888b',
    'neutrals.light': '#e1e1e0',
    'hero.yellow': '#f8f770',
    'hero.green': '#59eb5c',
    'hero.red': '#ff7676',
    'hero.purple': '#ba64f2',
    'hero.cyan': '#61d1fa',
    'hero.orange': '#e69e50',
    'mid.yellow': '#a0a14e',
    'mid.green': '#3f9e44',
    'mid.red': '#ae5458',
    'mid.purple': '#824aab',
    'mid.cyan': '#458fab',
    'mid.orange': '#976c3d',
    'sub.yellow': '#484a2c',
    'sub.green': '#24512c',
    'sub.red': '#5d323a',
    'sub.purple': '#492f64',
    'sub.cyan': '#284c5d',
    'sub.orange': '#48392a',
    'dark.yellow': '#2b2e26',
    'dark.green': '#192d24',
    'dark.red': '#1a1318',
    'dark.purple': '#241e35',
    'dark.cyan': '#1a2a36',
    'dark.orange': '#292423'
};

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttribute(text) {
    return escapeHtml(text).replace(/'/g, '&#39;');
}

function closeRemainingTags(stack) {
    let output = '';

    for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].closeHtml) {
            output += stack[index].closeHtml;
        }
    }

    stack.length = 0;
    return output;
}

function closeTagByName(stack, tagName) {
    const targetIndex = findTagIndex(stack, tagName);
    if (targetIndex === -1) {
        return { matched: false, output: '' };
    }

    const aboveTarget = stack.slice(targetIndex + 1);
    const target = stack[targetIndex];
    let output = '';

    for (let index = stack.length - 1; index > targetIndex; index -= 1) {
        if (stack[index].closeHtml) {
            output += stack[index].closeHtml;
        }
    }

    if (target.closeHtml) {
        output += target.closeHtml;
    }

    stack.splice(targetIndex, 1);

    for (const entry of aboveTarget) {
        if (entry.openHtml) {
            output += entry.openHtml;
        }
    }

    return { matched: true, output };
}

function closeAllTags(stack) {
    let boundaryIndex = -1;

    for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === 'closeallblock') {
            boundaryIndex = index;
            break;
        }
    }

    const removableIndex = boundaryIndex + 1;
    let output = '';

    for (let index = stack.length - 1; index >= removableIndex; index -= 1) {
        if (stack[index].closeHtml) {
            output += stack[index].closeHtml;
        }
    }

    stack.splice(removableIndex);
    return output;
}

function removeNearestMarker(stack, tagName) {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === tagName) {
            stack.splice(index, 1);
            return true;
        }
    }

    return false;
}

function findTagIndex(stack, tagName) {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === tagName) {
            return index;
        }
    }

    return -1;
}

function markLiteralTag(literalTagCounts, tagName) {
    literalTagCounts[tagName] = (literalTagCounts[tagName] || 0) + 1;
}

function consumeLiteralTag(literalTagCounts, tagName) {
    if ((literalTagCounts[tagName] || 0) < 1) {
        return false;
    }

    literalTagCounts[tagName] -= 1;
    return true;
}

function parseOpenTag(remainder) {
    const match = remainder.match(OPEN_TAG);
    if (!match) {
        return null;
    }

    return {
        raw: match[0],
        name: match[1].toLowerCase(),
        rest: match[2] || ''
    };
}

function parseCloseTag(remainder) {
    const match = remainder.match(CLOSE_TAG);
    if (!match) {
        return null;
    }

    return {
        raw: match[0],
        name: match[1].toLowerCase()
    };
}

function startsWithNamedAttribute(rest) {
    const trimmed = String(rest || '').trimStart();
    return /^[A-Za-z][A-Za-z0-9-]*(?:\s*=|\s+["'A-Za-z0-9#.-])/.test(trimmed);
}

function readArgumentToken(input) {
    const source = String(input || '');
    if (!source) {
        return { value: '', length: 0 };
    }

    const quote = source[0];
    if (quote === '"' || quote === "'") {
        let index = 1;
        while (index < source.length && source[index] !== quote) {
            index += 1;
        }

        if (index < source.length) {
            return {
                value: source.slice(1, index),
                length: index + 1
            };
        }

        return {
            value: source.slice(1),
            length: source.length
        };
    }

    const match = source.match(/^\S+/);
    if (!match) {
        return { value: '', length: 0 };
    }

    return {
        value: match[0],
        length: match[0].length
    };
}

function readDefaultParameter(rest) {
    const source = String(rest || '');
    if (!source) {
        return { value: '', consumed: 0 };
    }

    let cursor = 0;
    if (source[cursor] === '=') {
        cursor += 1;
    } else if (/^\s/.test(source[cursor] || '')) {
        while (/^\s$/.test(source[cursor] || '')) {
            cursor += 1;
        }
        if (startsWithNamedAttribute(source.slice(cursor))) {
            return { value: '', consumed: 0 };
        }
    } else {
        return { value: '', consumed: 0 };
    }

    while (/^\s$/.test(source[cursor] || '')) {
        cursor += 1;
    }

    const token = readArgumentToken(source.slice(cursor));
    return {
        value: token.value,
        consumed: cursor + token.length
    };
}

function parseAttributes(rest) {
    const attributes = {};
    const source = String(rest || '');
    const attributePattern =
        /([A-Za-z][A-Za-z0-9-]*)(?:\s*=\s*|\s+)("[^"]*"|'[^']*'|\S+)/g;
    let match = attributePattern.exec(source);

    while (match) {
        const rawValue = match[2] || '';
        attributes[match[1].toLowerCase()] = rawValue.replace(
            /^['"]|['"]$/g,
            ''
        );
        match = attributePattern.exec(source);
    }

    return attributes;
}

function resolveColorValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    if (
        /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
            normalized
        )
    ) {
        return normalized;
    }

    return RESONITE_COLOR_MAP[normalized.toLowerCase()] || '';
}

function resolveHighlightColor(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
        return `${normalized}${DEFAULT_MARK_ALPHA[0]}`;
    }

    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
        return `${normalized}${DEFAULT_MARK_ALPHA}`;
    }

    return resolveColorValue(normalized);
}

function resolveAlphaOpacity(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    if (/^#[0-9a-f]{1,2}$/i.test(normalized)) {
        const digits = normalized.slice(1).padEnd(2, normalized.slice(-1));
        return normalizeOpacity(parseInt(digits, 16) / 255);
    }

    if (/^#[0-9a-f]{4}$/i.test(normalized)) {
        return normalizeOpacity(
            parseInt(normalized.slice(-1).repeat(2), 16) / 255
        );
    }

    if (/^#[0-9a-f]{8}$/i.test(normalized)) {
        return normalizeOpacity(parseInt(normalized.slice(-2), 16) / 255);
    }

    const resolvedColor = resolveColorValue(normalized);
    if (resolvedColor === 'rgba(0,0,0,0)') {
        return '0';
    }

    return resolvedColor ? '1' : '';
}

function normalizeOpacity(value) {
    if (!Number.isFinite(value)) {
        return '';
    }

    return String(Math.max(0, Math.min(1, Number(value.toFixed(3)))));
}

function ensureCssSize(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    if (!normalized) {
        return '';
    }

    if (/^[0-9]{1,3}(?:\.[0-9]+)?(?:%|px|em|rem)?$/i.test(normalized)) {
        return /[%a-z]+$/i.test(normalized) ? normalized : `${normalized}px`;
    }

    return '';
}

function sanitizeAlign(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return ['left', 'right', 'center', 'justify'].includes(normalized)
        ? normalized
        : '';
}

function sanitizeLineHeight(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return /^[0-9]+(?:\.[0-9]+)?(?:%|px|em|rem)?$/i.test(normalized)
        ? normalized
        : '';
}

function sanitizeFontValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return { styleValue: '', dataValue: '' };
    }

    if (/^[0-9]+$/.test(normalized)) {
        return { styleValue: '', dataValue: normalized };
    }

    return {
        styleValue: normalized.replace(/[<>]/g, ''),
        dataValue: normalized
    };
}

function buildStyleTag(name, style) {
    return {
        name,
        openHtml: `<span style="${style}">`,
        closeHtml: '</span>'
    };
}

function buildSemanticTag(name, openHtml, closeHtml) {
    return {
        name,
        openHtml,
        closeHtml
    };
}

function buildNoOpTag(name) {
    return {
        name,
        openHtml: '',
        closeHtml: ''
    };
}

function buildLiteralBlockTag(name) {
    return {
        name,
        openHtml: '',
        closeHtml: '',
        literalBlock: true
    };
}

function buildMarkerTag(name) {
    return {
        name,
        openHtml: '',
        closeHtml: '',
        marker: true
    };
}

function buildSpriteFallback(name, attributes) {
    const label = String(attributes.name || attributes.index || name).trim();
    const safeLabel = escapeHtml(label || name);
    return `<span class="resonite-inline-asset" data-resonite-tag="${escapeAttribute(name)}" data-resonite-label="${escapeAttribute(label)}">[${safeLabel}]</span>`;
}

function createTagEntry(tag) {
    const defaultParameter = readDefaultParameter(tag.rest);
    const attributes = parseAttributes(
        tag.rest.slice(defaultParameter.consumed)
    );
    const parameter = defaultParameter.value;

    switch (tag.name) {
        case 'align': {
            const align = sanitizeAlign(parameter);
            return align
                ? buildStyleTag('align', `display:block;text-align:${align}`)
                : null;
        }
        case 'allcaps':
        case 'smallcaps':
            return buildStyleTag(tag.name, 'font-variant-caps:all-small-caps');
        case 'alpha': {
            const opacity = resolveAlphaOpacity(parameter);
            return opacity
                ? buildStyleTag('alpha', `opacity:${opacity}`)
                : null;
        }
        case 'b':
            return buildSemanticTag('b', '<strong>', '</strong>');
        case 'br':
            return { selfClosingHtml: '<br>' };
        case 'closeallblock':
            return buildMarkerTag('closeallblock');
        case 'color': {
            const color = resolveColorValue(parameter);
            return color ? buildStyleTag('color', `color:${color}`) : null;
        }
        case 'font': {
            const font = sanitizeFontValue(parameter);
            if (!font.styleValue && !font.dataValue) {
                return null;
            }

            if (font.styleValue) {
                return buildStyleTag(
                    'font',
                    `font-family:'${escapeAttribute(font.styleValue)}'`
                );
            }

            return {
                name: 'font',
                openHtml: `<span data-resonite-font-index="${escapeAttribute(font.dataValue)}">`,
                closeHtml: '</span>'
            };
        }
        case 'glyph':
        case 'sprite':
            return {
                selfClosingHtml: buildSpriteFallback(tag.name, attributes)
            };
        case 'gradient':
            return buildNoOpTag('gradient');
        case 'i':
            return buildSemanticTag('i', '<em>', '</em>');
        case 'line-height': {
            const lineHeight = sanitizeLineHeight(parameter);
            return lineHeight
                ? buildStyleTag('line-height', `line-height:${lineHeight}`)
                : null;
        }
        case 'lowercase':
            return buildStyleTag('lowercase', 'text-transform:lowercase');
        case 'mark': {
            const markColor = resolveHighlightColor(parameter);
            return markColor
                ? buildStyleTag('mark', `background-color:${markColor}`)
                : null;
        }
        case 'nobr':
            return buildStyleTag('nobr', 'white-space:nowrap');
        case 'noparse': {
            if (/^[0-9]+$/.test(parameter)) {
                return { literalChars: Number(parameter) };
            }
            return buildLiteralBlockTag('noparse');
        }
        case 's':
            return buildSemanticTag('s', '<s>', '</s>');
        case 'size': {
            const size = ensureCssSize(parameter);
            return size ? buildStyleTag('size', `font-size:${size}`) : null;
        }
        case 'sub':
            return buildSemanticTag('sub', '<sub>', '</sub>');
        case 'sup':
            return buildSemanticTag('sup', '<sup>', '</sup>');
        case 'u':
            return buildSemanticTag('u', '<u>', '</u>');
        case 'uppercase':
            return buildStyleTag('uppercase', 'text-transform:uppercase');
        default:
            return null;
    }
}

/**
 * Renders Resonite rich-text as safe HTML.
 *
 * Supported tags include the documented formatting family that can be
 * represented safely in HTML/CSS: align, allcaps/smallcaps, alpha, b, br,
 * closeall, closeallblock, color, font, glyph/sprite fallback, gradient,
 * i, line-height, lowercase, mark, nobr, noparse, s, size, sub, sup, u,
 * and uppercase.
 *
 * @param {string} text - Raw Resonite rich-text string
 * @returns {string} Safe HTML string suitable for v-html
 */
export function renderResoniteRichText(text) {
    if (!text) {
        return '';
    }

    const source = String(text);
    const stack = [];
    const literalTagCounts = {};
    let output = '';
    let index = 0;
    let literalCharsRemaining = 0;

    while (index < source.length) {
        const remainder = source.slice(index);

        if (literalCharsRemaining > 0) {
            const literalChunk = source.slice(
                index,
                index + literalCharsRemaining
            );
            output += escapeHtml(literalChunk);
            index += literalChunk.length;
            literalCharsRemaining -= literalChunk.length;
            continue;
        }

        if (stack[stack.length - 1]?.literalBlock) {
            const closeTag = parseCloseTag(remainder);
            if (closeTag?.name === 'noparse') {
                closeTagByName(stack, 'noparse');
                index += closeTag.raw.length;
                continue;
            }

            output += escapeHtml(source[index]);
            index += 1;
            continue;
        }

        if (source[index] !== '<') {
            const nextTagIndex = source.indexOf('<', index);
            const endIndex = nextTagIndex === -1 ? source.length : nextTagIndex;
            output += escapeHtml(source.slice(index, endIndex));
            index = endIndex;
            continue;
        }

        const closeTag = parseCloseTag(remainder);
        if (closeTag) {
            let closeResult = null;

            if (closeTag.name === 'closeall') {
                output += closeAllTags(stack);
                index += closeTag.raw.length;
                continue;
            }

            if (closeTag.name === 'closeallblock') {
                removeNearestMarker(stack, 'closeallblock');
                index += closeTag.raw.length;
                continue;
            }

            if (SUPPORTED_PAIRED_TAGS.has(closeTag.name)) {
                closeResult = closeTagByName(stack, closeTag.name);
            }

            if (closeResult?.matched) {
                output += closeResult.output;
            } else if (consumeLiteralTag(literalTagCounts, closeTag.name)) {
                output += escapeHtml(closeTag.raw);
            } else if (!SUPPORTED_PAIRED_TAGS.has(closeTag.name)) {
                output += escapeHtml(closeTag.raw);
            }

            index += closeTag.raw.length;
            continue;
        }

        const openTag = parseOpenTag(remainder);
        if (openTag) {
            const entry = createTagEntry(openTag);
            if (entry?.selfClosingHtml) {
                output += entry.selfClosingHtml;
                index += openTag.raw.length;
                continue;
            }

            if (typeof entry?.literalChars === 'number') {
                literalCharsRemaining = entry.literalChars;
                index += openTag.raw.length;
                continue;
            }

            if (entry) {
                stack.push(entry);
                output += entry.openHtml;
                index += openTag.raw.length;
                continue;
            }

            if (SUPPORTED_PAIRED_TAGS.has(openTag.name)) {
                markLiteralTag(literalTagCounts, openTag.name);
                output += escapeHtml(openTag.raw);
                index += openTag.raw.length;
                continue;
            }
        }

        output += '&lt;';
        index += 1;
    }

    output += closeRemainingTags(stack);
    return output;
}
