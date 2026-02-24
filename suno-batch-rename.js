// ==UserScript==
// @name         Suno Song Renamer Elite (v2.9.6)
// @namespace    http://tampermonkey.net/
// @version      2.9.6
// @description  Batch renames Suno songs. Includes Pin/Delete history, UI-Refresh workaround, and English comments.
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
            position: fixed; top: 15px; right: 15px; width: 340px;
            height: 520px; background: #111; border: 1px solid #333; color: #eee;
            padding: 12px; border-radius: 10px; z-index: 999999;
            font-family: sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
            display: none; font-size: 11px; flex-direction: column;
        }
        .modal-header { display:flex; justify-content:space-between; margin-bottom:10px; border-bottom: 1px solid #222; padding-bottom: 6px; flex-shrink: 0; }
        .input-wrapper { position: relative; margin-bottom: 8px; display: flex; align-items: center; }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 6px 25px 6px 8px; border-radius: 4px; box-sizing: border-box;
        }
        .hist-trigger { position: absolute; right: 8px; cursor: pointer; color: #666; font-size: 10px; user-select: none; }
        .suno-btn { padding: 5px 14px; border-radius: 20px; border: none; cursor: pointer; font-weight: bold; }

        #suno-rename-trigger {
            background: #3b82f6; color: #fff; padding: 0 16px; border-radius: 999px;
            cursor: pointer; margin-left: 8px; font-size: 12px; font-weight: 600;
            display: inline-flex; align-items: center; height: 32px; border: none;
        }

        .history-chip-container {
            display: flex; flex-direction: column; gap: 6px; margin-top: 10px;
            padding-top: 10px; border-top: 1px solid #222;
            flex-grow: 1; overflow-y: auto; overflow-x: hidden;
        }

        .history-chip {
            background: #1a1a1a; border: 1px solid #333; color: #aaa;
            padding: 6px 10px; border-radius: 8px; cursor: pointer;
            font-size: 10px; display: flex; align-items: center; justify-content: space-between;
        }
        .history-chip.pinned { border-color: #eab308; background: #2d2610; color: #fde68a; }
        .history-chip:hover { border-color: #3b82f6; color: #fff; }

        .action-icons { display: flex; gap: 8px; padding-left: 8px; }
        .pin-icon, .delete-icon { cursor: pointer; font-size: 12px; opacity: 0.5; }
        .delete-icon:hover { color: #ef4444; }

        .modal-footer { display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:12px; padding-top: 10px; border-top: 1px solid #222; flex-shrink: 0; }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const setupUI = () => {
        if (document.getElementById('suno-rename-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'suno-rename-modal';
        modal.innerHTML = `
            <div class="modal-header">
                <b style="color:#3b82f6;">BATCH RENAMER v2.9.6</b>
                <span id="close-modal" style="cursor:pointer;">✕</span>
            </div>
            <div class="input-section">
                <div class="input-wrapper"><input id="match-input" class="suno-input" placeholder="Search Pattern"><span class="hist-trigger" id="hist-m-btn">▼</span></div>
                <div class="input-wrapper"><input id="replace-input" class="suno-input" placeholder="Replace Pattern"><span class="hist-trigger" id="hist-r-btn">▼</span></div>
                <div id="hist-dropdown" style="position: absolute; background: #1a1a1a; border: 1px solid #444; width: calc(100% - 24px); z-index: 1000000; display: none; border-radius: 4px;"></div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="cursor:pointer;"><input type="checkbox" id="is-regex"> Regex</label>
                    <span id="count-display" style="color:#888;">Count: 0</span>
                </div>
            </div>
            <div class="history-chip-container" id="chip-container"></div>
            <div class="modal-footer">
                <button id="force-refresh" class="suno-btn" style="background:#444; color:white; font-size:9px;">Force UI Reset</button>
                <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Start</button>
                <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('run-rename').onclick = startBatch;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
        document.getElementById('force-refresh').onclick = triggerUIRefresh;
    };

    // --- WORKAROUND LOGIC TO FIX VIRTUAL SCROLLING ISSUES ---
    async function triggerUIRefresh() {
        console.log("Triggering UI Workspace Refresh...");
        // 1. Find the current active workspace/page link
        const allNavLinks = Array.from(document.querySelectorAll('a, button'));
        const activeLink = allNavLinks.find(el => el.getAttribute('aria-current') === 'page' || el.className.includes('active'));

        // 2. Find a neutral tab to toggle away and back
        const createTab = allNavLinks.find(el => el.innerText.includes('Create') || el.innerText.includes('Library'));

        if (createTab && activeLink && createTab !== activeLink) {
            createTab.click(); // Switch away
            await sleep(800);
            activeLink.click(); // Switch back to force playlist reload
            await sleep(1000); // Wait for the list to re-render
            console.log("UI Refreshed.");
        } else {
            // Fallback: Trigger resize and micro-scroll
            window.dispatchEvent(new Event('resize'));
            window.scrollBy(0, 10);
            window.scrollBy(0, -10);
        }
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function startBatch() {
        const m = document.getElementById('match-input').value;
        const r = document.getElementById('replace-input').value;
        const isRe = document.getElementById('is-regex').checked;
        if (!m) return;
        saveHistory(m, r);
        isRunning = true;
        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';

        let loopCounter = 0;

        while (isRunning) {
            const rows = Array.from(document.querySelectorAll('.clip-row'));

            for (const row of rows) {
                if (!isRunning) break;
                const link = row.querySelector('a[href*="/song/"]');
                if (!link) continue;
                const id = link.getAttribute('href').split('/').pop();
                if (processedIds.has(id)) continue;

                const oldT = link.innerText.trim();
                let newT = "";
                try {
                    newT = isRe ? oldT.replace(new RegExp(m, 'g'), r) : oldT.split(m).join(r);
                } catch(e) {
                    console.error("Regex Error", e);
                    isRunning = false;
                    break;
                }

                if (newT !== oldT) {
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
                                // Highlight successful rename in yellow
                                link.style.color = '#fbbf24';
                                processedIds.add(id);
                                document.getElementById('count-display').innerText = `Count: ${processedIds.size}`;
                                await sleep(800);
                            }
                        }
                    }
                } else {
                    processedIds.add(id);
                }
            }

            // UI-Refresh workaround every 5 loops to prevent playlist offset/desync
            loopCounter++;
            if (loopCounter % 5 === 0) {
                await triggerUIRefresh();
            }

            if (isRunning) {
                window.scrollBy(0, 800);
                await sleep(1200);
            }
        }
        isRunning = false;
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    }

    // --- HISTORY AND CHIP MANAGEMENT ---
    const renderChips = () => {
        const h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const container = document.getElementById('chip-container');
        if (!container) return;
        container.innerHTML = h.map((x, i) => `
            <div class="history-chip ${x.pinned ? 'pinned' : ''}" data-idx="${i}">
                <div class="chip-content" style="flex-grow:1; overflow:hidden;" data-idx="${i}">
                    <span>${x.m} <b>→</b> ${x.r}</span>
                </div>
                <div class="action-icons">
                    <span class="pin-icon" data-idx="${i}" title="Pin/Unpin">${x.pinned ? '📍' : '📌'}</span>
                    <span class="delete-icon" data-idx="${i}" title="Delete">🗑️</span>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.chip-content').forEach(c => c.onclick = () => {
            const item = h[c.dataset.idx];
            document.getElementById('match-input').value = item.m;
            document.getElementById('replace-input').value = item.r;
        });

        container.querySelectorAll('.pin-icon').forEach(p => p.onclick = (e) => {
            e.stopPropagation(); togglePin(p.dataset.idx);
        });

        container.querySelectorAll('.delete-icon').forEach(d => d.onclick = (e) => {
            e.stopPropagation(); deleteEntry(d.dataset.idx);
        });
    };

    const deleteEntry = (idx) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        h.splice(idx, 1);
        localStorage.setItem('suno-h6', JSON.stringify(h));
        renderChips();
    };

    const togglePin = (idx) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        h[idx].pinned = !h[idx].pinned;
        h.sort((a, b) => (b.pinned - a.pinned));
        localStorage.setItem('suno-h6', JSON.stringify(h));
        renderChips();
    };

    const saveHistory = (m, r) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const existingIdx = h.findIndex(x => x.m === m && x.r === r);
        let pinned = existingIdx > -1 ? h[existingIdx].pinned : false;
        if (existingIdx > -1) h.splice(existingIdx, 1);
        h.unshift({m, r, pinned});
        localStorage.setItem('suno-h6', JSON.stringify(h.slice(0, 20))); // History limit: 20
        renderChips();
    };

    // --- DOM INJECTION ---
    const injectTrigger = () => {
        if (document.getElementById('suno-rename-trigger')) return;
        const filterBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Filters'));
        if (filterBtn?.parentNode?.parentNode) {
            const btn = document.createElement('button');
            btn.id = 'suno-rename-trigger'; btn.innerText = 'Rename';
            filterBtn.parentNode.parentNode.append(btn);
            btn.onclick = () => {
                document.getElementById('suno-rename-modal').style.display = 'flex';
                renderChips();
            };
        }
    };

    // Initialization
    setupUI();
    const observer = new MutationObserver(() => { setupUI(); injectTrigger(); });
    observer.observe(document.body, { childList: true, subtree: true });
})();
