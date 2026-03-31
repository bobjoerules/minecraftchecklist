let completedIds = JSON.parse(localStorage.getItem('blockcheck_completed_ids') || '{}');
let skippedIds = JSON.parse(localStorage.getItem('blockcheck_skipped_ids') || '{}');
let searchQuery = '';
let selectedCategory = 'all';
let sortMethod = localStorage.getItem('blockcheck_sort') || 'alphabetical';
let currentBatch = 0;
const BATCH_SIZE = 100;
let filteredItems = [];
let loadMoreObserver = null;

const itemsGrid = document.getElementById('items-grid');
const completedListContainer = document.getElementById('completed-list');
const searchInput = document.getElementById('item-search');
const categorySelect = document.getElementById('item-category');
const sortSelect = document.getElementById('completed-sort');
const totalCountEl = document.getElementById('total-count');
const completionPercentEl = document.getElementById('completion-percentage');
const statusSummaryEl = document.getElementById('status-summary');
const hideCreativeCheck = document.getElementById('hide-creative');
const hideNonStackableCheck = document.getElementById('hide-non-stackable');
const showSkippedCheck = document.getElementById('show-skipped');
const resetSkipsBtn = document.getElementById('reset-skips-btn');
const itemTemplate = document.getElementById('item-card-template');
const completedTemplate = document.getElementById('completed-item-template');

function init() {
    // Load saved checkbox states
    if (hideCreativeCheck) {
        hideCreativeCheck.checked = localStorage.getItem('blockcheck_hide_creative') === 'true';
    }
    if (hideNonStackableCheck) {
        hideNonStackableCheck.checked = localStorage.getItem('blockcheck_hide_nonstackable') === 'true';
    }
    if (showSkippedCheck) {
        showSkippedCheck.checked = localStorage.getItem('blockcheck_show_skipped') === 'true';
    }

    renderItems();
    renderCompleted();
    updateStats();

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderItems();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            selectedCategory = e.target.value;
            renderItems();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortMethod = e.target.value;
            localStorage.setItem('blockcheck_sort', sortMethod);
            renderCompleted();
        });
    }

    if (hideCreativeCheck) {
        hideCreativeCheck.addEventListener('change', (e) => {
            localStorage.setItem('blockcheck_hide_creative', e.target.checked);
            renderItems();
            updateStats();
        });
    }

    if (hideNonStackableCheck) {
        hideNonStackableCheck.addEventListener('change', (e) => {
            localStorage.setItem('blockcheck_hide_nonstackable', e.target.checked);
            renderItems();
            updateStats();
        });
    }

    if (showSkippedCheck) {
        showSkippedCheck.addEventListener('change', (e) => {
            localStorage.setItem('blockcheck_show_skipped', e.target.checked);
            renderItems();
            updateStats();
        });
    }

    if (resetSkipsBtn) {
        resetSkipsBtn.addEventListener('click', () => {
            showCustomModal({
                title: 'Reset Skips',
                message: 'This will make all hidden items visible again. Are you sure?',
                confirmText: 'Reset Skips',
                onConfirm: () => resetSkips()
            });
        });
    }

    initThemeSwitcher();
    initBackgroundGallery();
    initExportImport();
}

function updateStats() {
    if (typeof MINECRAFT_ITEMS === 'undefined') return;

    const hideCreative = hideCreativeCheck ? hideCreativeCheck.checked : false;
    const hideNonStackable = hideNonStackableCheck ? hideNonStackableCheck.checked : false;
    const showSkipped = showSkippedCheck ? showSkippedCheck.checked : false;

    const itemsToStat = MINECRAFT_ITEMS.filter(item => {
        const creativeFilter = !hideCreative || !item.creative;
        const stackableFilter = !hideNonStackable || item.stackable;
        const skipFilter = showSkipped || !skippedIds[item.id];
        return creativeFilter && stackableFilter && skipFilter;
    });

    const total = itemsToStat.length;
    const itemIdsToStat = new Set(itemsToStat.map(item => item.id));
    const completedCount = Object.keys(completedIds).filter(id => itemIdsToStat.has(id)).length;

    const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    if (totalCountEl) totalCountEl.textContent = `${total} Items Total`;
    if (completionPercentEl) {
        completionPercentEl.textContent = `${percent}%`;
        completionPercentEl.classList.add('visible');
    }
    if (statusSummaryEl) {
        statusSummaryEl.textContent = `${completedCount} / ${total} Done`;
        if (percent === 100) {
            statusSummaryEl.classList.add('all-ready');
        } else {
            statusSummaryEl.classList.remove('all-ready');
        }
    }
}

