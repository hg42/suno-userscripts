// ==UserScript==
// @name         Suno Song Renamer Elite (v2.3)
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Universal anchor, yellow highlights, and full-context history chips.
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
            position: fixed; top: 15px; right: 15px; width: 320px;
            background: #111; border: 1px solid #333; color: #eee;
            padding: 12px; border-radius: 10px; z-index: 99999;
            font-family: sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
            display: none; font-size: 11px;
        }
        .input-wrapper { position: relative; margin-bottom: 8px; display: flex; align-items: center; }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 6px 25px 6px 8px; border-radius: 4px; box-sizing: border-box;
        }
        .hist-trigger {
            position: absolute; right: 8px; cursor: pointer; color: #666; font-size: 10px;
            user-select: none; transition: color 0.2s;
        }
        .hist-trigger:hover { color: #3b82f6; }
        .suno-btn { padding: 5px 14px; border-radius: 20px; border: none; cursor: pointer; font-weight: bold; }
        #suno-rename-trigger { 
            background: #27272a; border: 1px solid #3f3f46; color: #fff; 
            padding: 4px 14px; border-radius: 999px;
            cursor: pointer; margin-right: 8px; font-size: 12px; font-weight: 500;
            display: inline-flex; align-items: center; height: 32px;
        }
        #suno-rename-trigger:hover { background: #3f3f46; border-color: #52525b; }
        
        #hist-dropdown {
            position: absolute; background: #1a1a1a; border: 1px solid #444;
            width: 100%; z-index: 100000; display: none; max-height: 150px; overflow-y: auto;
            border-radius: 4px; margin-top: 2px;
        }
        .hist-item { padding: 6px 10px; cursor: pointer; border-bottom: 1px solid #222; }
        .hist-item:hover { background: #333; color: #3b82f6; }

        .history-chip-container {
            display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px;
            padding-top: 10px; border-top: 1px solid #222;
        }
        .history-chip {
            background: #222; border: 1px solid #333; color: #aaa;
            padding: 3px 8px; border-radius: 12px; cursor: pointer;
            white-space: nowrap; font-size: 10px; max-width: 100%;
            overflow: hidden; text-overflow: ellipsis;
        }
        .history-chip:hover { border-color: #3b82f6; color: #fff; }
        .chip-arrow { color: #3b82f6; margin: 0 4px; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const setupUI = () => {
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom: 1px solid #222; padding-bottom: 6px;">
                <b style="color:#3b82f6; letter-spacing: 0.5px;">BATCH RENAMER v2.3</b>
                <span id="close-modal" style="cursor:pointer; opacity: 0.6;">✕</span>
            </div>
            
            <div class="input-wrapper">
                <input id="match-input" class="suno-input" placeholder="Search Pattern">
                <span class="hist-trigger" id="hist-m-btn">▼</span>
            </div>
            
            <div class="input-wrapper">
                <input id="replace-input" class="suno-input" placeholder="Replace Pattern">
                <span class="hist-trigger" id="hist-r-btn">▼</span>
            </div>

            <div id="hist-dropdown"></div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                    <input type="checkbox" id="is-regex"> Regex
                </label>
                <span id="count-display" style="color:#888; font-weight:600;">Count: 0</span>
            </div>

            <div class="history-chip-container" id="chip-container"></div>
            
            <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:12px;">
                <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Start</button>
                <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
            </div>
        `;
        document.body.appendChild(modal);

        const injectBtn = () => {
            if (document.getElementById('suno-rename-trigger')) return;
            // Target the Filter button as the universal anchor
            const filterBtn = document.querySelector('button[aria-label*="filter"], button[aria-label*="Filter"]');
            if (filterBtn) {
                const btn = document.createElement('button');
                btn.id = 'suno-rename-trigger';
                btn.innerText = 'Rename';
                filterBtn.parentNode.insertBefore(btn, filterBtn);
                btn.onclick = (e) => {
                    modal.style.display = 'block'; 
                    renderChips();
                    setTimeout(() => document.getElementById('match-input').focus(), 50);
                };
            }
        };

        new MutationObserver(injectBtn).observe(document.body, { childList: true, subtree: true });

        // History Dropdown Logic (Individual fields)
        const showHist = (type) => {
            const h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
            const drop = document.getElementById('hist-dropdown');
            const target = type === 'm' ? 'match-input' : 'replace-input';
            const entries = h.map(x => type === 'm' ? x.m : x.r).filter(Boolean);
            
            if (entries.length === 0) return;
            drop.innerHTML = [...new Set(entries)].map(val => `<div class="hist-item">${val}</div>`).join('');
            drop.style.display = 'block';
            drop.style.top = (document.getElementById(type === 'm' ? 'match-input' : 'replace-input').offsetTop + 30) + 'px';

            drop.querySelectorAll('.hist-item').forEach(item => {
                item.onclick = () => {
                    document.getElementById(target).value = item.innerText;
                    drop.style.display = 'none';
                };
            });
        };

        document.getElementById('hist-m-btn').onclick = () => showHist('m');
        document.getElementById('hist-r-btn').onclick = () => showHist('r');

        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('run-rename').onclick = startBatch;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.classList.contains('hist-trigger')) document.getElementById('hist-dropdown').style.display = 'none';
        });
    };

    const renderChips = () => {
        const h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const container = document.getElementById('chip-container');
        container.innerHTML = h.map((x, i) => `
            <div class="history-chip" data-idx="${i}" title="${x.m} to ${x.r}">
                ${x.m} <span class="chip-arrow">→</span> ${x.r}
            </div>
        `).join('');

        container.querySelectorAll('.history-chip').forEach(chip => {
            chip.onclick = () => {
                const item = h[chip.dataset.idx];
                document.getElementById('match-input').value = item.m;
                document.getElementById('replace-input').value = item.r;
            };
        });
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const refreshLayout = () => { window.dispatchEvent(new Event('resize')); window.scrollBy(0, 1); window.scrollBy(0, -1); };

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
                } catch (e) { isRunning = false; break; }

                if (newT && newT !== oldT) {
                    matchFoundInView = true;
                    row.scrollIntoView({ behavior: 'instant', block: 'center' });
                    
                    // HIGHLIGHT: Yellow title during processing
                    const originalColor = link.style.color;
                    link.style.color = '#fbbf24'; 
                    link.style.fontWeight = 'bold';
                    
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
                    link.style.color = originalColor; // Revert color
                    link.style.fontWeight = '';
                } else { processedIds.add(id); }
            }
            if (isRunning) {
                window.scrollBy(0, 500);
                await sleep(1000);
                // Logic to stop if bottom is reached is handled by row processing
            }
        }
        isRunning = false;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    }

    const saveHistory = (m, r) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        h = h.filter(x => x.m !== m);
        h.unshift({m, r});
        localStorage.setItem('suno-h6', JSON.stringify(h.slice(0, 10)));
        renderChips();
    };

    setTimeout(setupUI, 2000);
})();