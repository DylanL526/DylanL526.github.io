// Shape-aware glass optics, without filtering the text or cloning the page.
// Technique: https://kube.io/blog/liquid-glass-css-svg/
// SVG sampling equation: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap
(() => {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const surfaces = Array.from(document.querySelectorAll('.glass'));
    if (!surfaces.length || !window.ResizeObserver) return;

    // CSS.supports accepts url() in Safari/Firefox even though those engines
    // don't render SVG backdrop filters. Keep their normal CSS glass fallback.
    const chromium = /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent);
    const canRefract = chromium && CSS.supports('backdrop-filter', 'url("#glass-probe")');
    const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
    const moreContrast = matchMedia('(prefers-contrast: more)');
    const forcedColors = matchMedia('(forced-colors: active)');
    const disabled = () => reducedTransparency.matches || moreContrast.matches || forcedColors.matches;

    const svg = (tag, attributes = {}) => {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    };
    const definitions = svg('svg', { class: 'glass-filter-defs', 'aria-hidden': 'true', focusable: 'false' });
    const defs = svg('defs');
    definitions.append(defs);
    if (canRefract) document.body.append(definitions);

    // Quarter-squircle roundover, sampled once per shape. Snell's law bends
    // rays toward the surface normal; a flat center has no displacement.
    const makeProfile = (bevel, strength) => {
        const profile = new Float32Array(256);
        let maximum = 0;
        for (let i = 0; i < profile.length; i++) {
            const t = Math.max(0.0001, i / (profile.length - 1));
            const u = 1 - t;
            const height = Math.pow(1 - u ** 4, 0.25);
            const slope = 0.75 * u ** 3 / Math.max(height ** 3, 0.0001);
            const incidence = Math.atan(slope);
            const refraction = Math.asin(Math.sin(incidence) / 1.5);
            const travel = bevel * (0.75 * height + 1.3);
            profile[i] = Math.tan(incidence - refraction) * travel * strength;
            maximum = Math.max(maximum, profile[i]);
        }
        return { profile, maximum };
    };

    const makeMaps = (width, height, radius, strength) => {
        // Bound map-generation work for large project cards. SVG interpolates
        // the map back to CSS pixels. Rebuild only when geometry changes.
        const resolution = Math.min(1.5, Math.sqrt(100000 / (width * height)));
        const mapWidth = Math.max(2, Math.round(width * resolution));
        const mapHeight = Math.max(2, Math.round(height * resolution));
        const canvas = document.createElement('canvas');
        canvas.width = mapWidth;
        canvas.height = mapHeight;
        const context = canvas.getContext('2d');
        if (!context) return null;
        const displacement = context.createImageData(mapWidth, mapHeight);
        const highlight = context.createImageData(mapWidth, mapHeight);
        const bevel = Math.max(1, Math.min(30, radius * 0.95, height * 0.4));
        const { profile, maximum } = makeProfile(bevel, strength);

        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const index = (y * mapWidth + x) * 4;
                const px = (x + 0.5) * width / mapWidth - width / 2;
                const py = (y + 0.5) * height / mapHeight - height / 2;
                const qx = Math.abs(px) - (width / 2 - radius);
                const qy = Math.abs(py) - (height / 2 - radius);
                let distance, nx, ny;
                if (qx > 0 && qy > 0) {
                    const length = Math.hypot(qx, qy);
                    distance = radius - length;
                    nx = Math.sign(px) * qx / length;
                    ny = Math.sign(py) * qy / length;
                } else if (qx > qy) {
                    distance = radius - qx;
                    nx = Math.sign(px);
                    ny = 0;
                } else {
                    distance = radius - qy;
                    nx = 0;
                    ny = Math.sign(py);
                }

                const sample = Math.round(Math.max(0, Math.min(1, distance / bevel)) * 255);
                const amount = distance >= 0 ? profile[sample] / maximum : 0;
                // feDisplacementMap samples x + scale * (channel - 0.5).
                // Point samples inward, and use 2 * maximum as the SVG scale.
                displacement.data[index] = Math.round(127.5 - nx * amount * 127.5);
                displacement.data[index + 1] = Math.round(127.5 - ny * amount * 127.5);
                displacement.data[index + 2] = 128;
                displacement.data[index + 3] = 255;

                if (distance < 0 || distance > bevel) continue;
                // Localized cool/warm reflections, not a continuous white rim.
                const light = nx * -0.6 + ny * -0.8;
                const cool = Math.pow(Math.max(0, light), 7);
                const warm = Math.pow(Math.max(0, -light), 7) * 0.65;
                const glint = Math.exp(-distance / 2.2) * (cool + warm);
                highlight.data[index] = cool > warm ? 193 : 255;
                highlight.data[index + 1] = cool > warm ? 237 : 211;
                highlight.data[index + 2] = cool > warm ? 255 : 227;
                highlight.data[index + 3] = Math.round(glint * 135);
            }
        }

        context.putImageData(displacement, 0, 0);
        const map = canvas.toDataURL();
        context.putImageData(highlight, 0, 0);
        return { map, highlight: canvas.toDataURL(), scale: maximum * 2 };
    };

    const makeFilter = (id) => {
        const filter = svg('filter', {
            id, x: 0, y: 0, filterUnits: 'userSpaceOnUse',
            'color-interpolation-filters': 'sRGB'
        });
        const map = svg('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
        const frost = svg('feGaussianBlur', { in: 'SourceGraphic', result: 'backdrop' });
        filter.append(map, frost);
        const displacements = [];
        ['red', 'green', 'blue'].forEach((channel, index) => {
            const displacement = svg('feDisplacementMap', {
                in: 'backdrop', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result: `${channel}-warp`
            });
            displacements.push(displacement);
            const matrix = Array.from({ length: 20 }, () => 0);
            matrix[index * 6] = 1;
            matrix[18] = 1;
            filter.append(displacement, svg('feColorMatrix', {
                in: `${channel}-warp`, type: 'matrix', values: matrix.join(' '), result: channel
            }));
        });
        // Different ray offsets for each color produce real chromatic dispersion.
        filter.append(
            svg('feBlend', { in: 'red', in2: 'green', mode: 'screen', result: 'red-green' }),
            svg('feBlend', { in: 'red-green', in2: 'blue', mode: 'screen' })
        );
        defs.append(filter);
        return { filter, map, frost, displacements };
    };

    const records = new Map();
    const pending = new Set();
    let frame = 0;

    const update = (record) => {
        if (!record.visible || disabled()) return;
        const width = record.element.clientWidth;
        const height = record.element.clientHeight;
        if (width < 2 || height < 2) return;
        const style = getComputedStyle(record.element);
        const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, width / 2, height / 2);
        const strength = parseFloat(style.getPropertyValue('--glass-depth')) || 1;
        const dispersion = parseFloat(style.getPropertyValue('--glass-dispersion')) || 0;
        const frostAmount = Math.max(0, parseFloat(style.getPropertyValue('--glass-frost')) || 0);
        const key = [width, height, radius, strength, dispersion, frostAmount].join(':');
        if (key === record.key) {
            record.element.classList.toggle('glass-refractive', canRefract);
            return;
        }
        const maps = makeMaps(width, height, radius, strength);
        if (!maps) return;
        record.key = key;
        record.specular.style.backgroundImage = `url("${maps.highlight}")`;
        if (!canRefract) return;

        if (!record.optics) record.optics = makeFilter(record.id);
        const { filter, map, frost, displacements } = record.optics;
        filter.setAttribute('width', width);
        filter.setAttribute('height', height);
        map.setAttribute('width', width);
        map.setAttribute('height', height);
        map.setAttribute('href', maps.map);
        frost.setAttribute('stdDeviation', frostAmount);
        displacements.forEach((node, index) => node.setAttribute('scale', maps.scale * (1 + (1 - index) * dispersion)));
        record.layer.style.setProperty('--glass-filter', `url("#${record.id}")`);
        record.element.classList.add('glass-refractive');
    };

    const queue = (record) => {
        pending.add(record);
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            pending.forEach(update);
            pending.clear();
        });
    };

    const resize = new ResizeObserver((entries) => {
        entries.forEach(({ target }) => queue(records.get(target)));
    });
    const visibility = window.IntersectionObserver && new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => {
            const record = records.get(target);
            record.visible = isIntersecting;
            if (isIntersecting) queue(record);
            else record.element.classList.remove('glass-refractive');
        });
    }, { rootMargin: '160px' });

    surfaces.forEach((element, index) => {
        const layer = document.createElement('span');
        layer.className = 'glass-optics-layer';
        layer.setAttribute('aria-hidden', 'true');
        const specular = document.createElement('span');
        specular.className = 'glass-specular';
        specular.setAttribute('aria-hidden', 'true');
        const record = { element, layer, specular, id: `glass-refraction-${index}`, visible: !visibility };
        records.set(element, record);
        element.prepend(layer, specular);
        element.classList.add('glass-optical');
        resize.observe(element);
        if (visibility) visibility.observe(element);
        else queue(record);
    });

    [reducedTransparency, moreContrast, forcedColors].forEach((preference) => {
        preference.addEventListener('change', () => {
            records.forEach((record) => {
                if (disabled()) record.element.classList.remove('glass-refractive');
                else queue(record);
            });
        });
    });
})();
