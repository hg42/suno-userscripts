// ==UserScript==
// @name         suno: playing highlight & autoscroll
// @version      2026.02.28.1343
// @description  emphasizes song currently playing.
// @description  scrolls it into view if autoscroll button is enabled,
// @description  but only if the mouse is not hovering over the list
// @author       hg42
// @namespace    https://github.com/hg42/suno-userscripts
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.textContent = `
        .clip-row:has(.playing-animation),
        .clip-row:has(.playing-pause) {
            background: #222244 !important;
            transition: background 0.3s ease;
        }
        #autoscroll-toggle {
            margin-left: 10px;
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid #444;
            background: #111;
            color: #888;
            font-size: 10px;
            cursor: pointer;
            height: 24px;
            align-self: center;
        }
        #autoscroll-toggle.active {
            background: #222244;
            border-color: #5555ff;
            color: #fff;
        }
    `;
    document.head.appendChild(style);

    let autoscrollEnabled = localStorage.getItem('suno_autoscroll') === 'true';
    let lastPlayedClipId = null;
    let isMouseOverList = false;

    document.addEventListener('mouseenter', (e) => {
        if (e.target.closest('main')) isMouseOverList = true;
    }, true);
    document.addEventListener('mouseleave', (e) => {
        if (e.target.closest('main')) isMouseOverList = false;
    }, true);

    // Hilfsfunktion: Findet den Song-Titel im Player-Modul (unten)
    const getPlayingTitleFromPlayer = () => {
        // Suno Player Info Bereich (angepasst an aktuelle Selektoren)
        const playerTitleNode = document.querySelector('a[aria-label^="Playbar:"]');
        return playerTitleNode ? playerTitleNode.href.split('/song/')[1] : null;
    };

    const performScroll = () => {
        if (!autoscrollEnabled || isMouseOverList) return;

        const activeClip = document.querySelector('.clip-row:has(.playing-animation), .clip-row:has(.playing-pause)');
        const currentId = getPlayingTitleFromPlayer();

        //console.log("player: " + currentId + " found: " + activeClip);

        if (!currentId) return;

        // Wenn Element existiert und ID neu ist -> Zentrieren
        if (activeClip && currentId !== lastPlayedClipId) {
            lastPlayedClipId = currentId;
            activeClip.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // Virtual Scrolling Handling: Wenn ID neu, aber Element NICHT im DOM
        if (!activeClip && currentId !== lastPlayedClipId) {
            //console.log("now scrolling");
            // Wir versuchen das Element durch Scrollen "herbeizurufen"
            // Da wir nicht wissen ob oben/unten, probieren wir kleine Sprünge
            //const mainScrollContainer = document.querySelector('main') || window;
            // #main-container > div > div > div:nth-child(1) > div > div.flex.flex-1.flex-col.overflow-y-scroll
            //      > div > div.css-vnzcnw.e16od7yk1 > div > div.clip-browser-list-scroller.css-11nl96j.e81vryb2
            const mainScrollContainer = document.querySelector('#main-container .clip-browser-list-scroller') || window;
            //console.log("mainScrollContainer: " + mainScrollContainer);

          	const playing = !! document.querySelector('button[aria-label^="Playbar: Pause button"]');
			if (playing) {
                // Heuristik: Meistens spielen neue Songs "unten" in der Liste (Queue)
                // Wir scrollen ein Stück, der MutationObserver triggert performScroll erneut
                if (lastPlayedClipId === "scrolling") {
                    mainScrollContainer.scrollBy({ top: 300, behavior: 'auto' });
                } else {
                    mainScrollContainer.scrollBy({ top: -1000000, behavior: 'auto' });
                    lastPlayedClipId = "scrolling";
                }
            }
        }
    };

    // Observer mit kleinem Debounce für flüssige Performance
    let scrollTimeout;
    const observer = new MutationObserver(() => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(performScroll, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const insertToggle = () => {
        if (document.getElementById('autoscroll-toggle')) return;
        const targetBtn = document.querySelector('button[aria-label^="Playbar: Toggle"]');
        if (!targetBtn) return;

        const container = targetBtn.parentElement;
        const btn = document.createElement('button');
        btn.id = 'autoscroll-toggle';
        btn.type = 'button';
        updateBtnUI(btn);

        btn.onclick = (e) => {
            e.preventDefault();
            autoscrollEnabled = !autoscrollEnabled;
            localStorage.setItem('suno_autoscroll', autoscrollEnabled);
            updateBtnUI(btn);
            if (autoscrollEnabled) {
                // force scrolling
                lastPlayedClipId = null;
                performScroll();
            }
        };
        container.appendChild(btn);
    };

    function updateBtnUI(btn) {
        btn.innerText = autoscrollEnabled ? 'scroll: ON' : 'scroll: off';
        btn.classList.toggle('active', autoscrollEnabled);
    }

    setInterval(insertToggle, 1000);
})();