function getSortKey(item) {
    const name = item.name.toLowerCase();
    const id = item.id.toLowerCase();

    // Special grouping for Earth: Soil, Sand and Ice types together
    if (id.includes('dirt') || id.includes('grass') || id.includes('podzol') || id.includes('mycelium')) {
        return '00_earth_soil'; 
    }

    if (id === 'ice' || id.includes('packed_ice') || id.includes('blue_ice')) {
        return '01_earth_ice';
    }
    
    // Grouping for Sand and Sandstone
    if (item.category === 'earth' && id.includes('sand')) {
        if (id.includes('red')) return '03_earth_sand_red';
        return '02_earth_sand_base';
    }

    const stoneMats = ['andesite', 'diorite', 'granite', 'blackstone', 'basalt', 'tuff', 'deepslate', 'cobblestone', 'calcite', 'obsidian', 'dripstone', 'infested'];
    if (item.category === 'stone') {
        if (id.includes('quartz')) return 'quartz_group:blocks';
        if (id.includes('prismarine') || id.includes('sea_lantern')) return 'ocean_monument:blocks';
        if (id.includes('netherrack') || id.includes('nether_brick')) return 'nether_rock:blocks';
        for (const mat of stoneMats) {
            if (id.includes(mat)) return `stone_blocks:${mat}`;
        }
    }

    if (id.includes('coral')) return 'ocean:coral';

    if (id.includes('quartz')) return 'quartz_group:items';

    if (id.includes('nylium')) return 'nether_flora:nylium';

    if (id.includes('sapling') || id.includes('propagule')) return 'saplings:all';
    if (id.includes('leaves')) return 'leaves:all';



    if (['slabs', 'stairs', 'walls', 'buttons', 'pressure_plates'].includes(item.category)) {
        // Only treat as top-level if not wood
        return item.category;
    }
    if (item.category === 'redstone') {
        return 'redstone:items';
    }

    if (item.category === 'plants') {
        if (id.includes('flower') || id.includes('tulip') || id.includes('orchid') || id.includes('poppy') || id.includes('daisy') || id.includes('dandelion') || id.includes('allium') || id.includes('cornflower') || id.includes('lily') || id.includes('sunflower') || id.includes('peony') || id.includes('rose') || id.includes('lilac') || id.includes('azalea') || id.includes('torchflower') || id.includes('pitcher') || id === 'spore_blossom') {
            return 'plants_flowers:01_flowers';
        }
        return 'plants_flowers:03_other';
    }

    const coloredMats = ['bed', 'wool', 'carpet', 'terracotta', 'concrete', 'shulker_box', 'glass', 'candle', 'stained_glass', 'banner'];
    for (const mat of coloredMats) {
        if (id.includes(mat)) {
            return `colored_${mat}:all`;
        }
    }

    if (id.includes('ore')) return 'ores:all';

    if (['tools', 'armor'].includes(item.category)) {
        const toolTypes = ['helmet', 'chestplate', 'leggings', 'boots', 'sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'trident', 'bow', 'crossbow', 'shears', 'fishing_rod', 'shield', 'elytra', 'template', 'smithing'];
        for (const t of toolTypes) {
            if (id.includes(t)) return `utility:${t}`;
        }
    }

    if (item.category === 'ores') {
        if (id.includes('ore')) return 'ores:all';
        if (id.includes('block')) return 'metal_blocks:all';
        if (id.includes('ingot') || id.includes('nugget') || id.includes('raw_') || id.includes('gem') || id.includes('shard') || id.includes('dust')) return 'metals_materials:all';
    }

    // Food (functional grouping)
    if (item.category === 'food') {
        if (id.includes('meat') || id.includes('porkchop') || id.includes('beef') || id.includes('mutton') || id.includes('chicken') || id.includes('rabbit')) {
            return 'food:01_meat';
        }
        if (id.includes('fish') || id.includes('cod') || id.includes('salmon') || id.includes('tropical_fish') || id.includes('pufferfish')) {
            return 'food:02_fish';
        }
        if (id.includes('apple') || id.includes('fruit') || id.includes('berry') || id.includes('melon') || id.includes('pumpkin')) {
            return 'food:03_fruit_veg';
        }
        if (id.includes('potato') || id.includes('carrot') || id.includes('beetroot') || id.includes('wheat') || id.includes('seeds')) {
            return 'food:03_fruit_veg';
        }
        if (id.includes('bread') || id.includes('cookie') || id.includes('pie') || id.includes('cake')) {
            return 'food:04_baked_sweets';
        }
        if (id.includes('stew') || id.includes('soup') || id.includes('bottle') || id.includes('portion')) {
            return 'food:05_liquids';
        }
        return 'food:06_other';
    }

    if (item.category === 'drops') {
        if (id.includes('spawn_egg')) return 'drops:spawn_eggs';
        if (id.includes('bucket')) return 'drops:buckets';
        return 'drops:materials';
    }

    if (id.includes('banner_pattern')) return 'misc_curios:banner_patterns';
    if (id.includes('pottery_sherd') || id.includes('pottery_shard')) return 'misc_curios:pottery_sherds';
    if (id.includes('smithing_template')) return 'utility:smithing_templates';
    if (id.includes('dye')) return 'misc_curios:dyes';

    if (item.category === 'mushrooms') {
        if (id.includes('block') || id.includes('stem')) return 'mushrooms:02_blocks';
        return 'mushrooms:01_items';
    }

    const woodCats = ['wood', 'wood_logs', 'wood_blocks', 'stripped_logs', 'stripped_blocks', 'saplings', 'leaves', 'planks', 'slab', 'stairs', 'fence_gate', 'fence', 'trapdoor', 'door', 'pressure_plate', 'button', 'hanging_sign', 'sign', 'boat', 'shelf'];
    if (woodCats.includes(item.category) || item.category === 'wood_misc') {
        const id = item.id.toLowerCase();
        
        if (item.category === 'wood' || item.category === 'wood_misc') {
            const types = ['planks', 'slab', 'stairs', 'fence_gate', 'fence', 'trapdoor', 'door', 'pressure_plate', 'button', 'hanging_sign', 'sign', 'boat', 'shelf'];
            for (const t of types) {
                if (id.includes(t)) return t;
            }
        }
        return item.category;
    }

    return name.split(' ')[0];
}

function renderItems(append = false) {
    if (!itemsGrid || typeof MINECRAFT_ITEMS === 'undefined') return;

    if (!append) {
        itemsGrid.innerHTML = '';
        currentBatch = 0;

        filteredItems = MINECRAFT_ITEMS.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery);
            const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
            const hideCreative = hideCreativeCheck ? hideCreativeCheck.checked : false;
            const hideNonStackable = hideNonStackableCheck ? hideNonStackableCheck.checked : false;
            const showSkipped = showSkippedCheck ? showSkippedCheck.checked : false;

            const creativeFilter = !hideCreative || !item.creative;
            const stackableFilter = !hideNonStackable || item.stackable;
            const skipFilter = showSkipped || !skippedIds[item.id];

            return matchesSearch && matchesCategory && creativeFilter && stackableFilter && skipFilter;
        });

        const categoryOrder = {
            'wood_logs': 1, 'wood_blocks': 2, 'stripped_logs': 3, 
            'stripped_blocks': 4, 'saplings': 5, 'leaves': 6, 'wood': 7,
            'stone': 8, 'earth': 9, 'ores': 10, 'plants': 11, 'mushrooms': 11.5,
            'decoration': 12, 'redstone': 13, 'utility': 14, 'tools': 15,
            'food': 16, 'drops': 17, 'stairs': 18, 'slabs': 19,
            'walls': 20, 'buttons': 21, 'pressure_plates': 22, 'misc': 23
        };

        filteredItems.sort((a, b) => {
            const catA = categoryOrder[a.category] || 99;
            const catB = categoryOrder[b.category] || 99;
            if (catA !== catB) return catA - catB;

            const keyA = getSortKey(a);
            const keyB = getSortKey(b);
            if (keyA !== keyB) return keyA.localeCompare(keyB);
            return a.name.localeCompare(b.name);
        });

        if (filteredItems.length === 0) {
            itemsGrid.innerHTML = '<div class="empty-state">No items found for this search/category.</div>';
            return;
        }
    }

    const start = currentBatch * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    const batch = filteredItems.slice(start, end);

    if (batch.length === 0) return;

    const getHeader = (it) => getSortKey(it).split(':')[0];
    let currentType = (start > 0) ? getHeader(filteredItems[start - 1]) : null;

    const fragment = document.createDocumentFragment();

    batch.forEach(item => {
        const itemHeader = getHeader(item);

        if (itemHeader !== currentType) {
            currentType = itemHeader;
            const header = document.createElement('div');
            header.className = 'group-header';
            const title = document.createElement('span');
            title.textContent = itemHeader.replace(/_/g, ' ').replace(/\d+_/, '').toUpperCase();

            const headerActions = document.createElement('div');
            headerActions.className = 'header-actions';

            const completeAllBtn = document.createElement('button');
            completeAllBtn.className = 'complete-all-btn header-btn';
            completeAllBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Complete Group';
            completeAllBtn.onclick = () => completeGroup(itemHeader, filteredItems);

            const skipAllBtn = document.createElement('button');
            skipAllBtn.className = 'skip-all-btn header-btn';
            skipAllBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Skip Group';
            skipAllBtn.onclick = () => skipGroup(itemHeader, filteredItems);

            headerActions.appendChild(completeAllBtn);
            headerActions.appendChild(skipAllBtn);
            header.appendChild(title);
            header.appendChild(headerActions);
            fragment.appendChild(header);
        }

        const clone = itemTemplate.content.cloneNode(true);
        const card = clone.querySelector('.item-card');
        const number = clone.querySelector('.item-number');
        const img = clone.querySelector('.item-icon');
        const title = clone.querySelector('.item-name');
        const category = clone.querySelector('.item-category');
        const checkbox = clone.querySelector('.complete-checkbox');
        const skipBtn = clone.querySelector('.skip-btn');

        const currentIndex = start + batch.indexOf(item) + 1;
        number.textContent = `#${currentIndex}`;

        img.src = item.image || 'blocks/stone.png';
        img.alt = item.name;
        img.loading = "lazy";
        title.textContent = item.name;
        category.textContent = item.category.toUpperCase();

        if (skippedIds[item.id]) card.classList.add('is-skipped');
        const isCompleted = !!completedIds[item.id];
        checkbox.checked = isCompleted;
        if (isCompleted) card.classList.add('is-completed-item');

        const handleToggle = (e) => {
            e.stopPropagation();
            toggleComplete(item.id);
        };

        checkbox.addEventListener('change', handleToggle);
        const checkboxCustom = clone.querySelector('.checkbox-custom');
        if (checkboxCustom) {
            checkboxCustom.addEventListener('click', handleToggle);
        }

        if (skipBtn) skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSkip(item.id);
        });

        fragment.appendChild(clone);
    });

    itemsGrid.appendChild(fragment);

    if (end < filteredItems.length) {
        setupLoadMoreObserver();
    }
}

