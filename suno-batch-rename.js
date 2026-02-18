// ==UserScript==
// @name         Suno Song Renamer Elite (v2.2)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  History dropdown buttons and yellow highlight for active renaming.
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
            position: fixed; top: 15px; right: 15px; width: 300px;
            background: #111; border: 1px solid #333; color: #eee;
            padding: 10px; border-radius: 8px; z-index: 99999;
            font-family: sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.8);
            display: none; font-size: 11px;
        }
        .input-wrapper { position: relative; margin-bottom: 6px; display: flex; align-items: center; }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 6px 25px 6px 8px; border-radius: 4px; box-sizing: border-box;
        }
        .hist-trigger {
            position: absolute; right: 8px; cursor: pointer; color: #666; font-size: 10px;
            user-select: none; transition: color 0.2s;
        }
        .hist-trigger:hover { color: #3b82f6; }
        .suno-btn { padding: 4px 12px; border-radius: 20px; border: none; cursor: pointer; font-weight: bold; }
        #suno-rename-trigger { 
            background: #3b82f6; color: #fff; padding: 4px 14px; border-radius: 999px;
            cursor: pointer; margin-left: 8px; font-size: 11px; font-weight: 600; 
            white-space: nowrap; height: 28px; display: inline-flex; align-items: center;
        }
        #hist-dropdown {
            position: absolute; background: #1a1a1a; border: 1px solid #333;
            width: 100%; z-index: 100000; display: none; max-height: 150px; overflow-y: auto;
            border-radius: 4px; margin-top: 2px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .hist-item { padding: 5px 8px; cursor: pointer; border-bottom: 1px solid #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hist-item:hover { background: #333; color: #3b82f6; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const setupUI = () => {
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom: 1px solid #222; padding-bottom: 4px;">
                <b style="color:#3b82f6;">Batch Renamer v2.2</b>
                <span id="close-modal" style="cursor:pointer; opacity: 0.5;">✕</span>
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

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <label style="cursor:pointer;"><input type="checkbox" id="is-regex"> Regex</label>
                <span id="count-display" style="color:#888;">Count: 0</span>
            </div>
            
            <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end; border-top:1px solid #222; padding-top:10px;">
                <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Start</button>
                <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
            </div>
        `;
        document.body.appendChild(modal);

        const injectBtn = () => {
            if (document.getElementById('suno-rename-trigger')) return;
            const searchInput = document.querySelector('input[aria-label*="Search clips"]');
            if (searchInput) {
                const container = searchInput.parentElement;
                if (container) {
                    const btn = document.createElement('button');
                    btn.id = 'suno-rename-trigger';
                    btn.innerText = 'Rename';
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    container.appendChild(btn);
                    btn.onclick = (e) => {
                        e.preventDefault();
                        modal.style.display = 'block'; 
                        document.getElementById('match-input').focus();
                    };
                }
            }
        };

        new MutationObserver(injectBtn).observe(document.body, { childList: true, subtree: true });

        // History UI Logic
        const showHist = (type) => {
            const h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
            const drop = document.getElementById('hist-dropdown');
            const targetInput = type === 'm' ? 'match-input' : 'replace-input';
            const btn = type === 'm' ? 'hist-m-btn' : 'hist-r-btn';
            
            drop.innerHTML = h.map(x => `<div class="hist-item">${type === 'm' ? x.m : x.r}</div>`).join('');
            drop.style.display = 'block';
            drop.style.top = (document.getElementById(btn).offsetTop + 20) + 'px';

            const items = drop.querySelectorAll('.hist-item');
            items.forEach((item, idx) => {
                item.onclick = () => {
                    document.getElementById(targetInput).value = item.innerText;
                    drop.style.display = 'none';
                    document.getElementById(targetInput).focus();
                };
            });
        };

        document.getElementById('hist-m-btn').onclick = () => showHist('m');
        document.getElementById('hist-r-btn').onclick = () => showHist('r');
        document.addEventListener('click', (e) => {
            if (!e.target.classList.contains('hist-trigger')) document.getElementById('hist-dropdown').style.display = 'none';
        });

        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('run-rename').onclick = startBatch;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
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
                    
                    // HIGHLIGHT: Set title to yellow
                    link.style.color = '#fbbf24'; 
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
                                link.style.color = ''; // Reset color
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
                if (!matchFoundInView) { /* continue scrolling logic */ }
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

    setTimeout(setupUI, 2000);
})();