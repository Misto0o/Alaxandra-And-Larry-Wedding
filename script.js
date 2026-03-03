// ─────────────────────────────────────────────────────────────
//  SUPABASE CONFIG
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bjgpafxikxctbuljrcsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqZ3BhZnhpa3hjdGJ1bGpyY3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDEzNjAsImV4cCI6MjA4ODA3NzM2MH0.0fK-Iyq8XZcFHIf3EZ51Unn8xKMu2GtBGafTLJzr4UA';
const BUCKET = 'wedding-photos';
const EVENT_CODE = '0000';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Anonymous sign-in with check
const { data: session, error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) console.error('Supabase auth failed:', authErr);

// ────────────── LOCK SCREEN ──────────────
const lockScreen = document.getElementById('lockScreen');
const mainSite = document.getElementById('mainSite');
const digits = Array.from(document.querySelectorAll('.code-digit'));
const unlockBtn = document.getElementById('unlockBtn');
const lockError = document.getElementById('lockError');

digits.forEach((input, i) => {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && i < digits.length - 1) digits[i + 1].focus();
        lockError.style.display = 'none';
        digits.forEach(d => d.classList.remove('shake'));
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !input.value && i > 0) digits[i - 1].focus();
        if (e.key === 'Enter') tryUnlock();
    });

    input.addEventListener('paste', e => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, digits.length);
        pasted.split('').forEach((ch, idx) => { if (digits[idx]) digits[idx].value = ch; });
        digits[Math.min(pasted.length, digits.length - 1)].focus();
    });
});

unlockBtn.addEventListener('click', tryUnlock);

function tryUnlock() {
    const code = digits.map(d => d.value).join('');
    if (code === EVENT_CODE) {
        lockScreen.style.transition = 'opacity .5s';
        lockScreen.style.opacity = '0';
        setTimeout(() => {
            lockScreen.style.display = 'none';
            mainSite.style.display = 'block';
            loadGallery();
        }, 500);
    } else {
        lockError.style.display = 'block';
        digits.forEach(d => { d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); d.value = ''; });
        digits[0].focus();
    }
}

digits[0].focus();

// ────────────── UPLOAD ──────────────
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const dropZone = document.getElementById('dropZone');
const progressWrap = document.getElementById('uploadProgress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const toast = document.getElementById('toast');

let selectedFiles = [];

fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(fileInput.files);
    uploadBtn.style.display = selectedFiles.length ? 'inline-block' : 'none';
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    selectedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    uploadBtn.style.display = selectedFiles.length ? 'inline-block' : 'none';
});

// Compress image to max 1600px
function compressImage(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const MAX = 1600;
                let { width: w, height: h } = img;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.72);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

