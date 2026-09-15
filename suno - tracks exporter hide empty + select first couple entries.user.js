// ==UserScript==
// @name         suno - tracks exporter hide empty + select first couple entries
// @namespace    http://tampermonkey.net
// @version      2026-09-14-1414
// @description  Hides empty workspaces and checks the checkboxes for the first couple of visible entries.
// @author       hg42
// @match        https://suno.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=suno.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    function processWorkspaces() {

        const n_select = 25;

        // 1. Hide .workspace-card containing "0 tracks"
        const cards = document.querySelectorAll('.workspace-group');
        cards.forEach(card => {
            if (card.textContent.includes('0 tracks')) {
                card.style.display = 'none';
            }
        });

        // 2. Find all visible cards and select checkboxes for the first couple entries
        const visibleCards = Array.from(document.querySelectorAll('.workspace-group'))
            .filter(card => card.style.display !== 'none');

        visibleCards.slice(0, n_select).forEach(card => {
            const checkbox = card.querySelector('.workspace-checkbox');
            if (checkbox && !checkbox.checked) {
                checkbox.click(); // Triggers native event handlers
                checkbox.checked = true;
            }
        });
    }

    // Run on initial load
    processWorkspaces();

    // Observe dynamically loaded content
    const observer = new MutationObserver(processWorkspaces);
    observer.observe(document.body, { childList: true, subtree: true });
})();