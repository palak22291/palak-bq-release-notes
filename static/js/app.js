// Global state
let allReleases = [];
let filteredReleases = [];
let selectedRelease = null;
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const iconRefresh = document.getElementById('icon-refresh');
const releasesList = document.getElementById('releases-list');
const searchInput = document.getElementById('search-input');
const filterChips = document.querySelectorAll('.chip');
const sortSelect = document.getElementById('sort-select');
const resultsCount = document.getElementById('results-count');
const dataSourceBadge = document.getElementById('data-source-badge');

// Stats Elements
const valAll = document.getElementById('val-all');
const valFeatures = document.getElementById('val-features');
const valIssues = document.getElementById('val-issues');
const valOthers = document.getElementById('val-others');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSubmit = document.getElementById('modal-submit');
const modalPreviewText = document.getElementById('modal-preview-text');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const charProgress = document.getElementById('char-progress');
const presetButtons = document.querySelectorAll('.preset-btn');

// Initialize Lucide Icons
lucide.createIcons();

// Initialize app on content load
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases();
    setupEventListeners();
});

// Event Listeners setup
function setupEventListeners() {
    // Refresh button
    btnRefresh.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search bar
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        applyFiltersAndSort();
    });

    // Filter Chips
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.getAttribute('data-filter');
            applyFiltersAndSort();
        });
    });

    // Sort Selection
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFiltersAndSort();
    });

    // Modal Close
    modalClose.addEventListener('click', closeTweetModal);
    modalCancel.addEventListener('click', closeTweetModal);
    
    // Close modal on click outside content
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeTweetModal();
        }
    });

    // Tweet Editor Character Count
    tweetTextarea.addEventListener('input', updateCharCounter);

    // Preset Selection
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const format = btn.getAttribute('data-preset');
            generateTweetText(format);
        });
    });

    // Tweet Submission
    modalSubmit.addEventListener('click', submitTweet);
}

