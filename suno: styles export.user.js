// ==UserScript==
// @name         suno: styles export/import
// @namespace    http://tampermonkey.net/
// @version      2026.08.23.0059
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

            const btnExport = document.createElement('div');
            btnExport.innerText = 'Export Styles';
            btnExport.onclick = () => { closeMenu(); handleExport(); };

            const btnImport = document.createElement('div');
            btnImport.innerText = 'Import Styles';
            btnImport.onclick = () => { closeMenu(); handleImportClick(); };

            const btnClear = document.createElement('div');
            btnClear.innerText = 'Clear (WIP)';
            btnClear.onclick = () => { closeMenu(); console.log('Clear triggered'); };

            menu.appendChild(btnExport);
            menu.appendChild(btnImport);
            menu.appendChild(btnClear);
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

    // Event delegation for the target button
    document.addEventListener('contextmenu', (e) => {
        const wrapper = e.target.closest('[data-testid="create-form-styles-wrapper"]');
        if (wrapper) {
            const firstButton = wrapper.querySelector('button');
            if (firstButton && (e.target === firstButton || firstButton.contains(e.target))) {
                e.preventDefault();
                showMenu(e.pageX, e.pageY);
            }
        }
    });

    // --- Core Logic ---
    function getScrollableParent(element) {
        let parent = element;
        while (parent && parent !== document.body) {
            const overflowY = window.getComputedStyle(parent).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return element;
    }

    async function handleExport() {
        const dialog = document.querySelector('div[role="dialog"]');
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
        const extractedStyles = new Map();
        let previousScrollTop = -1;

        scrollTarget.scrollTop = 0;
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log("Starting auto-scroll export...");

        while (true) {
            Array.from(container.children).forEach(entry => {
                const titleEl = entry.querySelector('span.text-sm');
                const promptEl = entry.querySelector('span.text-xs');

                const title = titleEl ? titleEl.innerText.trim() : '';
                const prompt = promptEl ? promptEl.innerText.trim() : '';

                if (title || prompt) {
                    const uniqueKey = `${title}|${prompt}`;
                    extractedStyles.set(uniqueKey, { title, prompt });
                }
            });

            if (Math.abs(scrollTarget.scrollTop - previousScrollTop) < 1) {
                break;
            }

            previousScrollTop = scrollTarget.scrollTop;
            scrollTarget.scrollTop += scrollTarget.clientHeight * 0.75;

            await new Promise(resolve => setTimeout(resolve, 250));
        }

        const stylesData = Array.from(extractedStyles.values());

        if (stylesData.length === 0) {
            alert("No styles found to export.");
            return;
        }

        console.log(`Exported ${stylesData.length} styles.`);

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stylesData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `suno_styles_${new Date().toISOString().split('T')[0]}.json`);
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