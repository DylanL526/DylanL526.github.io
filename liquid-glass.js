// Progressive enhancement: the material and all links also work without JS.
(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const surfaces = document.querySelectorAll('.glass-interactive');

    surfaces.forEach((surface) => {
        let frame = 0;

        const reset = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            surface.style.removeProperty('--light-x');
            surface.style.removeProperty('--light-y');
        };

        surface.addEventListener('pointermove', (event) => {
            if (motion.matches || !pointer.matches || event.pointerType === 'touch') return;

            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const bounds = surface.getBoundingClientRect();
                surface.style.setProperty('--light-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
                surface.style.setProperty('--light-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
                frame = 0;
            });
        });

        surface.addEventListener('pointerleave', reset);
        surface.addEventListener('pointercancel', reset);
        motion.addEventListener('change', reset);
        pointer.addEventListener('change', reset);
    });

    const nav = document.querySelector('.navbar');
    if (!nav) return;

    // A real element lets the optics layer refract beneath the sliding lens.
    const lens = document.createElement('span');
    lens.className = 'nav-lens glass';
    lens.setAttribute('aria-hidden', 'true');
    nav.prepend(lens);

    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const sections = links.map((link) => document.getElementById(link.hash.slice(1)));
    let currentLink = null;
    let hoveredLink = null;
    let navigationLink = null;
    let navFrame = 0;

    const renderHighlight = () => {
        const focusedLink = links.find((link) => link.matches(':focus-visible'));
        const target = navigationLink || hoveredLink || focusedLink || currentLink;

        links.forEach((link) => link.toggleAttribute('data-glass-highlight', link === target));
        nav.style.setProperty('--nav-opacity', target ? '1' : '0');
        if (!target) return;

        nav.style.setProperty('--nav-x', `${target.offsetLeft}px`);
        nav.style.setProperty('--nav-y', `${target.offsetTop}px`);
        nav.style.setProperty('--nav-width', `${target.offsetWidth}px`);
        nav.style.setProperty('--nav-height', `${target.offsetHeight}px`);
    };

    const updateSection = () => {
        navFrame = 0;
        let active = null;
        const threshold = nav.getBoundingClientRect().bottom + 80;
        sections.forEach((section, index) => {
            if (section && section.getBoundingClientRect().top <= threshold) active = links[index];
        });

        // Contact can be too close to the footer to reach the threshold.
        if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
            active = links[links.length - 1];
        }

        if (navigationLink) {
            const section = sections[links.indexOf(navigationLink)];
            const scrollPadding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            const scrollMargin = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
            const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const destination = Math.min(maxScroll, Math.max(0,
                window.scrollY + section.getBoundingClientRect().top - scrollPadding - scrollMargin));

            // Release only on arrival, including anchors clamped to the page
            // bottom. A pause between scroll events does not mean we arrived.
            if (Math.abs(window.scrollY - destination) <= 2) navigationLink = null;
        }

        // Native smooth scrolling crosses other sections on its way to the
        // clicked anchor. Keep both the lens and aria-current on that anchor.
        if (navigationLink) active = navigationLink;

        if (active !== currentLink) {
            currentLink = active;
            links.forEach((link) => {
                if (link === currentLink) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            });
        }
        renderHighlight();
    };

    const scheduleUpdate = () => {
        if (!navFrame) navFrame = requestAnimationFrame(updateSection);
    };

    const finishNavigation = () => {
        if (!navigationLink) return;
        navigationLink = null;
        scheduleUpdate();
    };

    const handleHistoryChange = () => {
        // Clicking a native fragment link can fire popstate too. Only cancel
        // the hold when history takes us somewhere other than that link.
        if (navigationLink && window.location.hash !== navigationLink.hash) finishNavigation();
        scheduleUpdate();
    };

    links.forEach((link) => {
        link.addEventListener('click', (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            navigationLink = link;
            hoveredLink = null;
            scheduleUpdate();
            renderHighlight();
        });

        link.addEventListener('pointerenter', (event) => {
            if (!pointer.matches || event.pointerType === 'touch') return;
            hoveredLink = link;
            renderHighlight();
        });
    });

    const clearHover = () => {
        hoveredLink = null;
        renderHighlight();
    };
    nav.addEventListener('pointerleave', clearHover);
    nav.addEventListener('pointercancel', clearHover);
    pointer.addEventListener('change', clearHover);
    nav.addEventListener('focusin', () => {
        // Mouse focus arrives before click; preserve its hover highlight so
        // pressing a link doesn't briefly send the lens to the old section.
        if (links.some((link) => link.matches(':focus-visible'))) hoveredLink = null;
        renderHighlight();
    });
    nav.addEventListener('focusout', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('wheel', finishNavigation, { passive: true });
    window.addEventListener('touchmove', finishNavigation, { passive: true });
    window.addEventListener('keydown', (event) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) finishNavigation();
    });
    window.addEventListener('popstate', handleHistoryChange);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', handleHistoryChange);
    window.addEventListener('load', scheduleUpdate);
    window.addEventListener('pageshow', scheduleUpdate);
    if ('ResizeObserver' in window) new ResizeObserver(scheduleUpdate).observe(nav);
    if (document.fonts) document.fonts.ready.then(scheduleUpdate);

    nav.classList.add('has-slider');
    updateSection();
})();
