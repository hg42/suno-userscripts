// ==UserScript==
// @name         suno: styles export/import
// @namespace    http://tampermonkey.net/
// @version      2026.08.23.0060
// @description  Export and import styles in Suno via right-click context menu (handles lazy loading).
// @author       hg42
// @namespace    https://github.com/hg42/suno-userscripts
// @icon         https://www.google.com/s2/favicons?sz=64&domain=suno.com
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration & State ---
    const MENU_ID = 'suno-custom-context-menu';
    const FILE_INPUT_ID = 'suno-style-import-input';
    const DIALOG_SELECTOR = '[role="dialog"][aria-labelledby]';

    // --- UI Setup ---
    function injectStyles() {
        if (document.getElementById('suno-userscript-styles')) return;
        const style = document.createElement('style');
        style.id = 'suno-userscript-styles';
        style.textContent = `
            #${MENU_ID} {
                position: absolute;
                z-index: 999999;
                background: #222;
                border: 1px solid #444;
                border-radius: 6px;
                padding: 4px 0;
                min-width: 150px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                color: #fff;
                font-family: sans-serif;
                font-size: 14px;
            }
            #${MENU_ID} div {
                padding: 8px 16px;
                cursor: pointer;
            }
            #${MENU_ID} div:hover {
                background: #333;
            }
        `;
        document.head.appendChild(style);
    }

    function createContextMenu() {
        let menu = document.getElementById(MENU_ID);
        if (!menu) {
            menu = document.createElement('div');
            menu.id = MENU_ID;
            menu.style.display = 'none';

            const btnExportJson = document.createElement('div');
            btnExportJson.innerText = 'Export as JSON';
            btnExportJson.onclick = () => { closeMenu(); handleExport('json'); };

            const btnExportText = document.createElement('div');
            btnExportText.innerText = 'Export as Text';
            btnExportText.onclick = () => { closeMenu(); handleExport('text'); };

            /* --- TEMPORARILY DISABLED ---
            const btnImport = document.createElement('div');
            btnImport.innerText = 'Import Styles';
            btnImport.onclick = () => { closeMenu(); handleImportClick(); };

            const btnClear = document.createElement('div');
            btnClear.innerText = 'Clear (WIP)';
            btnClear.onclick = () => { closeMenu(); console.log('Clear triggered'); };
            */

            menu.appendChild(btnExportJson);
            menu.appendChild(btnExportText);

            /* --- TEMPORARILY DISABLED ---
            menu.appendChild(btnImport);
            menu.appendChild(btnClear);
            */

            document.body.appendChild(menu);
        }
        return menu;
    }

    function createFileInput() {
        let input = document.getElementById(FILE_INPUT_ID);
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = FILE_INPUT_ID;
            input.accept = '.json';
            input.style.display = 'none';
            input.onchange = handleImportFile;
            document.body.appendChild(input);
        }
        return input;
    }

    // --- Event Handlers ---
    function showMenu(x, y) {
        const menu = createContextMenu();
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
    }

    function closeMenu() {
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.style.display = 'none';
    }

    // Global listener for outside clicks to close the menu
    document.addEventListener('click', (e) => {
        if (e.target.closest(`#${MENU_ID}`)) return;
        closeMenu();
    });

    // Event delegation
    document.addEventListener('contextmenu', (e) => {
        let menuTriggered = false;

        // 1. Ziel: Der ursprüngliche Button
        const firstButton = e.target.closest('button[aria-label~="style prompts"]');
        if (firstButton && (e.target === firstButton || firstButton.contains(e.target))) {
            menuTriggered = true;
        }

        // 2. Ziel: Ein Rechtsklick auf den Hintergrund des Dialogs
        const dialog = e.target.closest(DIALOG_SELECTOR);
        if (!menuTriggered && dialog) {
            const isInput = e.target.closest('input, textarea');
            const isListItem = e.target.closest('.group');

            if (!isInput && !isListItem) {
                menuTriggered = true;
            }
        }

        // Menü anzeigen
        if (menuTriggered) {
            e.preventDefault();
            e.stopPropagation();
            showMenu(e.pageX, e.pageY);
        }
    }, true);

    // --- Core Logic ---

    function getScrollableParent(element) {
        let parent = element;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto');
            if (isScrollable && parent.scrollHeight > parent.clientHeight) {
                return parent;
            }
            parent = parent.parentElement;
        }
        const dialog = element.closest('[role="dialog"]');
        if (dialog) {
            const viewport = dialog.querySelector('[data-radix-scroll-area-viewport]') || dialog.querySelector('.overflow-y-auto');
            if (viewport) return viewport;
            return dialog;
        }
        return element;
    }

    async function handleExport(format = 'json') {
        const dialog = document.querySelector(DIALOG_SELECTOR);
        if (!dialog) {
            alert("Please open the styles dialog first.");
            return;
        }

        const container = dialog.querySelector('.flex.flex-col');
        if (!container) {
            alert("Could not find the styles list (.flex.flex-col) inside the dialog.");
            return;
        }

        const scrollTarget = getScrollableParent(container);
        console.log("Found scroll target:", scrollTarget);

        const extractedStyles = new Map();
        let previousScrollTop = -1;

        scrollTarget.scrollTop = 0;
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log(`Starting auto-scroll export (${format})...`);

        while (true) {
            const groupRows = container.querySelectorAll('.group');

            groupRows.forEach(group => {
                const titleEl = group.querySelector('span.text-sm');
                const promptEl = group.querySelector('span.text-xs');

                const title = titleEl ? titleEl.innerText.trim() : '';
                const prompt = promptEl ? promptEl.innerText.trim() : '';

                if (title || prompt) {
                    const uniqueKey = `${title}|${prompt}`;
                    extractedStyles.set(uniqueKey, { title, prompt });
                }
            });

            const scrollAmount = Math.max(scrollTarget.clientHeight * 0.75, 200);
            scrollTarget.scrollBy({ top: scrollAmount, behavior: 'instant' });

            await new Promise(resolve => setTimeout(resolve, 300));

            if (Math.abs(scrollTarget.scrollTop - previousScrollTop) < 1) {
                break;
            }
            previousScrollTop = scrollTarget.scrollTop;
        }

        const stylesData = Array.from(extractedStyles.values());

        if (stylesData.length === 0) {
            alert("No styles found to export.");
            return;
        }

        console.log(`Exported ${stylesData.length} styles.`);

        let dataStr = "";
        let filename = "";
        const dateStr = new Date().toISOString().split('T')[0];

        if (format === 'json') {
            dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stylesData, null, 2));
            filename = `suno_styles_${dateStr}.json`;
        } else if (format === 'text') {
            const textContent = stylesData.map(style => `== ${style.title}\n${style.prompt}`).join('\n\n') + '\n';
            dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(textContent);
            filename = `suno_styles_${dateStr}.txt`;
        }

        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        scrollTarget.scrollTop = 0;
    }

    function handleImportClick() {
        const input = createFileInput();
        input.value = '';
        input.click();
    }

    function handleImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const importedStyles = JSON.parse(event.target.result);
                console.log("Successfully parsed imported styles:", importedStyles);
                alert(`Successfully read ${importedStyles.length} styles from file. See console for details.`);

                injectStylesIntoUI(importedStyles);

            } catch (err) {
                alert("Failed to parse JSON file.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    function injectStylesIntoUI(styles) {
        console.warn("DOM injection logic pending. Ready to process:", styles);
    }

    // Initialize CSS
    injectStyles();

})();