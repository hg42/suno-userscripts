// ==UserScript==
// @name         suno: click + shift‑click (and long‑press) range selection in Suno clip lists
// @version      2026.02.28.1342
// @description  click for first element, shift-click (or long press) for end of range selection
// @author       hg42
// @namespace    https://github.com/hg42/suno-userscripts
// @match        https://suno.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    // -------------------------------------------------------------------------
    // CONFIGURATION – tweak these if Suno changes its markup or class names
    // -------------------------------------------------------------------------
    const ROW_SELECTOR      = '.clip-list .clip-row'; // CSS selector for a single row
    const SELECTED_CLASS    = 'selected';             // Class Suno adds when a row is selected
    const LONG_PRESS_MS     = 500;                    // How long a touch must be held to count as "Shift"
    // -------------------------------------------------------------------------

    // Keep track of the last row that was clicked without Shift
    let lastClickedRow = null;
    // Flag set by the long‑press handler (mobile)
    let shiftEmulated = false;

    // -------------------------------------------------------------------------
    // Helper: add / remove the selected class (uses Suno's own styling)
    // -------------------------------------------------------------------------
    const setRowSelected = (row, selected) => {
        if (selected) {
            row.classList.add(SELECTED_CLASS);
        } else {
            row.classList.remove(SELECTED_CLASS);
        }
    };

    // -------------------------------------------------------------------------
    // Core: handle a click (or emulated shift‑click) on a row
    // -------------------------------------------------------------------------
    const onRowClick = (event) => {
        const row = event.currentTarget;
        const isShift = event.shiftKey || shiftEmulated;

        // Reset the emulated flag after we have used it once
        if (shiftEmulated) shiftEmulated = false;

        // If this is a normal click (no shift) → just toggle the row
        if (!isShift) {
            // Let Suno’s own click handler run first, then sync our flag
            // (We assume Suno toggles the SELECTED_CLASS itself)
            // Store this row as the anchor for the next shift‑click
            lastClickedRow = row;
            return;
        }

        // -------------------------------------------------------------
        // Shift‑click logic: select the range between lastClickedRow
        // -------------------------------------------------------------
        if (!lastClickedRow) {
            // No anchor yet – treat it like a normal click
            lastClickedRow = row;
            return;
        }

        // Gather all rows in document order
        const allRows = Array.from(document.querySelectorAll(ROW_SELECTOR));

        const startIdx = allRows.indexOf(lastClickedRow);
        const endIdx   = allRows.indexOf(row);

        if (startIdx === -1 || endIdx === -1) {
            // Something went wrong – just bail out
            lastClickedRow = row;
            return;
        }

        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

        // Determine the target state: if the row we clicked is already selected,
        // we’ll *add* the whole range; otherwise we’ll *remove* it.
        const shouldSelect = !row.classList.contains(SELECTED_CLASS);

        for (let i = from; i <= to; i++) {
            setRowSelected(allRows[i], shouldSelect);
        }

        // Update the anchor to the row we just shift‑clicked
        lastClickedRow = row;
    };

    // -------------------------------------------------------------------------
    // Touch support – long press = emulate Shift
    // -------------------------------------------------------------------------
    const onTouchStart = (event) => {
        // Only consider single‑finger touches
        if (event.touches.length !== 1) return;

        const targetRow = event.target.closest(ROW_SELECTOR);
        if (!targetRow) return;

        // Store a timer; if it fires, we set shiftEmulated = true
        const timerId = setTimeout(() => {
            shiftEmulated = true;
            // Give visual feedback (optional)
            targetRow.style.opacity = '0.6';
        }, LONG_PRESS_MS);

        // Save the timer on the element so we can cancel it on touchend/cancel
        targetRow._shiftPressTimer = timerId;
    };

    const onTouchEnd = (event) => {
        const targetRow = event.target.closest(ROW_SELECTOR);
        if (!targetRow) return;

        // Cancel the pending timer if the press was too short
        clearTimeout(targetRow._shiftPressTimer);
        delete targetRow._shiftPressTimer;

        // Reset any visual feedback we added
        targetRow.style.opacity = '';
    };

    // -------------------------------------------------------------------------
    // Attach listeners to existing rows + watch for new rows (MutationObserver)
    // -------------------------------------------------------------------------
    const attachListenersToRow = (row) => {
        // Click (desktop) – use capture phase to run before Suno’s own handler
        row.addEventListener('click', onRowClick, true);

        // Touch (mobile)
        row.addEventListener('touchstart', onTouchStart, {passive: true});
        row.addEventListener('touchend',   onTouchEnd,   {passive: true});
        row.addEventListener('touchcancel', onTouchEnd, {passive: true});
    };

    const init = () => {
        // Attach to all rows that already exist
        document.querySelectorAll(ROW_SELECTOR).forEach(attachListenersToRow);

        // Observe the list container for rows that are added later (e.g., infinite scroll)
        const listContainer = document.querySelector('.clip-list');
        if (!listContainer) return; // safety

        const observer = new MutationObserver((mutations) => {
            for (const mut of mutations) {
                for (const node of mut.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    // Direct row added
                    if (node.matches && node.matches(ROW_SELECTOR)) {
                        attachListenersToRow(node);
                    }
                    // Or rows inside a newly added wrapper
                    const rows = node.querySelectorAll ? node.querySelectorAll(ROW_SELECTOR) : [];
                    rows.forEach(attachListenersToRow);
                }
            }
        });

        observer.observe(listContainer, {childList: true, subtree: true});
    };

    // Run once the page is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