function setupLoadMoreObserver() {
    if (loadMoreObserver) loadMoreObserver.disconnect();

    let sentinel = document.getElementById('load-more-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'load-more-sentinel';
        sentinel.style.height = '20px';
    }
    itemsGrid.appendChild(sentinel);

    loadMoreObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            currentBatch++;
            sentinel.remove();
            renderItems(true);
        }
    }, { root: itemsGrid, rootMargin: '200px' });

    loadMoreObserver.observe(sentinel);
}

function renderCompleted() {
    if (!completedListContainer || typeof MINECRAFT_ITEMS === 'undefined') return;
    completedListContainer.innerHTML = '';
    const completedList = MINECRAFT_ITEMS.filter(item => completedIds[item.id]);

    if (completedList.length === 0) {
        completedListContainer.innerHTML = '<div class="empty-state">Nothing completed yet! Mark some items to see them here.</div>';
        return;
    }

    if (sortMethod === 'alphabetical') {
        completedList.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'newest') {
        completedList.sort((a, b) => new Date(completedIds[b.id]) - new Date(completedIds[a.id]));
    } else if (sortMethod === 'category') {
        completedList.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    }

    completedList.forEach(item => {
        const clone = completedTemplate.content.cloneNode(true);
        const img = clone.querySelector('.item-icon');
        const title = clone.querySelector('.item-name');
        const category = clone.querySelector('.item-category');
        const dateSpan = clone.querySelector('.item-date');
        const removeBtn = clone.querySelector('.uncomplete-btn');

        img.src = item.image;
        title.textContent = item.name;
        category.textContent = item.category.toUpperCase();

        const date = new Date(completedIds[item.id]);
        dateSpan.textContent = `Completed: ${formatDate(date)}`;

        removeBtn.onclick = () => toggleComplete(item.id);

        completedListContainer.appendChild(clone);
    });
}