uploadBtn.addEventListener('click', async () => {
    if (!selectedFiles.length) return;
    uploadBtn.style.display = 'none';
    progressWrap.style.display = 'block';

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        progressText.textContent = `Uploading ${i + 1} of ${selectedFiles.length}…`;

        try {
            const blob = await compressImage(file);
            const userId = session.user.id;
            const path = `${userId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
                contentType: 'image/jpeg',
                upsert: false,
            });

            if (error) throw error;
        } catch (err) {
            console.error('Upload error:', err);
        }

        progressBar.style.width = `${Math.round(((i + 1) / selectedFiles.length) * 100)}%`;
    }

    progressText.textContent = 'Done! 🎉';
    showToast('Photos uploaded!');
    selectedFiles = [];
    fileInput.value = '';
    setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%'; }, 3000);
    loadGallery();
});

// ────────────── GALLERY ──────────────
const track = document.getElementById('sushiTrack');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const slideCounter = document.getElementById('slideCounter');
const gallerySection = document.getElementById('gallerySection');
const downloadSection = document.getElementById('downloadSection');
const SLIDE_W = 252;
let carouselOffset = 0;
let visibleCount = 1;

async function loadGallery() {
    try {
        const userId = session.user.id;

        // List all top-level folders
        const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 200 });
        if (error) throw error;
        if (!folders || !folders.length) return;

        // Collect files from all user folders
        const allFiles = [];
        for (const folder of folders) {
            if (!folder.id) { // it's a folder, not a loose file
                const { data: folderFiles } = await supabase.storage.from(BUCKET).list(folder.name, {
                    limit: 200,
                    sortBy: { column: 'created_at', order: 'desc' }
                });
                if (folderFiles) {
                    folderFiles.forEach(f => allFiles.push({ ...f, folder: folder.name }));
                }
            }
        }

        const files = allFiles.filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
        if (!files.length) return;

        track.innerHTML = '';

        for (let i = 0; i < files.length; i++) {
            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(`${files[i].folder}/${files[i].name}`);

            const slide = document.createElement('div');
            slide.className = 'sushi-slide';

            const img = document.createElement('img');
            img.src = urlData.publicUrl;
            img.loading = 'lazy';
            const nameParts = files[i].name.split('_');
            img.alt = nameParts.slice(1).join('_') || 'Uploaded photo';
            slide.appendChild(img);

            // Only show delete button for the current user's own photos
            if (files[i].folder === userId) {
                const delBtn = document.createElement('button');
                delBtn.textContent = '✕';
                delBtn.onclick = async () => {
                    // Remove from DOM instantly
                    slide.remove();
                    updateCounter();
                    // Then clean up on Supabase in background
                    await supabase.storage.from(BUCKET).remove([`${files[i].folder}/${files[i].name}`]);
                };
                slide.appendChild(delBtn);
            }

            track.appendChild(slide);
        }

        gallerySection.style.display = 'block';
        downloadSection.style.display = 'block';
        carouselOffset = 0;
        computeVisible();
        updateCarousel();
    } catch (e) {
        console.error('Gallery error:', e);
    }
}

function computeVisible() { visibleCount = Math.max(1, Math.floor(document.getElementById('sushiWrap').offsetWidth / SLIDE_W)); updateCounter(); }
function updateCarousel() { track.style.transform = `translateX(-${carouselOffset * SLIDE_W}px)`; updateCounter(); }
function updateCounter() { slideCounter.textContent = track.children.length ? `${carouselOffset + 1} / ${track.children.length}` : ''; }
prevBtn.addEventListener('click', () => { if (carouselOffset > 0) { carouselOffset--; updateCarousel(); } });
nextBtn.addEventListener('click', () => { const max = Math.max(0, track.children.length - visibleCount); if (carouselOffset < max) { carouselOffset++; updateCarousel(); } });
window.addEventListener('resize', computeVisible);

// ────────────── DOWNLOAD ALL ──────────────
const downloadBtn = document.getElementById('downloadBtn');
const downloadStatus = document.getElementById('downloadStatus');

downloadBtn.addEventListener('click', async () => {
    if (!window.JSZip) {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.head.appendChild(s);
        await new Promise(r => s.onload = r);
    }
    downloadBtn.disabled = true;
    downloadStatus.style.display = 'block';
    downloadStatus.textContent = 'Gathering photos…';

    try {
        // List all folders and collect all files
        const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 200 });
        if (error) throw error;

        const allFiles = [];
        for (const folder of folders) {
            if (!folder.id) {
                const { data: folderFiles } = await supabase.storage.from(BUCKET).list(folder.name, { limit: 200 });
                if (folderFiles) {
                    folderFiles.forEach(f => allFiles.push({ ...f, folder: folder.name }));
                }
            }
        }

        const files = allFiles.filter(f => f.name && f.name !== '.emptyFolderPlaceholder');

        const zip = new JSZip();
        const zipFolder = zip.folder('wedding-photos');

        for (let i = 0; i < files.length; i++) {
            downloadStatus.textContent = `Packing ${i + 1} of ${files.length}…`;
            try {
                const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(`${files[i].folder}/${files[i].name}`);
                const resp = await fetch(urlData.publicUrl);
                const buf = await resp.arrayBuffer();
                zipFolder.file(files[i].name, buf);
            } catch (e) {
                console.warn('Skipped:', files[i].name, e);
            }
        }

        downloadStatus.textContent = 'Creating ZIP…';
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'wedding-photos.zip';
        a.click();
        URL.revokeObjectURL(a.href);

        downloadStatus.textContent = '✓ Download started!';
        showToast('ZIP download started!');
    } catch (e) {
        console.error(e);
        downloadStatus.textContent = 'Something went wrong.';
    }

    downloadBtn.disabled = false;
});

// ────────────── AUTO SCROLL ──────────────
let autoScrollCounter = 0;
let autoScrollInterval;

function startAutoScroll() {
    autoScrollInterval = setInterval(() => {
        autoScrollCounter++;
        if (autoScrollCounter >= 5) {
            autoScrollCounter = 0;
            const max = Math.max(0, track.children.length - visibleCount);
            if (carouselOffset < max) {
                carouselOffset++;
            } else {
                carouselOffset = 0;
            }
            updateCarousel();
        }
    }, 1000);
}

function stopAutoScroll() {
    clearInterval(autoScrollInterval);
}

// Start auto-scroll once the gallery loads, then refresh gallery every 9 seconds
loadGallery().then(startAutoScroll);
setInterval(loadGallery, 9000);

// ────────────── TOAST ──────────────
function showToast(msg) { toast.textContent = '✓ ' + msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }