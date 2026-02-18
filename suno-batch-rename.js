// ==UserScript==
// @name         Suno Song Renamer Pro (Prepend Edition)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Batch rename Suno songs with Regex, History and Stop-Button
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;

    // --- UI ERSTELLEN ---
    const createUI = () => {
        const panel = document.createElement('div');
        panel.id = 'suno-renamer-ui';
        panel.style = "background: #111; color: #eee; padding: 12px; border-bottom: 2px solid #333; font-family: sans-serif; position: relative; z-index: 10000;";
        
        panel.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: center;">
                <input id="match-input" placeholder="Suchen (Regex/Text)" style="flex: 1; min-width: 150px; background: #222; border: 1px solid #444; color: #fff; padding: 6px; border-radius: 4px;">
                <input id="replace-input" placeholder="Ersetzen durch" style="flex: 1; min-width: 150px; background: #222; border: 1px solid #444; color: #fff; padding: 6px; border-radius: 4px;">
                <label style="font-size: 13px; cursor: pointer;"><input type="checkbox" id="is-regex"> Regex</label>
                <button id="run-rename" style="background: #16a34a; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Start</button>
                <button id="stop-rename" style="background: #dc2626; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; display: none;">Stop</button>
            </div>
            <div id="history-row" style="margin-top: 8px; font-size: 11px; color: #888; text-align: center;">
                Verlauf: <span id="history-items"></span>
            </div>
        `;

        // .prepend setzt es an den Anfang des Ziel-Elements
        const target = document.body; 
        target.prepend(panel);
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // --- BATCH LOGIK ---
    const processSongs = async () => {
        const matchStr = document.getElementById('match-input').value;
        const replaceStr = document.getElementById('replace-input').value;
        const isRegex = document.getElementById('is-regex').checked;

        if (!matchStr) return;
        
        isRunning = true;
        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';
        
        saveHistory(matchStr, replaceStr);

        const rows = document.querySelectorAll('.clip-row');
        
        for (const row of rows) {
            if (!isRunning) break;

            const titleLink = row.querySelector('a[href*="/song/"]');
            if (!titleLink) continue;

            const oldTitle = titleLink.innerText.trim();
            let newTitle = "";

            try {
                if (isRegex) {
                    const re = new RegExp(matchStr, 'g');
                    if (re.test(oldTitle)) {
                        newTitle = oldTitle.replace(re, replaceStr);
                    }
                } else {
                    if (oldTitle.includes(matchStr)) {
                        newTitle = oldTitle.split(matchStr).join(replaceStr);
                    }
                }
            } catch (e) { console.error("Regex Error", e); break; }

            if (newTitle && newTitle !== oldTitle) {
                // Scroll in View, damit Buttons klickbar sind
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(200);

                const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                if (editBtn) {
                    editBtn.click();
                    await sleep(500);

                    const input = row.querySelector('input[maxlength="80"]');
                    if (input) {
                        input.value = newTitle;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        await sleep(200);

                        const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                        if (saveBtn) {
                            saveBtn.click();
                            await sleep(1000); // Mehr Zeit für den Server-Sync
                        }
                    }
                }
            }
        }

        stopProcess();
    };

    const stopProcess = () => {
        isRunning = false;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    };

    // --- HISTORY ---
    const saveHistory = (m, r) => {
        let history = JSON.parse(localStorage.getItem('suno-hist') || '[]');
        history = history.filter(h => h.m !== m).slice(0, 5);
        history.unshift({m, r});
        localStorage.setItem('suno-hist', JSON.stringify(history));
        renderHistory();
    };

    const renderHistory = () => {
        const span = document.getElementById('history-items');
        const history = JSON.parse(localStorage.getItem('suno-hist') || '[]');
        span.innerHTML = history.map(h => 
            `<span style="cursor:pointer; text-decoration:underline; margin: 0 5px;" title="${h.m} -> ${h.r}">${h.m.substring(0,10)}...</span>`
        ).join('');
        
        span.querySelectorAll('span').forEach((el, i) => {
            el.onclick = () => {
                document.getElementById('match-input').value = history[i].m;
                document.getElementById('replace-input').value = history[i].r;
            };
        });
    };

    // INIT
    setTimeout(() => {
        createUI();
        renderHistory();
        document.getElementById('run-rename').onclick = processSongs;
        document.getElementById('stop-rename').onclick = stopProcess;
    }, 2000);

})();