function toggleComplete(id) {
    if (completedIds[id]) {
        delete completedIds[id];
    } else {
        completedIds[id] = new Date().toISOString();
        if (skippedIds[id]) delete skippedIds[id];
    }
    localStorage.setItem('blockcheck_completed_ids', JSON.stringify(completedIds));
    localStorage.setItem('blockcheck_skipped_ids', JSON.stringify(skippedIds));

    updateStats();
    renderItems();
    renderCompleted();
}

function toggleSkip(id) {
    if (skippedIds[id]) {
        delete skippedIds[id];
    } else {
        skippedIds[id] = true;
        if (completedIds[id]) delete completedIds[id];
    }
    saveState();
}

function completeGroup(headerPrefix, filteredList) {
    const idsToComplete = filteredList
        .filter(item => getSortKey(item).split(':')[0] === headerPrefix)
        .map(item => item.id);

    const now = new Date().toISOString();
    idsToComplete.forEach(id => {
        if (!completedIds[id]) {
            completedIds[id] = now;
            if (skippedIds[id]) delete skippedIds[id];
        }
    });

    localStorage.setItem('blockcheck_completed_ids', JSON.stringify(completedIds));
    localStorage.setItem('blockcheck_skipped_ids', JSON.stringify(skippedIds));

    updateStats();
    renderItems();
    renderCompleted();
}

