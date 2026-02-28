Below is a **complete, ready‑to‑paste userscript** (Tampermonkey / Greasemonkey / Violentmonkey compatible) that adds the classic *Shift‑click* (and long‑press on touch devices) range‑selection behaviour to any “clip list” on the **Suno** website.

---

## 1. How it works (in a nutshell)

| Action | What the script does |
|--------|----------------------|
| **Normal click** | Toggles the clicked row’s selected state (the site already does this). |
| **Shift‑click** (desktop) | Selects every row between the last row you clicked **without** holding Shift and the row you just Shift‑clicked. |
| **Long‑press** (mobile / touch) | Holds the finger for ~500 ms → the script treats the next tap as a “Shift‑click”. This mimics the desktop behaviour on touch screens. |
| **Selection visual** | The script simply adds/removes the CSS class that Suno already uses for a selected row (`.selected` in the example). If Suno uses a different class, change the constant `SELECTED_CLASS` below. |

The script is **self‑contained** – no external libraries are required – and it watches the DOM for new rows that might be added dynamically (e.g., infinite scroll or AJAX loading).

---

## 2. Install the script

1. **Install a userscript manager**  
   - Chrome / Edge → **Tampermonkey** (Chrome Web Store)  
   - Firefox → **Greasemonkey** or **Tampermonkey** (AMO)  
   - Safari → **Tampermonkey** (App Store)

2. **Create a new script** and paste the code below.

3. **Save** – the script will automatically run on any page that matches `https://suno.com/*` (adjust the `@match` line if Suno uses a different domain).

---

## 3. The userscript code

```javascript
// ==UserScript==
// @name         Suno Clip List Shift‑Select
// @namespace    https://github.com/yourname/suno-shift-select
// @version      1.2.0
// @description  Enable shift‑click (and long‑press) range selection in Suno clip lists.
// @author       Your Name
// @match        https://suno.com/*               // <-- adjust if needed
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
```

---

## 4. Customising the script for Suno’s exact markup

| What you might need to change | Where in the script |
|------------------------------|----------------------|
| **Row selector** – the CSS that uniquely identifies a clip row | `const ROW_SELECTOR = '.clip-list .clip-row';` |
| **Selected‑state class** – the class Suno adds when a row is selected | `const SELECTED_CLASS = 'selected';` |
| **Container selector** – the element that holds the list (used for the MutationObserver) | `document.querySelector('.clip-list')` |
| **Long‑press duration** – make it shorter/longer for your device | `const LONG_PRESS_MS = 500;` |

If you open the Suno page, right‑click a clip row → *Inspect* and look at its class list, you’ll see something like `<div class="clip-row selected">`. Use those class names in the constants above.

---

## 5. How to test it

1. **Open a Suno page that shows a list of clips** (e.g., the “My clips” page).  
2. **Select a row** – it should behave exactly as before.  
3. **Shift‑click another row** – all rows between the first and second click should become selected (or deselected, matching the state of the second row).  
4. **On a phone/tablet**: press and hold a row for ~½ second, release, then tap another row. The range should be selected just like on desktop.

If nothing happens, open the browser console (`F12` → *Console*) and look for any error messages – they will usually point to a selector that needs adjusting.

---

## 6. Why this works without breaking Suno’s UI

* The script **does not replace** Suno’s own click handler; it runs **before** it (capture phase).  
* It only **adds/removes the same CSS class** Suno uses, so the visual styling stays consistent.  
* The MutationObserver ensures that rows added later (e.g., after scrolling) automatically get the same behaviour.

---

### TL;DR

Copy the script above into a new Tampermonkey/Greasemonkey userscript, adjust the few selector constants if Suno’s HTML differs, and you’ll have desktop‑style Shift‑click (plus mobile long‑press) range selection for any multiselect clip list on Suno. Happy selecting!