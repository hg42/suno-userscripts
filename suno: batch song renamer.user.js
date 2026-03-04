// ==UserScript==
// @name         suno: batch song renamer
// @version      2026.03.04.0216
// @description  batch renames songs with auto-apply, manual sorting, reverse processing, and variables
// @author       hg42
// @namespace    https://github.com/hg42/suno-userscripts
// @match        https://suno.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let processedIds = new Set();
    let draggedIndex = null;

    const styles = `
        #suno-rename-modal {
            position: fixed; top: 15px; right: 15px; width: 340px;
            height: 80vh; max-height: calc(100vh - 30px); background: #111; border: 1px solid #333; color: #eee;
            padding: 12px; border-radius: 10px; z-index: 999999;
            font-family: sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
            display: none; font-size: 11px; flex-direction: column;
        }
        .modal-header { display:flex; justify-content:space-between; margin-bottom:10px; border-bottom: 1px solid #222; padding-bottom: 6px; flex-shrink: 0; }
        .input-wrapper { position: relative; margin-bottom: 8px; display: flex; align-items: center; }
        .suno-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: #fff; padding: 6px 30px 6px 8px; border-radius: 4px; box-sizing: border-box;
        }
        .input-clear { user-select: none; }
        .input-clear:hover { color: #ef4444; }
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
            padding: 6px 10px; border-radius: 8px; cursor: grab;
            font-size: 10px; display: flex; align-items: flex-start; justify-content: space-between;
        }
        .history-chip.pinned { border-color: #eab308; background: #2d2610; color: #fde68a; }
        .history-chip.always-apply { border-color: #16a34a; background: #0d2818; color: #86efac; }
        .history-chip.pinned.always-apply { border-color: #84cc16; background: #1a2614; color: #bef264; }
        .history-chip:hover { border-color: #3b82f6; color: #fff; }
        .history-chip.dragging { opacity: 0.5; cursor: grabbing; }
        .history-chip.drag-over { border-top: 2px solid #3b82f6; }

        .action-icons { display: flex; gap: 8px; padding-left: 8px; align-self: flex-start; padding-top: 2px; }
        .pin-icon, .always-icon, .delete-icon { cursor: pointer; font-size: 12px; opacity: 0.5; }
        .pin-icon:hover { color: #eab308; opacity: 1; }
        .always-icon:hover { color: #16a34a; opacity: 1; }
        .delete-icon:hover { color: #ef4444; opacity: 1; }
        .pin-icon.active, .always-icon.active { opacity: 1; }

        .drag-handle { cursor: grab; font-size: 14px; opacity: 0.4; margin-right: 8px; align-self: flex-start; padding-top: 2px; }
        .drag-handle:hover { opacity: 0.8; }

        .modal-footer { display:flex; gap:6px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin-top:12px; padding-top: 10px; border-top: 1px solid #222; flex-shrink: 0; }
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
                <b style="color:#3b82f6;">BATCH RENAMER</b>
                <span id="close-modal" style="cursor:pointer;">✕</span>
            </div>
            <div class="modal-buttons" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; padding-bottom:10px; border-bottom: 1px solid #222;">
                <div style="display:flex; gap:4px; white-space:nowrap;">
                    <span style="color:#888; font-size:10px; align-self:center; margin-right:4px;">Rules</span>
                    <button id="export-replacements" class="suno-btn" style="background:#6366f1; color:white; font-size:11px;" title="Export replacement rules">📁↓</button>
                    <button id="import-replacements" class="suno-btn" style="background:#8b5cf6; color:white; font-size:11px;" title="Import replacement rules">📂↑</button>
                </div>
                <div style="display:flex; gap:4px; white-space:nowrap;">
                    <span style="color:#888; font-size:10px; align-self:center; margin-right:4px;">Titles</span>
                    <button id="export-titles" class="suno-btn" style="background:#0891b2; color:white; font-size:11px;" title="Export titles">📁↓</button>
                    <button id="import-titles" class="suno-btn" style="background:#06b6d4; color:white; font-size:11px;" title="Import titles">📂↑</button>
                </div>
                <div style="display:flex; gap:8px; white-space:nowrap;">
                    <button id="force-refresh" class="suno-btn" style="background:#444; color:white; font-size:9px;">Refresh</button>
                    <button id="run-rename" class="suno-btn" style="background:#16a34a; color:white;">Start</button>
                </div>
            </div>
            <div class="input-section">
                <div class="input-wrapper">
                    <input id="match-input" class="suno-input" placeholder="Search Regex">
                    <span class="input-clear" id="clear-match" style="position: absolute; right: 8px; cursor: pointer; color: #666; font-size: 14px; display: none;">✕</span>
                </div>
                <div class="input-wrapper">
                    <input id="replace-input" class="suno-input" placeholder="Replace Pattern (use {var}, {i})">
                    <span class="input-clear" id="clear-replace" style="position: absolute; right: 8px; cursor: pointer; color: #666; font-size: 14px; display: none;">✕</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span id="count-display" style="color:#888;">Count: 0</span>
                </div>
            </div>
            <div class="history-chip-container" id="chip-container"></div>
            <div class="modal-footer">
                <button id="stop-rename" class="suno-btn" style="background:#dc2626; color:white; display:none;">Stop</button>
            </div>
        `;
        document.body.appendChild(modal);

        // Hidden file inputs for imports
        const importReplacementsInput = document.createElement('input');
        importReplacementsInput.type = 'file';
        importReplacementsInput.accept = '.json';
        importReplacementsInput.style.display = 'none';
        document.body.appendChild(importReplacementsInput);

        const importTitlesInput = document.createElement('input');
        importTitlesInput.type = 'file';
        importTitlesInput.accept = '.txt';
        importTitlesInput.style.display = 'none';
        document.body.appendChild(importTitlesInput);

        document.getElementById('close-modal').onclick = () => { modal.style.display = 'none' };
        document.getElementById('run-rename').onclick = startBatch;
        document.getElementById('stop-rename').onclick = () => { isRunning = false; };
        document.getElementById('force-refresh').onclick = triggerUIRefresh;

        // Clear button handlers
        const matchInput = document.getElementById('match-input');
        const replaceInput = document.getElementById('replace-input');
        const clearMatch = document.getElementById('clear-match');
        const clearReplace = document.getElementById('clear-replace');

        matchInput.addEventListener('input', () => {
            clearMatch.style.display = matchInput.value ? 'block' : 'none';
        });
        replaceInput.addEventListener('input', () => {
            clearReplace.style.display = replaceInput.value ? 'block' : 'none';
        });

        clearMatch.onclick = () => {
            matchInput.value = '';
            clearMatch.style.display = 'none';
            matchInput.focus();
        };
        clearReplace.onclick = () => {
            replaceInput.value = '';
            clearReplace.style.display = 'none';
            replaceInput.focus();
        };

        // Export/Import handlers
        document.getElementById('export-replacements').onclick = exportReplacements;
        document.getElementById('import-replacements').onclick = () => importReplacementsInput.click();
        importReplacementsInput.onchange = importReplacements;

        document.getElementById('export-titles').onclick = exportTitles;
        document.getElementById('import-titles').onclick = () => importTitlesInput.click();
        importTitlesInput.onchange = importTitles;
    };

    async function triggerUIRefresh() {
        console.log("Triggering UI Workspace Refresh...");
        const allNavLinks = Array.from(document.querySelectorAll('a, button'));
        const createTab = allNavLinks.find(el => el.href && el.href.includes('/create') && !el.href.includes('/hooks'));

        if (createTab) {
            createTab.click();
            await sleep(1000);
            console.log("UI Refreshed.");
        } else {
            window.dispatchEvent(new Event('resize'));
            window.scrollBy(0, 10);
            window.scrollBy(0, -10);
        }
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // --- EXPORT/IMPORT REPLACEMENTS ---
    function exportReplacements() {
        const history = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const dataStr = JSON.stringify(history, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = `${now.toISOString().slice(0, 10)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        link.href = url;
        link.download = `suno-replacements-${timestamp}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function importReplacements(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) {
                    alert('Invalid format: expected JSON array');
                    return;
                }

                // Merge with existing history
                let existing = JSON.parse(localStorage.getItem('suno-h6') || '[]');

                // Add imported items, skip duplicates
                for (const item of imported) {
                    const isDuplicate = existing.some(x => x.m === item.m && x.r === item.r);
                    if (!isDuplicate) {
                        existing.push(item);
                    }
                }

                localStorage.setItem('suno-h6', JSON.stringify(existing.slice(0, 50))); // Increased limit for imports
                renderChips();
                alert(`Imported ${imported.length} rules (duplicates skipped)`);
            } catch (err) {
                alert('Error importing: ' + err.message);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    // --- EXPORT/IMPORT TITLES ---
    async function exportTitles() {
        console.log("Exporting titles...");

        // Scroll to bottom to load all clips
        let lastHeight = 0;
        let currentHeight = document.documentElement.scrollHeight;

        while (currentHeight > lastHeight) {
            lastHeight = currentHeight;
            window.scrollTo(0, document.documentElement.scrollHeight);
            await sleep(500);
            currentHeight = document.documentElement.scrollHeight;
        }

        await sleep(500);

        // Collect all clips
        const rows = Array.from(document.querySelectorAll('.clip-row'));
        const titles = [];

        for (const row of rows) {
            const link = row.querySelector('a[href*="/song/"]');
            if (!link) continue;

            const id = link.getAttribute('href').split('/').pop();
            const title = link.innerText.trim();
            titles.push(`${id} ${title}`);
        }

        // Export as text file
        const dataStr = titles.join('\n');
        const dataBlob = new Blob([dataStr], { type: 'text/plain' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = `${now.toISOString().slice(0, 10)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        link.href = url;
        link.download = `suno-titles-${timestamp}.txt`;
        link.click();
        URL.revokeObjectURL(url);

        console.log(`Exported ${titles.length} titles`);
        alert(`Exported ${titles.length} titles`);
    }

    async function importTitles(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const lines = e.target.result.split('\n').filter(l => l.trim());
                const titleMap = new Map();

                // Parse file: ID TITLE
                for (const line of lines) {
                    const match = line.match(/^(\S+)\s+(.+)$/);
                    if (match) {
                        const [, id, title] = match;
                        titleMap.set(id, title.trim());
                    }
                }

                if (titleMap.size === 0) {
                    alert('No valid entries found. Format: ID TITLE');
                    return;
                }

                console.log(`Importing ${titleMap.size} titles...`);

                // Start applying titles
                isRunning = true;
                document.getElementById('run-rename').style.display = 'none';
                document.getElementById('stop-rename').style.display = 'inline-block';

                let appliedCount = 0;
                let notFoundCount = 0;

                // Scroll to bottom first
                let lastHeight = 0;
                let currentHeight = document.documentElement.scrollHeight;

                while (currentHeight > lastHeight && isRunning) {
                    lastHeight = currentHeight;
                    window.scrollTo(0, document.documentElement.scrollHeight);
                    await sleep(500);
                    currentHeight = document.documentElement.scrollHeight;
                }

                await sleep(500);

                const processedIds = new Set();
                let noNewClipsCounter = 0;

                while (isRunning) {
                    const rows = Array.from(document.querySelectorAll('.clip-row'));
                    let processed = 0;

                    for (const row of rows) {
                        if (!isRunning) break;

                        const link = row.querySelector('a[href*="/song/"]');
                        if (!link) continue;

                        const id = link.getAttribute('href').split('/').pop();

                        if (processedIds.has(id)) {
                            link.style.color = '#bfbffb';
                            continue;
                        }

                        processed++;

                        if (titleMap.has(id)) {
                            const newTitle = titleMap.get(id);
                            const currentTitle = link.innerText.trim();

                            link.style.color = '#fbbf24';
                            row.scrollIntoView({ behavior: 'instant', block: 'center' });
                            await sleep(100);

                            if (newTitle !== currentTitle) {
                                await sleep(300);
                                const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                                if (editBtn) {
                                    editBtn.click();
                                    await sleep(300);
                                    const input = row.querySelector('input');
                                    if (input) {
                                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                            window.HTMLInputElement.prototype,
                                            'value'
                                        ).set;
                                        nativeInputValueSetter.call(input, newTitle);
                                        input.dispatchEvent(new Event('input', { bubbles: true }));
                                        await sleep(300);
                                        const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                                        if (saveBtn) {
                                            saveBtn.style.color = '#24ff24';
                                            await sleep(100);
                                            saveBtn.click();
                                            link.style.color = '#24ff24';
                                            appliedCount++;
                                            document.getElementById('count-display').innerText = `Applied: ${appliedCount}`;
                                            await sleep(700);
                                        }
                                    }
                                }
                            }
                        } else {
                            notFoundCount++;
                        }

                        processedIds.add(id);
                        link.style.color = '#bfbffb';
                    }

                    if (processed === 0) {
                        noNewClipsCounter++;
                        if (noNewClipsCounter >= 3) break;
                    } else {
                        noNewClipsCounter = 0;
                    }

                    if (isRunning) {
                        window.scrollBy(0, -400);
                        await sleep(300);
                    }
                }

                isRunning = false;
                await triggerUIRefresh();
                document.getElementById('run-rename').style.display = 'inline-block';
                document.getElementById('stop-rename').style.display = 'none';

                alert(`Import complete!\nApplied: ${appliedCount}\nNot found in file: ${notFoundCount}`);

            } catch (err) {
                isRunning = false;
                document.getElementById('run-rename').style.display = 'inline-block';
                document.getElementById('stop-rename').style.display = 'none';
                alert('Error importing titles: ' + err.message);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    async function startBatch() {
        const m = document.getElementById('match-input').value;
        const r = document.getElementById('replace-input').value;

        // Get always-apply patterns
        const history = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const alwaysPatterns = history.filter(x => x.alwaysApply);

        // Allow start if either manual pattern exists OR always-apply patterns exist
        if (!m && alwaysPatterns.length === 0) return;

        // Save history only if manual pattern is provided
        if (m) {
            saveHistory(m, r);
        }

        // Clear input fields after starting (can be retrieved from history)
        document.getElementById('match-input').value = '';
        document.getElementById('replace-input').value = '';
        document.getElementById('clear-match').style.display = 'none';
        document.getElementById('clear-replace').style.display = 'none';

        isRunning = true;
        document.getElementById('run-rename').style.display = 'none';
        document.getElementById('stop-rename').style.display = 'inline-block';

        processedIds = new Set();

        // Build pattern list: always-apply patterns first (in order), then current pattern if exists
        const patterns = [...alwaysPatterns];
        if (m) {
            patterns.push({m, r});
        }

        const titleCounts = new Map(); // Track title occurrences for {var}
        let indexCounter = 1; // For {i} variable

        // STEP 1: Scroll to the very bottom first to load all clips
        console.log("Scrolling to bottom to load all clips...");
        let lastHeight = 0;
        let currentHeight = document.documentElement.scrollHeight;

        while (currentHeight > lastHeight && isRunning) {
            lastHeight = currentHeight;
            window.scrollTo(0, document.documentElement.scrollHeight);
            await sleep(500);
            currentHeight = document.documentElement.scrollHeight;
        }

        console.log("Reached bottom. Starting rename process from bottom to top...");
        await sleep(500);

        // STEP 2: Now process while scrolling upward slowly (single-line scrolling for lazy loading)
        // We start at the BOTTOM (newest clips with highest existing numbers if any)
        // and work our way UP (to older clips), so index counter counts DOWN
        let noNewClipsCounter = 0;
        let lastProcessedId = null;

        // Find highest existing number to start counter from there
        let highestNumber = 0;
        const allRows = Array.from(document.querySelectorAll('.clip-row'));
        for (const row of allRows) {
            const link = row.querySelector('a[href*="/song/"]');
            if (link) {
                const title = link.innerText.trim();
                const match = title.match(/#(\d{3})/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > highestNumber) highestNumber = num;
                }
            }
        }
        indexCounter = highestNumber > 0 ? highestNumber + 1 : 1;

        while (isRunning) {
            const rows = Array.from(document.querySelectorAll('.clip-row'));
            let processedInThisIteration = false;

            // Find the first unprocessed row (from current viewport)
            for (const row of rows) {
                if (!isRunning) break;

                const link = row.querySelector('a[href*="/song/"]');
                if (!link) continue;

                const id = link.getAttribute('href').split('/').pop();

                // Skip if already processed
                if (processedIds.has(id)) {
                    link.style.color = '#bfbffb';
                    continue;
                }

                // Found an unprocessed clip - process it
                processedInThisIteration = true;

                link.style.color = '#fbbf24';

                let currentTitle = link.innerText.trim();
                let finalTitle = currentTitle;

                // Check if title already has a 3-digit number (#xxx)
                const existingNumberMatch = currentTitle.match(/#(\d{3})/);
                let skipIndexVar = false;
                let iValue = null;

                if (existingNumberMatch) {
                    // Title already numbered, set counter to this value
                    indexCounter = parseInt(existingNumberMatch[1]);
                    skipIndexVar = true;
                } else {
                    // Use current counter value
                    iValue = `#${String(indexCounter).padStart(3, '0')}`;
                }

                // Apply all patterns in sequence
                for (const pattern of patterns) {
                    const patternM = pattern.m;
                    const patternR = pattern.r;

                    try {
                        // Always use regex
                        let newTitle = finalTitle.replace(new RegExp(patternM, 'g'), patternR);

                        // Variable substitution
                        if (newTitle !== finalTitle) {
                            // Prepare variables
                            const variables = {};

                            // {i} - only if not already numbered
                            if (!skipIndexVar && iValue) {
                                variables.i = iValue;
                            }

                            // {var} - variant counter (only if duplicate title)
                            const baseTitle = newTitle.replace(/\{var\}/g, '').replace(/\{i\}/g, '');
                            const count = titleCounts.get(baseTitle) || 0;
                            if (count > 0) {
                                variables.var = String(count + 1);
                            }

                            // Apply variable substitutions
                            for (const [varName, varValue] of Object.entries(variables)) {
                                const regex = new RegExp(`\\{${varName}\\}`, 'g');
                                newTitle = newTitle.replace(regex, varValue);
                            }

                            // Remove any remaining unset variables
                            newTitle = newTitle.replace(/\{[^}]+\}/g, '');

                            finalTitle = newTitle;
                        }
                    } catch(e) {
                        console.error("Regex Error", e);
                        isRunning = false;
                        break;
                    }
                }

                // Track title for {var} variable
                const baseTitleForTracking = finalTitle.replace(/\{var\}/g, '').replace(/\{i\}/g, '');
                titleCounts.set(baseTitleForTracking, (titleCounts.get(baseTitleForTracking) || 0) + 1);

                row.scrollIntoView({ behavior: 'instant', block: 'center' });
                await sleep(100);

                if (finalTitle !== currentTitle) {
                    await sleep(300);
                    const editBtn = row.querySelector('button[aria-label*="Edit title"]');
                    if (editBtn) {
                        editBtn.click();
                        await sleep(300);
                        const input = row.querySelector('input');
                        if (input) {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLInputElement.prototype,
                                'value'
                            ).set;
                            nativeInputValueSetter.call(input, finalTitle);
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            await sleep(300);
                            const saveBtn = row.querySelector('button[aria-label*="Save title"]');
                            if (saveBtn) {
                                saveBtn.style.color = '#24ff24';
                                await sleep(100);
                                saveBtn.click();
                                link.style.color = '#24ff24';
                                processedIds.add(id);
                                document.getElementById('count-display').innerText = `Count: ${processedIds.size}`;
                                await sleep(700);
                            }
                        }
                    }
                } else {
                    processedIds.add(id);
                }

                // Increment index counter only if we didn't skip it
                if (!skipIndexVar) {
                    indexCounter++;
                }

                link.style.color = '#bfbffb';
                lastProcessedId = id;

                // After processing one clip, scroll up just a bit to load more
                // Use small scroll amount to respect lazy loading
                window.scrollBy(0, -50);
                await sleep(200);

                break; // Process only one clip per iteration to handle lazy loading properly
            }

            // Check if we processed anything in this iteration
            if (!processedInThisIteration) {
                noNewClipsCounter++;
                if (noNewClipsCounter >= 5) {
                    console.log("No new clips found for 5 iterations, finishing...");
                    break;
                }
                // Scroll up a bit more to try to find new clips
                window.scrollBy(0, -100);
                await sleep(300);
            } else {
                noNewClipsCounter = 0;
            }
        }

        isRunning = false;
        await triggerUIRefresh();
        document.getElementById('run-rename').style.display = 'inline-block';
        document.getElementById('stop-rename').style.display = 'none';
    }

    // --- HISTORY AND CHIP MANAGEMENT ---
    const renderChips = () => {
        const h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const container = document.getElementById('chip-container');
        if (!container) return;

        container.innerHTML = h.map((x, i) => `
            <div class="history-chip ${x.pinned ? 'pinned' : ''} ${x.alwaysApply ? 'always-apply' : ''}"
                 data-idx="${i}"
                 draggable="true">
                <span class="drag-handle">⋮</span>
                <div class="chip-content" style="flex-grow:1; overflow:hidden;" data-idx="${i}">
                    <span>${x.m} <b>→</b> ${x.r}</span>
                </div>
                <div class="action-icons">
                    <span class="pin-icon ${x.pinned ? 'active' : ''}" data-idx="${i}" title="Pin/Unpin">📌</span>
                    <span class="always-icon ${x.alwaysApply ? 'active' : ''}" data-idx="${i}" title="Always apply">⚡</span>
                    <span class="delete-icon" data-idx="${i}" title="Delete">🗑️</span>
                </div>
            </div>
        `).join('');

        // Chip content click
        container.querySelectorAll('.chip-content').forEach(c => {
            c.onclick = () => {
                const item = h[c.dataset.idx];
                document.getElementById('match-input').value = item.m;
                document.getElementById('replace-input').value = item.r;
            }
        });

        // Pin toggle
        container.querySelectorAll('.pin-icon').forEach(p => {
            p.onclick = (e) => {
                e.stopPropagation();
                togglePin(p.dataset.idx);
            }
        });

        // Auto-apply toggle
        container.querySelectorAll('.always-icon').forEach(a => {
            a.onclick = (e) => {
                e.stopPropagation();
                toggleAlwaysApply(a.dataset.idx);
            }
        });

        // Delete
        container.querySelectorAll('.delete-icon').forEach(d => {
            d.onclick = (e) => {
                e.stopPropagation();
                deleteEntry(d.dataset.idx);
            }
        });

        // Drag and drop
        container.querySelectorAll('.history-chip').forEach(chip => {
            chip.addEventListener('dragstart', handleDragStart);
            chip.addEventListener('dragover', handleDragOver);
            chip.addEventListener('drop', handleDrop);
            chip.addEventListener('dragend', handleDragEnd);
            chip.addEventListener('dragenter', handleDragEnter);
            chip.addEventListener('dragleave', handleDragLeave);
        });
    };

    const handleDragStart = (e) => {
        draggedIndex = parseInt(e.target.dataset.idx);
        e.target.classList.add('dragging');
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDragEnter = (e) => {
        const target = e.target.closest('.history-chip');
        if (target) target.classList.add('drag-over');
    };

    const handleDragLeave = (e) => {
        const target = e.target.closest('.history-chip');
        if (target) target.classList.remove('drag-over');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const target = e.target.closest('.history-chip');
        if (!target) return;

        target.classList.remove('drag-over');
        const dropIndex = parseInt(target.dataset.idx);

        if (draggedIndex !== null && draggedIndex !== dropIndex) {
            reorderHistory(draggedIndex, dropIndex);
        }
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove('dragging');
        document.querySelectorAll('.history-chip').forEach(chip => {
            chip.classList.remove('drag-over');
        });
        draggedIndex = null;
    };

    const reorderHistory = (fromIndex, toIndex) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const [moved] = h.splice(fromIndex, 1);
        h.splice(toIndex, 0, moved);
        localStorage.setItem('suno-h6', JSON.stringify(h));
        renderChips();
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
        localStorage.setItem('suno-h6', JSON.stringify(h));
        renderChips();
    };

    const toggleAlwaysApply = (idx) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        h[idx].alwaysApply = !h[idx].alwaysApply;

        // Always-apply implies pinned
        if (h[idx].alwaysApply) {
            h[idx].pinned = true;
        }

        localStorage.setItem('suno-h6', JSON.stringify(h));
        renderChips();
    };

    const saveHistory = (m, r) => {
        let h = JSON.parse(localStorage.getItem('suno-h6') || '[]');
        const existingIdx = h.findIndex(x => x.m === m && x.r === r);
        let pinned = existingIdx > -1 ? h[existingIdx].pinned : false;
        let alwaysApply = existingIdx > -1 ? h[existingIdx].alwaysApply : false;

        if (existingIdx > -1) h.splice(existingIdx, 1);
        h.unshift({m, r, pinned, alwaysApply});
        localStorage.setItem('suno-h6', JSON.stringify(h.slice(0, 20)));
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