function skipGroup(headerPrefix, filteredList) {
    const idsToSkip = filteredList
        .filter(item => getSortKey(item).split(':')[0] === headerPrefix)
        .map(item => item.id);

    idsToSkip.forEach(id => {
        if (!completedIds[id]) {
            skippedIds[id] = true;
        }
    });
    saveState();
}

function resetSkips() {
    skippedIds = {};
    saveState();
}

function saveState() {
    localStorage.setItem('blockcheck_skipped_ids', JSON.stringify(skippedIds));
    localStorage.setItem('blockcheck_completed_ids', JSON.stringify(completedIds));
    updateStats();
    renderItems();
    renderCompleted();
}

function formatDate(dateInput) {
    const d = new Date(dateInput);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function initThemeSwitcher() {
    const themeInputs = document.querySelectorAll('input[name="theme-choice"]');
    const currentTheme = localStorage.getItem("tswitch-theme") || document.documentElement.dataset.theme || 'wither';
    document.documentElement.dataset.theme = currentTheme;

    themeInputs.forEach(input => {
        if (input.value === currentTheme) input.checked = true;
        input.addEventListener('change', (e) => {
            const theme = e.target.value;
            document.documentElement.dataset.theme = theme;
            localStorage.setItem("tswitch-theme", theme);
        });
    });
}

function initBackgroundGallery() {
    const modal = document.getElementById('bg-gallery-modal');
    const openBtn = document.getElementById('open-gallery-btn');
    const closeBtn = document.getElementById('close-gallery-btn');
    const galleryGrid = document.getElementById('gallery-grid');
    const tooltip = document.getElementById('gallery-custom-tooltip');
    const fileInput = document.getElementById('bg-image-input');
    const randomToggle = document.getElementById('random-bg-toggle');

    if (!modal || !openBtn || !galleryGrid) return;

    openBtn.onclick = () => {
        modal.classList.add('active');
        renderGallery();
    };
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    window.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

    function renderGallery() {
        galleryGrid.innerHTML = '';
        const currentBg = localStorage.getItem('custom-bg-image');

        const noneItem = document.createElement('div');
        noneItem.className = `gallery-none-card ${(!currentBg || currentBg === 'null') ? 'active' : ''}`;
        noneItem.textContent = 'None';
        noneItem.onclick = () => {
            setBackground(null);
            renderGallery();
        };
        noneItem.onmouseenter = (e) => {
            if (tooltip) {
                tooltip.textContent = 'Clear Background';
                tooltip.style.display = 'block';
                tooltip.style.left = e.clientX + 16 + 'px';
                tooltip.style.top = e.clientY + 16 + 'px';
            }
        };
        noneItem.onmousemove = (e) => {
            if (tooltip) {
                tooltip.style.left = e.clientX + 16 + 'px';
                tooltip.style.top = e.clientY + 16 + 'px';
            }
        };
        noneItem.onmouseleave = () => { if (tooltip) tooltip.style.display = 'none'; };
        galleryGrid.appendChild(noneItem);

        const categories = [
            { id: 'wallpapers', title: 'Wallpapers', images: typeof BACKGROUND_IMAGES !== 'undefined' ? BACKGROUND_IMAGES.map(s => ({ s, tiled: false, pixelated: false })) : [] },
            { id: 'paintings', title: 'Paintings', images: typeof PAINTING_IMAGES !== 'undefined' ? PAINTING_IMAGES.map(s => ({ s, tiled: false, pixelated: true })) : [] },
            { id: 'blocks', title: 'Blocks', images: typeof BLOCK_IMAGES !== 'undefined' ? BLOCK_IMAGES.map(s => ({ s, tiled: true, pixelated: true })) : [] }
        ];

        let categoryCounter = 0;
        categories.forEach(cat => {
            const isActive = localStorage.getItem(`custom-bg-include-${cat.id}`) !== 'false';
            if (!isActive || cat.images.length === 0) return;

            if (categoryCounter > 0) {
                const header = document.createElement('div');
                header.className = 'gallery-section-title';
                header.textContent = cat.title;
                galleryGrid.appendChild(header);
            }
            categoryCounter++;

            cat.images.forEach(imgData => {
                addGalleryItem(imgData.s, imgData.tiled, imgData.pixelated, currentBg);
            });
        });
    }

    function formatImageName(src) {
        let filename = src.split('/').pop().split('.')[0];
        filename = filename.replace(/^1920px-/, '');
        filename = filename.replace(/_\d+x\d+$/, '');
        return filename.split('_').map(word => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
    }

    function addGalleryItem(src, tiled, pixelated, currentBg) {
        const img = document.createElement('img');
        const isActive = (currentBg === src);
        const name = formatImageName(src);
        img.src = src;
        img.loading = 'lazy';
        img.className = `gallery-img ${tiled ? 'square' : ''} ${pixelated ? 'pixelated' : ''} ${isActive ? 'active' : ''}`;

        img.onmouseenter = (e) => {
            if (tooltip) {
                tooltip.textContent = name;
                tooltip.style.display = 'block';
                tooltip.style.left = e.clientX + 16 + 'px';
                tooltip.style.top = e.clientY + 16 + 'px';
            }
        };
        img.onmousemove = (e) => {
            if (tooltip) {
                tooltip.style.left = e.clientX + 16 + 'px';
                tooltip.style.top = e.clientY + 16 + 'px';
            }
        };
        img.onmouseleave = () => { if (tooltip) tooltip.style.display = 'none'; };

        img.onclick = () => {
            setBackground(src, tiled, pixelated);
            renderGallery();
        };
        galleryGrid.appendChild(img);
    }

    function setBackground(src, tiled, pixelated) {
        localStorage.setItem('custom-bg-random', 'false');
        if (randomToggle) randomToggle.classList.remove('active');

        if (!src) {
            const initialStyle = document.getElementById('initial-bg-style');
            if (initialStyle) initialStyle.remove();
            document.body.style.backgroundImage = '';
            document.body.classList.remove('has-custom-bg', 'tiled', 'pixelated-bg');
            localStorage.removeItem('custom-bg-image');
            return;
        }

        applyBackground(src, tiled, pixelated);
        localStorage.setItem('custom-bg-image', src);
        localStorage.setItem('custom-bg-tiled', tiled);
        localStorage.setItem('custom-bg-pixelated', pixelated);
    }

    function applyBackground(src, tiled, pixelated) {
        const initialStyle = document.getElementById('initial-bg-style');
        if (initialStyle) initialStyle.remove();
        document.body.style.backgroundImage = `url("${src}")`;
        document.body.classList.add('has-custom-bg');
        document.body.classList.toggle('tiled', tiled === true || tiled === 'true');
        document.body.classList.toggle('pixelated-bg', pixelated === true || pixelated === 'true');
    }

    const isRandom = localStorage.getItem('custom-bg-random') !== 'false';
    if (randomToggle) {
        if (isRandom) randomToggle.classList.add('active');
        randomToggle.onclick = () => {
            const currentState = localStorage.getItem('custom-bg-random') !== 'false';
            const newState = !currentState;
            localStorage.setItem('custom-bg-random', newState);
            randomToggle.classList.toggle('active', newState);
            if (newState) {
                randomizeBackground();
                renderGallery();
            }
        };
    }

    function randomizeBackground() {
        const pool = [];
        const includeWallpapers = localStorage.getItem('custom-bg-include-wallpapers') !== 'false';
        const includePaintings = localStorage.getItem('custom-bg-include-paintings') !== 'false';
        const includeBlocks = localStorage.getItem('custom-bg-include-blocks') !== 'false';

        if (includeWallpapers && typeof BACKGROUND_IMAGES !== 'undefined') {
            BACKGROUND_IMAGES.forEach(s => pool.push({ s, tiled: false, pixelated: false }));
        }
        if (includePaintings && typeof PAINTING_IMAGES !== 'undefined') {
            PAINTING_IMAGES.forEach(s => pool.push({ s, tiled: false, pixelated: true }));
        }
        if (includeBlocks && typeof BLOCK_IMAGES !== 'undefined') {
            BLOCK_IMAGES.forEach(s => pool.push({ s, tiled: true, pixelated: true }));
        }

        if (pool.length > 0) {
            const choice = pool[Math.floor(Math.random() * pool.length)];
            applyBackground(choice.s, choice.tiled, choice.pixelated);
            localStorage.setItem('custom-bg-image', choice.s);
            localStorage.setItem('custom-bg-tiled', choice.tiled);
            localStorage.setItem('custom-bg-pixelated', choice.pixelated);
        } else {
            document.body.style.backgroundImage = '';
            document.body.classList.remove('has-custom-bg', 'tiled', 'pixelated-bg');
        }
    }

    ['wallpapers', 'paintings', 'blocks'].forEach(key => {
        const btn = document.getElementById(`filter-${key}`);
        if (!btn) return;
        const active = localStorage.getItem(`custom-bg-include-${key}`) !== 'false';
        btn.classList.toggle('active', active);
        btn.onclick = () => {
            const state = localStorage.getItem(`custom-bg-include-${key}`) !== 'false';
            localStorage.setItem(`custom-bg-include-${key}`, !state);
            btn.classList.toggle('active', !state);
            if (localStorage.getItem('custom-bg-random') !== 'false') {
                randomizeBackground();
            }
            renderGallery();
        };
    });

    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => setBackground(event.target.result, false, false);
                reader.readAsDataURL(file);
            }
        };
    }
}

