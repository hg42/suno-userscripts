// ==UserScript==
// @name         Suno Song Renamer Pro (Stable Selectors)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Batch rename Suno songs using stable attribute selectors and history
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- UI LOGIK ---
    const createUI = () => {
        const panel = document.createElement('div');
        panel.id = 'suno-renamer-ui';
        panel.style = "background: #18181b; color: #efeff1; padding: 15px; border-bottom: 2px solid #3f3f46; font-family: ui-sans-serif, system-ui; z-index: 9999; position: relative;";
        
        panel.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 1200px; margin: 0 auto;">
                <div style="flex: 2; min-width: 200px;">
                    <input id="match-input" placeholder="Suchen nach (Regex/String)..." style="width: 100%; background: #09090b; border: 1px solid #3f3f46; color: white; padding: 8px; border-radius: 4px;">
                </div>
                <div style="flex: 2; min-width: 200px;">
                    <input id="replace-input" placeholder="Ersetzen durch..." style="width: 100%; background: #09090b; border: 1px solid #3f3f46; color: white; padding: 8px; border-radius: 4px;">
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="cursor:pointer; display:flex; align-items:center; gap:5px;"><input type="checkbox" id="is-regex"> Regex</label>
                    <button id="run-rename" style="background: #3b82f6; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: 600;">Start Batch</button>
                </div>
                <div id="history-container" style="width: 100%; font-size: 12px; color: #a1a1aa;">
                    Verlauf: <span id="history-list"></span>
                </div>
            </div>
        `;

        // Versuche das Panel unter der Searchbox zu platzieren oder oben am Body
        const header = document.querySelector('header') || document.body;
        header.after(panel);
    };

    // --- CORE FUNKTIONEN ---
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const processSongs = async () => {
        const matchStr = document.getElementById('match-input').value;
        const replaceStr = document.getElementById('replace-input').value;
        const isRegex = document.getElementById('is-regex').checked;

        if (!matchStr) return alert("Bitte Suchstring eingeben!");
        saveHistory(matchStr, replaceStr);

        // Finde alle Zeilen basierend auf deiner Strukturbeschreibung
        const rows = document.querySelectorAll('.clip-row');
        console.log(`Starte Batch für ${rows.length} Zeilen...`);

        for (const row of rows) {
            // Finde das Link-Element, das den Titel enthält
            const titleLink = row.querySelector('a[href*="/song/"]');
            if (!titleLink) continue;

            const oldTitle = titleLink.innerText.trim();
            let newTitle = "";

            // Transformation berechnen
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
            } catch (e) {
                console.error("Regex Fehler:", e);
                break;
            }

            // Wenn Änderung nötig, UI-Workflow starten
            if (newTitle && newTitle !== oldTitle) {
                console.log(`Renaming: "${oldTitle}" -> "${newTitle}"`);
                
                // 1. Edit Button finden (via aria-label wie von dir beschrieben)
                const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                if (!editBtn) continue;
                
                editBtn.click();
                await sleep(400); // Warten bis Input erscheint

                // 2. Input Feld finden
                const input = row.querySelector('input[maxlength="80"]');
                if (input) {
                    input.value = newTitle;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    await sleep(100);

                    // 3. Save Button finden
                    const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                    if (saveBtn) {
                        saveBtn.click();
                        await sleep(600); // Pause für API Sync
                    }
                }
            }
        }
        alert("Batch abgeschlossen!");
    };

    // --- HISTORY HANDLING ---
    const saveHistory = (m, r) => {
        let history = JSON.parse(localStorage.getItem('suno-rename-hist') || '[]');
        // Duplikate vermeiden
        history = history.filter(h => h.m !== m);
        history.unshift({m, r});
        history = history.slice(0, 8);
        localStorage.setItem('suno-rename-hist', JSON.stringify(history));
        renderHistory();
    };

    const renderHistory = () => {
        const list = document.getElementById('history-list');
        const history = JSON.parse(localStorage.getItem('suno-rename-hist') || '[]');
        list.innerHTML = history.map(h => 
            `<span style="cursor:pointer; text-decoration:underline; margin-right:12px; display:inline-block;" title="Klicken zum Laden">
                ${h.m} → ${h.r}
            </span>`
        ).join('');

        // Event Listener für History-Items
        list.querySelectorAll('span').forEach((span, idx) => {
            span.onclick = () => {
                document.getElementById('match-input').value = history[idx].m;
                document.getElementById('replace-input').value = history[idx].r;
            };
        });
    };

    // --- INITIALISIERUNG ---
    setTimeout(() => {
        createUI();
        renderHistory();
        document.getElementById('run-rename').onclick = processSongs;
    }, 2500);

})();