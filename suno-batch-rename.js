// ==UserScript==
// @name         Suno Song Renamer Pro (Robust Edition)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Batch rename Suno songs with dynamic re-selection and 10-item history
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;

    const createUI = () => {
        if (document.getElementById('suno-renamer-ui')) return;
        const panel = document.createElement('div');
        panel.id = 'suno-renamer-ui';
        panel.style = "background: #111; color: #eee; padding: 12px; border-bottom: 2px solid #333; font-family: sans-serif; position: sticky; top: 0; z-index: 10000; width: 100%;";
        
        panel.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: center; max-width: 1200px; margin: 0 auto;">
                <input id="match-input" placeholder="Suchen (Regex/Text)" style="flex: 1; min-width: 150px; background: #222; border: 1px solid #444; color: #fff; padding: 6px; border-radius: 4px;">
                <input id="replace-input" placeholder="Ersetzen durch" style="flex: 1; min-width: 150px; background: #222; border: 1px solid #444; color: #fff; padding: 6px; border-radius: 4px;">
                <label style="font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px;"><input type="checkbox" id="is-regex"> Regex</label>
                <button id="run-rename" style="background: #16a34a; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Start Batch</button>
                <button id="stop-rename" style="background: #dc2626; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; display: none;">Stop</button>
                <div id="status-info" style="font-size: 12px; color: #22c55e; margin-left: 10px;"></div>
            </div>
            <div id="history-row" style="margin-top: 8px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #222; padding-top: 5px;">
                History (max 10): <span id="history-items"></span>
            </div>
        `;
        document.body.prepend(panel);
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const processSongs = async () => {
        const matchStr = document.getElementById('match-input').value;
        const replaceStr = document.getElementById('replace-input').value;
        const isRegex = document.getElementById('is-regex').checked;
        const statusEl = document.getElementById('status-info');

        if (!matchStr) return;
        
        isRunning = true;
        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';
        saveHistory(matchStr, replaceStr);

        let processedCount = 0;
        let hasChangedSomething = true;

        // Wir nutzen eine While-Schleife, um nach jeder Änderung die Liste neu zu scannen
        while (isRunning && hasChangedSomething) {
            hasChangedSomething = false;
            // Greife die Zeilen JEDES Mal neu ab, um DOM-Referenzfehler zu vermeiden
            const rows = Array.from(document.querySelectorAll('.clip-row'));
            
            for (let i = 0; i < rows.length; i++) {
                if (!isRunning) break;

                const row = rows[i];
                const titleLink = row.querySelector('a[href*="/song/"]');
                if (!titleLink) continue;

                const oldTitle = titleLink.innerText.trim();
                let newTitle = "";

                try {
                    if (isRegex) {
                        const re = new RegExp(matchStr, 'g');
                        if (re.test(oldTitle)) newTitle = oldTitle.replace(re, replaceStr);
                    } else {
                        if (oldTitle.includes(matchStr)) newTitle = oldTitle.split(matchStr).join(replaceStr);
                    }
                } catch (e) { console.error("Regex Error", e); isRunning = false; break; }

                if (newTitle && newTitle !== oldTitle) {
                    statusEl.innerText = `Bearbeite: ${newTitle}...`;
                    row.scrollIntoView({ behavior: 'instant', block: 'center' });
                    
                    const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                    if (editBtn) {
                        editBtn.click();
                        await sleep(600); // Zeit zum Einblenden des Inputs

                        // Erneute Suche des Inputs innerhalb der Zeile (wichtig!)
                        const input = row.querySelector('input[maxlength="80"]');
                        if (input) {
                            input.value = newTitle;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            await sleep(300);

                            const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                            if (saveBtn) {
                                saveBtn.click();
                                processedCount++;
                                hasChangedSomething = true; 
                                await sleep(1200); // Warten auf API & Re-Render
                                // Nach einem Erfolg brechen wir die innere Schleife ab und scannen das DOM neu
                                break; 
                            }
                        }
                    }
                }
            }
            
            if (!hasChangedSomething) {
                isRunning = false; // Nichts mehr zu tun
            }
        }

        statusEl.innerText = `Fertig! ${processedCount} Titel angepasst.`;
        stopProcess();
    };

    const stopProcess = () => {
        isRunning = false;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    };

    // --- HISTORY (10 Items) ---
    const saveHistory = (m, r) => {
        let history = JSON.parse(localStorage.getItem('suno-hist-v2') || '[]');
        history = history.filter(h => h.m !== m);
        history.unshift({m, r});
        history = history.slice(0, 10); // Auf 10 erhöht
        localStorage.setItem('suno-hist-v2', JSON.stringify(history));
        renderHistory();
    };

    const renderHistory = () => {
        const span = document.getElementById('history-items');
        const history = JSON.parse(localStorage.getItem('suno-hist-v2') || '[]');
        span.innerHTML = history.map(h => 
            `<span style="cursor:pointer; text-decoration:underline; margin: 0 8px; white-space: nowrap;" title="${h.m} -> ${h.r}">
                ${h.m.substring(0,12)}${h.m.length > 12 ? '..' : ''}
            </span>`
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
    }, 2500);

})();