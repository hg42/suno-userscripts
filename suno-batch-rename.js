// ==UserScript==
// @name         Suno Song Renamer Pro
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Batch rename Suno songs with Regex and History
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Konfiguration der Selektoren (muss ggf. bei Suno-Updates angepasst werden)
    const SELECTORS = {
        songItem: '[data-testid="song-row"]', // Beispiel-Selektor für die Zeile
        titleDisplay: '.song-title-class',    // Die Klasse, die den Namen anzeigt
        editButton: 'button[aria-label="Edit"]',
        inputField: 'input[name="title"]',
        saveButton: 'button[type="submit"]'
    };

    // --- UI ERSTELLEN ---
    const panel = document.createElement('div');
    panel.innerHTML = `
        <div id="suno-renamer-ui" style="background: #111; color: #fff; padding: 15px; border-bottom: 1px solid #333; font-family: sans-serif;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <input id="match-input" placeholder="Match (Regex/String)" style="flex: 1; background: #222; border: 1px solid #444; color: white; padding: 5px;">
                <input id="replace-input" placeholder="Replace" style="flex: 1; background: #222; border: 1px solid #444; color: white; padding: 5px;">
                <label><input type="checkbox" id="is-regex"> Regex</label>
                <button id="run-rename" style="background: #22c55e; color: white; border: none; padding: 5px 15px; cursor: pointer;">Start Batch</button>
            </div>
            <div id="history-container" style="font-size: 12px; color: #aaa;">
                History: <span id="history-list"></span>
            </div>
        </div>
    `;

    // Panel in die Seite einfügen (versucht es unter die Searchbox zu hängen)
    const injectUI = () => {
        const target = document.querySelector('nav') || document.body; 
        if (!document.getElementById('suno-renamer-ui')) {
            target.prepend(panel);
        }
    };

    // --- LOGIK ---
    const runBatch = async () => {
        const matchStr = document.getElementById('match-input').value;
        const replaceStr = document.getElementById('replace-input').value;
        const isRegex = document.getElementById('is-regex').checked;
        
        saveHistory(matchStr, replaceStr);

        const songs = document.querySelectorAll(SELECTORS.songItem);
        console.log(`Gefundene Songs: ${songs.length}`);

        for (const song of songs) {
            const titleEl = song.querySelector(SELECTORS.titleDisplay);
            if (!titleEl) continue;

            let oldTitle = titleEl.innerText;
            let newTitle = "";

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

            if (newTitle && newTitle !== oldTitle) {
                await updateSongTitle(song, newTitle);
            }
        }
    };

    // Simuliert die Klicks zum Speichern
    const updateSongTitle = async (songElement, newTitle) => {
        // 1. Edit Button klicken
        const editBtn = songElement.querySelector(SELECTORS.editButton);
        if (!editBtn) return;
        editBtn.click();

        // Warten bis Modal offen
        await new Promise(r => setTimeout(r, 500));

        // 2. Input finden und Wert setzen
        const input = document.querySelector(SELECTORS.inputField);
        if (input) {
            input.value = newTitle;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 3. Save klicken
            const saveBtn = document.querySelector(SELECTORS.saveButton);
            if (saveBtn) {
                saveBtn.click();
                await new Promise(r => setTimeout(r, 800)); // Pause für API-Request
            }
        }
    };

    // History Funktionen
    const saveHistory = (m, r) => {
        let history = JSON.parse(localStorage.getItem('suno-rename-history') || '[]');
        history.unshift({m, r});
        history = history.slice(0, 5);
        localStorage.setItem('suno-rename-history', JSON.stringify(history));
        renderHistory();
    };

    const renderHistory = () => {
        const list = document.getElementById('history-list');
        const history = JSON.parse(localStorage.getItem('suno-rename-history') || '[]');
        list.innerHTML = history.map(h => 
            `<span style="cursor:pointer; text-decoration:underline; margin-right:8px;" onclick="document.getElementById('match-input').value='${h.m}'; document.getElementById('replace-input').value='${h.r}';">
                ${h.m}→${h.r}
            </span>`
        ).join('');
    };

    // Start
    setTimeout(() => {
        injectUI();
        renderHistory();
        document.getElementById('run-rename').addEventListener('click', runBatch);
    }, 2000);

})();