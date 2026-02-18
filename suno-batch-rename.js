// ==UserScript==
// @name         Suno Song Renamer Elite
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Compact UI, Preview-Mode, ID-based renaming
// @author       Coding-Assistant
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let pendingChanges = [];

    const styles = `
        #suno-rename-modal {
            position: fixed; top: 10px; right: 10px; width: 320px;
            background: #111; border: 1px solid #333; color: #eee;
            padding: 10px; border-radius: 8px; z-index: 10001;
            font-family: ui-sans-serif, system-ui; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            display: none; font-size: 12px;
        }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 4px 8px; border-radius: 4px; margin-bottom: 6px; box-sizing: border-box;
        }
        .preview-box {
            max-height: 200px; overflow-y: auto; background: #050505;
            border: 1px solid #222; margin: 8px 0; padding: 5px; border-radius: 4px;
        }
        .preview-item { border-bottom: 1px dashed #333; padding: 4px 0; margin-bottom: 4px; }
        .old-t { color: #f87171; text-decoration: line-through; display: block; }
        .new-t { color: #4ade80; display: block; font-weight: bold; }
        .suno-btn { padding: 4px 12px; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; font-size: 11px; }
        #suno-rename-trigger { background: #27272a; border: 1px solid #3f3f46; color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; margin-right: 8px; font-size: 12px; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const setupUI = () => {
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <b style="color:#3b82f6;">Batch Rename</b>
                <span id="close-modal" style="cursor:pointer; padding:0 5px;">✕</span>
            </div>
            <input id="match-input" class="suno-input" placeholder="Match (Regex/String)">
            <input id="replace-input" class="suno-input" placeholder="Replace">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="cursor:pointer;"><input type="checkbox" id="is-regex"> Regex</label>
                <button id="preview-btn" class="suno-btn" style="background:#3b82f6; color:white;">Preview</button>
            </div>
            <div id="preview-container" class="preview-box" style="display:none;"></div>
            <div id="history-section" style="margin: 8px 0; font-size:10px; color:#888;">
                History: <span id="history-items"></span>
            </div>
            <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end; border-top:1px solid #222; padding-top:8px;">
                <span id="count-display" style="color:#aaa; font-weight:bold;"></span>
                <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white; display:none;">Start</button>
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

        const observer = new MutationObserver(injectBtn);
        observer.observe(document.body, { childList: true, subtree: true });

        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('preview-btn').onclick = generatePreview;
        document.getElementById('run-rename').onclick = startExecution;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const generatePreview = () => {
        const m = document.getElementById('match-input').value;
        const r = document.getElementById('replace-input').value;
        const isRe = document.getElementById('is-regex').checked;
        if (!m) return;

        pendingChanges = [];
        const rows = document.querySelectorAll('.clip-row');
        let html = '';

        rows.forEach(row => {
            const link = row.querySelector('a[href*="/song/"]');
            if (!link) return;
            const id = link.getAttribute('href').split('/').pop();
            const oldT = link.innerText.trim();
            let newT = isRe ? oldT.replace(new RegExp(m, 'g'), r) : oldT.split(m).join(r);

            if (newT !== oldT) {
                pendingChanges.push({ id, oldT, newT });
                html += `<div class="preview-item"><span class="old-t">${oldT}</span><span class="new-t">${newT}</span></div>`;
            }
        });

        const container = document.getElementById('preview-container');
        container.innerHTML = html || '<div style="color:#888;">No matches found.</div>';
        container.style.display = 'block';
        document.getElementById('run-rename').style.display = html ? 'inline-block' : 'none';
        document.getElementById('count-display').innerText = `0/${pendingChanges.length}`;
    };

    const startExecution = async () => {
        isRunning = true;
        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';
        saveHistory(document.getElementById('match-input').value, document.getElementById('replace-input').value);

        const total = pendingChanges.length;
        for (let i = 0; i < total; i++) {
            if (!isRunning) break;
            const change = pendingChanges[i];
            
            // Find row by song ID in href
            const row = document.querySelector(`.clip-row:has(a[href*="${change.id}"])`);
            if (!row) {
                console.warn(`Song ${change.id} not in DOM, skipping...`);
                continue;
            }

            row.scrollIntoView({ behavior: 'instant', block: 'center' });
            await sleep(400);

            const editBtn = row.querySelector('button[aria-label*="Edit title"]');
            if (editBtn) {
                editBtn.click();
                await sleep(500);
                const input = row.querySelector('input[maxlength="80"]');
                if (input) {
                    input.value = change.newT;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    await sleep(300);
                    const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                    if (saveBtn) {
                        saveBtn.click();
                        document.getElementById('count-display').innerText = `${i+1}/${total}`;
                        await sleep(1500); // Wait for API and DOM to settle
                    }
                }
            }
        }
        isRunning = false;
        document.getElementById('stop-rename').style.display = 'none';
        document.getElementById('count-display').innerText += ' - Done';
    };

    const saveHistory = (m, r) => {
        let h = JSON.parse(localStorage.getItem('suno-h4') || '[]');
        h = h.filter(x => x.m !== m).slice(0, 9);
        h.unshift({m, r});
        localStorage.setItem('suno-h4', JSON.stringify(h));
    };

    const renderHistory = () => {
        const h = JSON.parse(localStorage.getItem('suno-h4') || '[]');
        document.getElementById('history-items').innerHTML = h.map((x, i) => 
            `<span style="cursor:pointer; text-decoration:underline; margin-right:5px;" data-idx="${i}">${x.m.substring(0,8)}</span>`
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