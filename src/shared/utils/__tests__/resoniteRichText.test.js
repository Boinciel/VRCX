import {
    renderResoniteRichText,
    stripResoniteRichText
} from '../resoniteRichText';

describe('renderResoniteRichText', () => {
    test('escapes plain html input', () => {
        const output = renderResoniteRichText('<script>alert(1)</script>');
        expect(output).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('renders color tags', () => {
        const output = renderResoniteRichText('<color=#B026FF>KUNO</color>');
        expect(output).toBe('<span style="color:#B026FF">KUNO</span>');
    });

    test('renders named color tags', () => {
        const output = renderResoniteRichText(
            '<color=yellow>Hidden Star Theater [US2]</color> · Public'
        );
        expect(output).toBe(
            '<span style="color:#ffff00">Hidden Star Theater [US2]</span> · Public'
        );
    });

    test('renders size tags', () => {
        const output = renderResoniteRichText(
            "<size=75%>(Zyro's Dawn Remix)</size>"
        );
        expect(output).toBe(
            '<span style="font-size:75%">(Zyro\'s Dawn Remix)</span>'
        );
    });

    test('renders bold, italic, and underline tags', () => {
        const output = renderResoniteRichText(
            '<b>Bold</b> <i>Italic</i> <u>Underline</u>'
        );
        expect(output).toBe(
            '<strong>Bold</strong> <em>Italic</em> <u>Underline</u>'
        );
    });

    test('renders formatting tags nested inside color tags', () => {
        const output = renderResoniteRichText(
            '<color=yellow><b>Bold</b> <i>Italic</i> <u>Underline</u></color>'
        );
        expect(output).toBe(
            '<span style="color:#ffff00"><strong>Bold</strong> <em>Italic</em> <u>Underline</u></span>'
        );
    });

    test('renders mixed color and size tags while preserving plain text', () => {
        const output = renderResoniteRichText(
            "<color=#B026FF>KUNO</color> <size=75%>(Zyro's Dawn Remix)</size>"
        );
        expect(output).toBe(
            '<span style="color:#B026FF">KUNO</span> <span style="font-size:75%">(Zyro\'s Dawn Remix)</span>'
        );
    });

    test('renders unclosed color tags across successive color changes', () => {
        const output = renderResoniteRichText(
            '<color=blue>TMSC<color=purple> Zutyo <color=red>Home'
        );
        expect(output).toBe(
            '<span style="color:#0000ff">TMSC<span style="color:#8000ff"> Zutyo <span style="color:#ff0000">Home</span></span></span>'
        );
    });

    test('keeps outer styles active when inner styles close later', () => {
        const output = renderResoniteRichText(
            '<color=blue>A<color=red>B</color>C'
        );
        expect(output).toBe(
            '<span style="color:#0000ff">A<span style="color:#ff0000">B</span>C</span>'
        );
    });

    test('renders dotted Resonite theme colors and ignores stray closing tags', () => {
        const output = renderResoniteRichText(
            'Xenora <color=hero.green>7</color> - </size><color=hero.cyan>Dunes</color>'
        );
        expect(output).toBe(
            'Xenora <span style="color:#59eb5c">7</span> - <span style="color:#61d1fa">Dunes</span>'
        );
    });

    test('ignores stray supported closing tags with no matching opener', () => {
        const output = renderResoniteRichText(
            '[SFW]</b></color> [Eighteen+]</b></color>'
        );
        expect(output).toBe('[SFW] [Eighteen+]');
    });

    test('supports documented tag quirks for separators and trailing whitespace', () => {
        const output = renderResoniteRichText(
            '<color hero.green >Hero</color   > <b   >Bold</b> <i=>Italic</i > <u   >Under</u> <br   >Next'
        );
        expect(output).toBe(
            '<span style="color:#59eb5c">Hero</span> <strong>Bold</strong> <em>Italic</em> <u>Under</u> <br>Next'
        );
    });

    test('supports cross-nested closing tags like Resonite', () => {
        const output = renderResoniteRichText(
            '<b>bold <i>bold italic</b> italic</i>'
        );
        expect(output).toBe(
            '<strong>bold <em>bold italic</em></strong><em> italic</em>'
        );
    });

    test('supports closeall and closeallblock', () => {
        const output = renderResoniteRichText(
            '<b><closeallblock><i>Text</closeall> still bold</closeallblock></b>'
        );
        expect(output).toBe('<strong><em>Text</em> still bold</strong>');
    });

    test('supports alpha, mark, case transforms, line-height, and size without units', () => {
        const output = renderResoniteRichText(
            '<alpha=#80><mark=#ff0>Hi</mark></alpha> <uppercase>up</uppercase> <lowercase>LOW</lowercase> <line-height=200%>Tall</line-height> <size=16>Size</size>'
        );
        expect(output).toBe(
            '<span style="opacity:0.502"><span style="background-color:#ff04">Hi</span></span> <span style="text-transform:uppercase">up</span> <span style="text-transform:lowercase">LOW</span> <span style="line-height:200%">Tall</span> <span style="font-size:16px">Size</span>'
        );
    });

    test('supports strikethrough, subscript, superscript, nobr, and align', () => {
        const output = renderResoniteRichText(
            '<align=center><nobr><s>X</s><sub>2</sub><sup>3</sup></nobr></align>'
        );
        expect(output).toBe(
            '<span style="display:block;text-align:center"><span style="white-space:nowrap"><s>X</s><sub>2</sub><sup>3</sup></span></span>'
        );
    });

    test('supports noparse block and character-count modes', () => {
        const output = renderResoniteRichText(
            '<noparse><b>Bold</b></noparse> <noparse=3><b>After'
        );
        expect(output).toBe('&lt;b&gt;Bold&lt;/b&gt; &lt;b&gt;After');
    });

    test('supports sprite and glyph fallback rendering', () => {
        const output = renderResoniteRichText(
            '<sprite name="baguette" tint=true> <glyph index=5>'
        );
        expect(output).toBe(
            '<span class="resonite-inline-asset" data-resonite-tag="sprite" data-resonite-label="baguette">[baguette]</span> <span class="resonite-inline-asset" data-resonite-tag="glyph" data-resonite-label="5">[5]</span>'
        );
    });

    test('supports space-separated named attributes for sprite and glyph tags', () => {
        const output = renderResoniteRichText(
            '<sprite name baguette tint true> <glyph index 5>'
        );
        expect(output).toBe(
            '<span class="resonite-inline-asset" data-resonite-tag="sprite" data-resonite-label="baguette">[baguette]</span> <span class="resonite-inline-asset" data-resonite-tag="glyph" data-resonite-label="5">[5]</span>'
        );
    });

    test('supports font tags by quoted name and numeric index', () => {
        const output = renderResoniteRichText(
            '<font="Orbitron">Named</font> <font=1>Indexed</font>'
        );
        expect(output).toBe(
            '<span style="font-family:\'Orbitron\'">Named</span> <span data-resonite-font-index="1">Indexed</span>'
        );
    });

    test('parses gradient as a documented no-op tag', () => {
        const output = renderResoniteRichText(
            '<gradient=#F00,#00F>Text</gradient>'
        );
        expect(output).toBe('Text');
    });

    test('ignores invalid size values', () => {
        const output = renderResoniteRichText('<size=huge>text</size>');
        expect(output).toBe('&lt;size=huge&gt;text&lt;/size&gt;');
    });

    test('ignores unsafe non-keyword color values', () => {
        const output = renderResoniteRichText(
            '<color=expression(alert(1))>text</color>'
        );
        expect(output).toBe(
            '&lt;color=expression(alert(1))&gt;text&lt;/color&gt;'
        );
    });

    test('ignores invalid hex color lengths', () => {
        const output = renderResoniteRichText('<color=#12345>text</color>');
        expect(output).toBe('&lt;color=#12345&gt;text&lt;/color&gt;');
    });

    test('strips Resonite rich-text tags to plain text', () => {
        const output = stripResoniteRichText(
            '<color=#E774EB>Soft</color> Sea <size=75%>of Stars</size>'
        );
        expect(output).toBe('Soft Sea of Stars');
    });
});
