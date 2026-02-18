// ==UserScript==
// @name         Suno Song Renamer Pro (Overlay Edition)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Batch rename via Overlay-Modal, triggered by a button next to filter.
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;

    // --- STYLES ---
    const styles = `
        #suno-rename-trigger {
            background: #27272a;
            border: 1px solid #3f3f46;
            color: #fff;
            padding: 4px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            margin-right: 8px;
        }
        #suno-rename-trigger:hover { background: #3f3f46; }
        
        #suno-rename-modal {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #18181b;
            border: 1px solid #3f3f46;
            padding: 24px;
            border-radius: 12px;
            z-index: 10001;
            width: 450px;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
            font-family: sans-serif;
        }
        #suno-rename-backdrop {
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 10000;
        }
        .suno-input {
            width: 100%; background: #09090b; border: 1px solid #3f3f46;
            color: white; padding: 10px; border-radius: 6px; margin-bottom: 12px;
        }
        .suno-btn {
            padding: 10px 20px; border-radius: 6px; border: none; font-weight: bold; cursor: pointer;
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- UI ELEMENTE ERSTELLEN ---
    const setupUI = () => {
        // Modal & Backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'suno-rename-backdrop';
        
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <h3 style="margin-top:0; color:#fff;">Batch Rename</h3>
            <input id="match-input" class="suno-input" placeholder="Suchen (Regex/Text)...">
            <input id="replace-input" class="suno-input" placeholder="Ersetzen durch...">
            <div style="margin-bottom: 15px;">
                <label style="color:#eee; cursor:pointer;"><input type="checkbox" id="is-regex"> Als Regex behandeln</label>
            </div>
            <div id="history-section" style="margin-bottom: 15px; font-size:12px; color:#a1a1aa;">
                <strong>History:</strong> <div id="history-items" style="margin-top:5px; display:flex; flex-wrap:wrap; gap:5px;"></div>
            </div>
            <div style="display:flex; gap:10px; justify-content: flex-end;">
                <button id="close-modal" class="suno-btn" style="background:#3f3f46; color:white;">Abbrechen</button>
                <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Starten</button>
                <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
            </div>
            <div id="status-info" style="margin-top:15px; font-size:12px; color:#22c55e; text-align:center;"></div>
        `;
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        // Trigger Button Injection
        const injectTrigger = () => {
            if (document.getElementById('suno-rename-trigger')) return;
            // Suche Filter-Button (Suno nutzt oft aria-label oder Texte für Filter)
            const filterBtn = document.querySelector('button[aria-label*="filter"], button[aria-label*="Filter"]');
            if (filterBtn) {
                const btn = document.createElement('button');
                btn.id = 'suno-rename-trigger';
                btn.innerHTML = 'Rename';
                filterBtn.parentNode.insertBefore(btn, filterBtn);
                
                btn.onclick = () => {
                    modal.style.display = 'block';
                    backdrop.style.display = 'block';
                    renderHistory();
                };
            }
        };

        // Überwache das DOM, um den Button einzufügen, wenn der Workspace geladen wird
        const observer = new MutationObserver(injectTrigger);
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Event Listener
        document.getElementById('close-modal').onclick = () => {
            modal.style.display = 'none';
            backdrop.style.display = 'none';
        };
        document.getElementById('run-rename').onclick = processSongs;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
    };

    // --- LOGIK (ROBUST RE-SCAN) ---
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

        while (isRunning && hasChangedSomething) {
            hasChangedSomething = false;
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
                } catch (e) { console.error(e); isRunning = false; break; }

                if (newTitle && newTitle !== oldTitle) {
                    statusEl.innerText = `Ändere: ${oldTitle}...`;
                    row.scrollIntoView({ behavior: 'instant', block: 'center' });
                    
                    const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                    if (editBtn) {
                        editBtn.click();
                        await sleep(600);
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
                                await sleep(1200);
                                break; // Zurück zum Anfang der while-Schleife (DOM Re-Scan)
                            }
                        }
                    }
                }
            }
            if (!hasChangedSomething) isRunning = false;
        }

        statusEl.innerText = `Abgeschlossen. ${processedCount} Songs bearbeitet.`;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    };

    // --- HISTORY (10 ITEMS) ---
    const saveHistory = (m, r) => {
        let history = JSON.parse(localStorage.getItem('suno-hist-v3') || '[]');
        history = history.filter(h => h.m !== m);
        history.unshift({m, r});
        history = history.slice(0, 10);
        localStorage.setItem('suno-hist-v3', JSON.stringify(history));
    };

    const renderHistory = () => {
        const container = document.getElementById('history-items');
        const history = JSON.parse(localStorage.getItem('suno-hist-v3') || '[]');
        container.innerHTML = history.map((h, i) => 
            `<button class="suno-btn" style="background:#27272a; color:#ccc; font-size:10px; padding:4px 8px;" data-idx="${i}">
                ${h.m.substring(0,10)}..
            </button>`
        ).join('');
        
        container.querySelectorAll('button').forEach(btn => {
            btn.onclick = () => {
                const item = history[btn.dataset.idx];
                document.getElementById('match-input').value = item.m;
                document.getElementById('replace-input').value = item.r;
            };
        });
    };

    // INIT
    setTimeout(setupUI, 2000);

})();