function initExportImport() {
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importInput = document.getElementById('import-input');

    if (exportBtn) {
        exportBtn.onclick = () => {
            const data = JSON.stringify(completedIds, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `blockcheck-progress-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };
    }

    if (importBtn && importInput) {
        importBtn.onclick = () => importInput.click();
        importInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.name.endsWith('.json')) {
                showAlert('Error', 'Invalid file format. Please upload a .json file.');
                importInput.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    importData(data);
                } catch (err) {
                    showAlert('Error', 'Failed to parse import file.');
                }
                importInput.value = '';
            };
            reader.readAsText(file);
        };
    }
}

function importData(data) {
    if (typeof data === 'object' && !Array.isArray(data)) {
        completedIds = { ...completedIds, ...data };
        saveState();
        showAlert('Success', 'Progress imported successfully!');
    } else {
        showAlert('Error', 'Invalid file format.');
    }
}

function showCustomModal({ title, message, confirmText, onConfirm, showCancel = true }) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText || 'OK';
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';

    modal.classList.add('active');

    confirmBtn.onclick = () => {
        modal.classList.remove('active');
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.classList.remove('active');
    };

    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('active');
    };
}

function showAlert(title, message) {
    showCustomModal({
        title,
        message,
        confirmText: 'OK',
        showCancel: false
    });
}

document.addEventListener('DOMContentLoaded', init);
