// ==UserScript==
// @name         Suno Song Renamer Elite (Fixed Placement)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Precise button injection next to search and pill styling.
// @author       Gemini/Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let processedIds = new Set();

    const styles = `
        #suno-rename-modal {
            position: fixed; top: 15px; right: 15px; width: 280px;
            background: #111; border: 1px solid #333; color: #eee;
            padding: 10px; border-radius: 8px; z-index: 99999;
            font-family: sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.8);
            display: none; font-size: 11px;
        }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 5px; border-radius: 4px; margin-bottom: 5px; box-sizing: border-box;
        }
        .suno-btn { 
            padding: 4px 12px; border-radius: 20px; 
            border: none; cursor: pointer; font-weight: bold; 
        }
        #suno-rename-trigger { 
            background: #3b82f6; border: none; color: #fff; 
            padding: 4px 14px; border-radius: 999px;
            cursor: pointer; margin-left: 8px; font-size: 11px; 
            font-weight: 600; white-space: nowrap;
            height: 28px; display: inline-flex; align-items: center;
        }
        #suno-rename-trigger:hover { background: #2563eb; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const setupUI = () => {
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom: 1px solid #222; padding-bottom: 4px;">
                <b style="color:#3b82f6;">Batch Renamer v1.9</b>
                <span id="close-modal" style="cursor:pointer; opacity: 0.5;">✕</span>
            </div>
            <input id="match-input" class="suno-input" placeholder="Search (Regex/String)">
            <input id="replace-input" class="suno-input" placeholder="Replace with">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <label style="cursor:pointer;"><input type="checkbox" id="is-regex"> Regex</label>
                <div id="history-items" style="display:flex; gap:3px;"></div>
            </div>
            <div style="display:flex; gap:6px; align-items:center; justify-content:space-between; border-top:1px solid #222; padding-top:10px;">
                <span id="count-display" style="color:#888;">Count: 0/0</span>
                <div>
                    <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Start</button>
                    <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const injectBtn = () => {
            if (document.getElementById('suno-rename-trigger')) return;
            
            // Wir suchen das Search-Input Feld
            const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
            if (searchInput) {
                // Wir gehen hoch zum direkten Container des Inputs, um daneben zu landen
                const container = searchInput.parentElement;
                if (container) {
                    const btn = document.createElement('button');
                    btn.id = 'suno-rename-trigger';
                    btn.innerText = 'Rename';
                    
                    // Wir erzwingen, dass der Container den Button nebeneinander anzeigt
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    
                    container.appendChild(btn);
                    btn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        modal.style.display = 'block'; 
                        renderHistory(); 
                    };
                }
            }
        };

        const observer = new MutationObserver(injectBtn);
        observer.observe(document.body, { childList: true, subtree: true });

        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('run-rename').onclick = startBatch;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
    };

    // ... (Logik-Teil bleibt identisch wie in v1.8) ...
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const refreshLayout = () => {
        window.dispatchEvent(new Event('resize'));
        window.scrollBy(0, 1); window.scrollBy(0, -1);
    };

    async function startBatch() {
        const m = document.getElementById('match-input').value;
        const r = document.getElementById('replace-input').value;
        const isRe = document.getElementById('is-regex').checked;
        const countDisplay = document.getElementById('count-display');
        if (!m) return;
        saveHistory(m, r);
        isRunning = true;
        processedIds.clear();
        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';
        let consecutiveNoMatches = 0;
        while (isRunning) {
            const rows = Array.from(document.querySelectorAll('.clip-row'));
            let matchFoundInView = false;
            for (const row of rows) {
                if (!isRunning) break;
                const link = row.querySelector('a[href*="/song/"]');
                if (!link) continue;
                const id = link.getAttribute('href').split('/').pop();
                if (processedIds.has(id)) continue;
                const oldT = link.innerText.trim();
                let newT = "";
                try {
                    if (isRe) {
                        const re = new RegExp(m, 'g');
                        if (re.test(oldT)) newT = oldT.replace(re, r);
                    } else if (oldT.includes(m)) {
                        newT = oldT.split(m).join(r);
                    }
                } catch (e) { console.error(e); isRunning = false; break; }
                if (newT && newT !== oldT) {
                    matchFoundInView = true;
                    row.scrollIntoView({ behavior: 'instant', block: 'center' });
                    await sleep(400);
                    const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                    if (editBtn) {
                        editBtn.click();
                        await sleep(600);
                        const input = row.querySelector('input[maxlength="80"]');
                        if (input) {
                            input.value = newT;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            await sleep(300);
                            const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                            if (saveBtn) {
                                saveBtn.click();
                                processedIds.add(id);
                                countDisplay.innerText = `Count: ${processedIds.size}`;
                                await sleep(1200); 
                                refreshLayout();
                                await sleep(500); 
                            }
                        }
                    }
                } else { processedIds.add(id); }
            }
            if (isRunning) {
                window.scrollBy(0, 500);
                await sleep(1000);
                if (!matchFoundInView) consecutiveNoMatches++;
                else consecutiveNoMatches = 0;
                if (consecutiveNoMatches > 12) break;
            }
        }
        isRunning = false;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    }

    const saveHistory = (m, r) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        h = h.filter(x => x.m !== m).slice(0, 10);
        h.unshift({m, r});
        localStorage.setItem('suno-h6', JSON.stringify(h));
    };

    const renderHistory = () => {
        const h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        document.getElementById('history-items').innerHTML = h.map((x, i) => 
            `<span style="cursor:pointer; text-decoration:underline; color:#666; font-size:10px;" data-idx="${i}">${x.m.substring(0,4)}..</span>`
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