// Fetch Release Notes from API
async function fetchReleases(force = false) {
    showLoadingState();
    
    try {
        const url = `/api/releases${force ? '?force=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            allReleases = data.releases;
            updateStats();
            updateSourceBadge(data.source);
            applyFiltersAndSort();
        } else {
            showErrorState(data.error || 'Failed to fetch release notes');
        }
    } catch (error) {
        showErrorState('Network connection error. Please try again.');
        console.error('Fetch error:', error);
    } finally {
        hideLoadingState();
    }
}

// Show skeletons during loading
function showLoadingState() {
    iconRefresh.classList.add('spin');
    btnRefresh.disabled = true;
    
    releasesList.innerHTML = '';
    // Add 4 skeleton cards
    for (let i = 0; i < 4; i++) {
        releasesList.appendChild(createSkeletonCard());
    }
}

// Hide loading state
function hideLoadingState() {
    iconRefresh.classList.remove('spin');
    btnRefresh.disabled = false;
}

// Update source badge (cache vs network)
function updateSourceBadge(source) {
    if (source === 'cache') {
        dataSourceBadge.textContent = 'Cached';
        dataSourceBadge.className = 'source-badge';
    } else {
        dataSourceBadge.textContent = 'Live Feed';
        dataSourceBadge.className = 'source-badge badge-network';
    }
}

// Render skeleton card element
function createSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
        <div class="skeleton-header">
            <div class="skeleton-line skeleton-badge"></div>
            <div class="skeleton-line skeleton-date"></div>
        </div>
        <div class="skeleton-line skeleton-text-lg"></div>
        <div class="skeleton-line skeleton-text-md"></div>
        <div class="skeleton-line skeleton-text-sm"></div>
    `;
    return card;
}

// Show error panel
function showErrorState(message) {
    releasesList.innerHTML = `
        <div class="empty-state">
            <i data-lucide="alert-triangle" class="empty-icon" style="color: var(--color-issue);"></i>
            <h3>Unable to load release notes</h3>
            <p>${message}</p>
            <button class="btn btn-secondary" style="margin-top: 1.5rem;" onclick="fetchReleases(true)">Try Again</button>
        </div>
    `;
    lucide.createIcons();
}

// Update stats bar
function updateStats() {
    valAll.textContent = allReleases.length;
    
    const featuresCount = allReleases.filter(r => r.type.toLowerCase() === 'feature').length;
    const issuesCount = allReleases.filter(r => r.type.toLowerCase() === 'issue').length;
    const othersCount = allReleases.length - featuresCount - issuesCount;
    
    valFeatures.textContent = featuresCount;
    valIssues.textContent = issuesCount;
    valOthers.textContent = othersCount;
}

// Process search query, category filtering, and sorting
function applyFiltersAndSort() {
    // 1. Filter by category
    filteredReleases = allReleases.filter(release => {
        const typeLower = release.type.toLowerCase();
        
        if (currentFilter === 'all') return true;
        if (currentFilter === 'feature') return typeLower === 'feature';
        if (currentFilter === 'issue') return typeLower === 'issue';
        if (currentFilter === 'deprecation') return typeLower === 'deprecation';
        
        // "Other" category filters out the main ones
        if (currentFilter === 'other') {
            return typeLower !== 'feature' && typeLower !== 'issue' && typeLower !== 'deprecation';
        }
        return true;
    });

    // 2. Filter by search query
    if (searchQuery) {
        filteredReleases = filteredReleases.filter(release => {
            return release.date.toLowerCase().includes(searchQuery) ||
                   release.type.toLowerCase().includes(searchQuery) ||
                   release.raw_text.toLowerCase().includes(searchQuery);
        });
    }

    // 3. Sort
    if (currentSort === 'oldest') {
        filteredReleases.sort((a, b) => new Date(a.updated || a.date) - new Date(b.updated || b.date));
    } else {
        // Default: newest first
        filteredReleases.sort((a, b) => new Date(b.updated || b.date) - new Date(a.updated || a.date));
    }

    renderReleases();
}

// Render filtered cards to UI
function renderReleases() {
    releasesList.innerHTML = '';
    
    // Update count label
    const count = filteredReleases.length;
    if (searchQuery || currentFilter !== 'all') {
        resultsCount.textContent = `Found ${count} matching update${count !== 1 ? 's' : ''}`;
    } else {
        resultsCount.textContent = `Showing all ${count} updates`;
    }

    if (count === 0) {
        releasesList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="search-code" class="empty-icon"></i>
                <h3>No updates match your filters</h3>
                <p>Try clearing your search query or choosing a different filter category.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Render cards
    filteredReleases.forEach((release, index) => {
        const card = document.createElement('div');
        const typeLower = release.type.toLowerCase();
        
        // Define card theme based on category
        let cardClassType = 'type-other';
        let badgeClass = 'badge-other';
        let iconName = 'info';
        
        if (typeLower === 'feature') {
            cardClassType = 'type-feature';
            badgeClass = 'badge-feature';
            iconName = 'sparkles';
        } else if (typeLower === 'issue') {
            cardClassType = 'type-issue';
            badgeClass = 'badge-issue';
            iconName = 'alert-circle';
        } else if (typeLower === 'deprecation') {
            cardClassType = 'type-deprecation';
            badgeClass = 'badge-deprecation';
            iconName = 'alert-triangle';
        }

        card.className = `release-card ${cardClassType}`;
        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta-left">
                    <span class="type-badge ${badgeClass}">
                        <i data-lucide="${iconName}"></i>
                        <span>${release.type}</span>
                    </span>
                    <span class="card-date">
                        <i data-lucide="calendar"></i>
                        <span>${release.date}</span>
                    </span>
                </div>
            </div>
            <div class="card-body">
                ${release.content}
            </div>
            <div class="card-footer">
                ${release.link ? `
                    <a href="${release.link}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="View official release documentation page">
                        <i data-lucide="external-link"></i>
                        <span>Docs</span>
                    </a>
                ` : ''}
                <button class="btn btn-primary btn-sm btn-tweet-trigger" data-index="${index}" title="Format and share this update on X/Twitter">
                    <i data-lucide="twitter"></i>
                    <span>Tweet</span>
                </button>
            </div>
        `;
        
        releasesList.appendChild(card);
    });

    // Re-initialize Lucide Icons on the page
    lucide.createIcons();

    // Hook tweet buttons
    const tweetButtons = releasesList.querySelectorAll('.btn-tweet-trigger');
    tweetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(btn.getAttribute('data-index'));
            openTweetModal(filteredReleases[index]);
        });
    });
}

// Open Tweet Composer Modal
function openTweetModal(release) {
    selectedRelease = release;
    modalPreviewText.textContent = release.raw_text;
    
    // Set active preset to standard
    presetButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-preset="standard"]').classList.add('active');
    
    // Generate tweet text
    generateTweetText('standard');
    
    // Show modal
    tweetModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Disable page scrolling
}

// Close Tweet Composer Modal
function closeTweetModal() {
    tweetModal.classList.add('hidden');
    document.body.style.overflow = ''; // Re-enable page scrolling
    selectedRelease = null;
}

// Format and fill textarea based on presets
function generateTweetText(format) {
    if (!selectedRelease) return;
    
    const typeLabel = selectedRelease.type.toUpperCase();
    const dateLabel = selectedRelease.date;
    const docLink = selectedRelease.link || 'https://cloud.google.com/bigquery/docs/release-notes';
    
    // X handles URLs as 23 characters, but we calculate based on raw length for composer accuracy
    // Standard Tweet format templates
    let text = '';
    
    // Text limits helper: calculate remaining spaces for description
    const hashtags = ' #BigQuery #GCP';
    
    if (format === 'standard') {
        const header = `BigQuery Update: [${selectedRelease.type}] (${dateLabel})\n\n`;
        const footer = `\n\nDocs: ${docLink}${hashtags}`;
        const overhead = header.length + footer.length;
        const maxDescLength = 280 - overhead;
        
        let desc = selectedRelease.raw_text;
        if (desc.length > maxDescLength) {
            desc = desc.substring(0, maxDescLength - 3) + '...';
        }
        
        text = `${header}${desc}${footer}`;
        
    } else if (format === 'minimal') {
        const header = `BigQuery [${selectedRelease.type}]: `;
        const footer = `\n\n${docLink} #BigQuery`;
        const overhead = header.length + footer.length;
        const maxDescLength = 280 - overhead;
        
        let desc = selectedRelease.raw_text;
        if (desc.length > maxDescLength) {
            desc = desc.substring(0, maxDescLength - 3) + '...';
        }
        
        text = `${header}${desc}${footer}`;
        
    } else if (format === 'alert') {
        const emoji = selectedRelease.type.toLowerCase() === 'issue' ? '🚨' : '⚡';
        const header = `${emoji} BigQuery ${typeLabel} ALERT (${dateLabel}):\n\n`;
        const footer = `\n\nLearn more: ${docLink}${hashtags}`;
        const overhead = header.length + footer.length;
        const maxDescLength = 280 - overhead;
        
        let desc = selectedRelease.raw_text;
        if (desc.length > maxDescLength) {
            desc = desc.substring(0, maxDescLength - 3) + '...';
        }
        
        text = `${header}${desc}${footer}`;
    }
    
    tweetTextarea.value = text;
    updateCharCounter();
}

// Update Character progress bar and counter
function updateCharCounter() {
    const len = tweetTextarea.value.length;
    charCounter.textContent = `${len} / 280`;
    
    const percent = Math.min((len / 280) * 100, 100);
    charProgress.style.width = `${percent}%`;
    
    // Color thresholds
    charProgress.className = 'progress-bar';
    if (len > 260) {
        charProgress.classList.add('danger');
    } else if (len > 220) {
        charProgress.classList.add('warning');
    }
    
    // Disable submit button if over limit or empty
    modalSubmit.disabled = (len > 280 || len === 0);
}

// Submit tweet - open X Web Intent
function submitTweet() {
    const text = tweetTextarea.value;
    if (text.length > 280 || text.length === 0) return;
    
    const encodedText = encodeURIComponent(text);
    const xIntentUrl = `https://x.com/intent/tweet?text=${encodedText}`;
    
    window.open(xIntentUrl, '_blank', 'noopener,noreferrer');
    closeTweetModal();
}
