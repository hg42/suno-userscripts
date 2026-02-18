// ==UserScript==
// @name         Suno Song Renamer (Scroll-Aware)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Deep-scans the library and renames only visible items to bypass virtual scrolling.
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let processedIds = new Set(); // Verhindert Doppelt-Bearbeitung beim Scrollen

    const styles = `
        #suno-rename-modal {
            position: fixed; top: 10px; right: 10px; width: 300px;
            background: #111; border: 1px solid #333; color: #eee;
            padding: 8px; border-radius: 6px; z-index: 10001;
            font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.8);
            display: none; font-size: 11px;
        }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 4px; border-radius: 3px; margin-bottom: 4px; box-sizing: border-box;
        }
        .suno-btn { padding: 3px 8px; border-radius: 3px; border: none; cursor: pointer; font-weight: bold; }
        #suno-rename-trigger { background: #27272a; border: 1px solid #3f3f46; color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; margin-right: 8px; font-size: 12px; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const setupUI = () => {
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <b style="color:#3b82f6;">Renamer (Auto-Scroll)</b>
                <span id="close-modal" style="cursor:pointer;">✕</span>
            </div>
            <input id="match-input" class="suno-input" placeholder="Match (Regex/String)">
            <input id="replace-input" class="suno-input" placeholder="Replace">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="cursor:pointer;"><input type="checkbox" id="is-regex"> Regex</label>
                <div id="history-items"></div>
            </div>
            <div style="display:flex; gap:5px; align-items:center; justify-content:flex-end; border-top:1px solid #222; padding-top:5px;">
                <span id="count-display" style="color:#aaa;">Processed: 0</span>
                <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Start</button>
                <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
            </div>
        `;
        document.body.appendChild(modal);

        const injectBtn = () => {
            if (document.getElementById('suno-rename-trigger')) return;
            const filterBtn = document.querySelector('button[aria-label*="filter"], button[aria-label*="Filter"]');
            if (filterBtn) {
                const btn = document.createElement('button');
                btn.id = 'suno-rename-trigger';
                btn.innerText = 'Rename';
                filterBtn.parentNode.insertBefore(btn, filterBtn);
                btn.onclick = () => { modal.style.display = 'block'; renderHistory(); };
            }
        };

        new MutationObserver(injectBtn).observe(document.body, { childList: true, subtree: true });
        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('run-rename').onclick = startBatch;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function startBatch() {
        isRunning = true;
        processedIds.clear();
        const m = document.getElementById('match-input').value;
        const r = document.getElementById('replace-input').value;
        const isRe = document.getElementById('is-regex').checked;
        const countDisplay = document.getElementById('count-display');

        if (!m) return;
        saveHistory(m, r);

        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';

        let consecutiveEmptyChecks = 0;

        while (isRunning) {
            const rows = Array.from(document.querySelectorAll('.clip-row'));
            let foundInThisWindow = false;

            for (const row of rows) {
                if (!isRunning) break;

                const link = row.querySelector('a[href*="/song/"]');
                if (!link) continue;

                const id = link.getAttribute('href').split('/').pop();
                if (processedIds.has(id)) continue;

                const oldT = link.innerText.trim();
                let newT = isRe ? oldT.replace(new RegExp(m, 'g'), r) : oldT.split(m).join(r);

                if (newT !== oldT) {
                    foundInThisWindow = true;
                    row.scrollIntoView({ behavior: 'instant', block: 'center' });
                    await sleep(300);

                    const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                    if (editBtn) {
                        editBtn.click();
                        await sleep(500);
                        const input = row.querySelector('input[maxlength="80"]');
                        if (input) {
                            input.value = newT;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            await sleep(200);
                            const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                            if (saveBtn) {
                                saveBtn.click();
                                processedIds.add(id);
                                countDisplay.innerText = `Processed: ${processedIds.size}`;
                                await sleep(1200);
                            }
                        }
                    }
                } else {
                    // Auch wenn es kein Match ist, als verarbeitet markieren
                    processedIds.add(id);
                }
            }

            // Automatischer Scroll nach unten, um neue Elemente zu laden
            if (isRunning) {
                const scrollContainer = document.querySelector('main') || window;
                window.scrollBy(0, 400); 
                await sleep(800); // Zeit für Suno zum Nachladen

                // Check if we reached the bottom (very simple check)
                if (!foundInThisWindow) consecutiveEmptyChecks++;
                else consecutiveEmptyChecks = 0;

                if (consecutiveEmptyChecks > 10) break; // Ende der Liste vermutet
            }
        }

        isRunning = false;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
        countDisplay.innerText += ' (Finished)';
    }

    const saveHistory = (m, r) => {
        let h = JSON.parse(localStorage.getItem('suno-h5') || '[]');
        h = h.filter(x => x.m !== m).slice(0, 10);
        h.unshift({m, r});
        localStorage.setItem('suno-h5', JSON.stringify(h));
    };

    const renderHistory = () => {
        const h = JSON.parse(localStorage.getItem('suno-h5') || '[]');
        document.getElementById('history-items').innerHTML = h.map((x, i) => 
            `<span style="cursor:pointer; text-decoration:underline; color:#888; margin-right:4px;" data-idx="${i}">${x.m.substring(0,5)}</span>`
        ).join('');
        document.querySelectorAll('#history-items span').forEach(el => {
            el.onclick = () => {
                const item = h[el.dataset.idx];
                document.getElementById('match-input').value = item.m;
                document.getElementById('replace-input').value = item.r;
            };
        });
    };

    setTimeout(setupUI, 2000);
})();