document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const imageQueue = document.getElementById('image-queue');
  const emptyMessage = document.getElementById('empty-message');
  const queueHeader = document.getElementById('queue-header');
  const fileCountSpan = document.getElementById('file-count');
  
  // Settings Inputs
  const resizeModeRadios = document.querySelectorAll('input[name="resize-mode"]');
  const resizeValueInput = document.getElementById('resize-value');
  const valueLabelText = document.getElementById('value-label-text');
  const valueUnitSpan = document.getElementById('value-unit');
  
  const formatRadios = document.querySelectorAll('input[name="output-format"]');
  const qualityGroup = document.getElementById('quality-settings-group');
  const qualityInput = document.getElementById('image-quality');
  const qualityDisplay = document.getElementById('quality-display');
  const suffixInput = document.getElementById('filename-suffix');
  
  // Action Buttons
  const btnResize = document.getElementById('btn-resize');
  const btnDownloadAll = document.getElementById('btn-download-all');
  const btnClear = document.getElementById('btn-clear');
  
  // Overall Progress
  const overallProgressContainer = document.getElementById('overall-progress-container');
  const overallProgressBar = document.getElementById('overall-progress-bar');
  const progressText = document.getElementById('progress-text');

  // --- State Variable ---
  let filesQueue = []; // Array of file card objects

  // --- Helper: Format File Size ---
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // --- Helper: Get Input Values ---
  function getSettings() {
    let mode = 'long-edge';
    resizeModeRadios.forEach(radio => {
      if (radio.checked) mode = radio.value;
    });

    let targetVal = parseFloat(resizeValueInput.value);
    if (isNaN(targetVal) || targetVal <= 0) {
      targetVal = mode === 'percent' ? 100 : 1200;
    }

    let format = 'original';
    formatRadios.forEach(radio => {
      if (radio.checked) format = radio.value;
    });

    const quality = parseInt(qualityInput.value) / 100;
    const suffix = suffixInput.value;

    return { mode, targetVal, format, quality, suffix };
  }

  // --- Dynamic Settings UI Updates ---
  function updateSettingsUI() {
    const settings = getSettings();
    
    // 1. Label and unit changes based on Mode
    if (settings.mode === 'percent') {
      valueLabelText.textContent = '목표 비율 (%)';
      valueUnitSpan.textContent = '%';
      if (parseFloat(resizeValueInput.value) > 1000) {
        resizeValueInput.value = 100;
      }
      resizeValueInput.min = 1;
      resizeValueInput.max = 1000;
    } else {
      valueLabelText.textContent = settings.mode === 'width' ? '목표 가로 크기 (px)' :
                                   settings.mode === 'height' ? '목표 세로 크기 (px)' : '목표 크기 (px)';
      valueUnitSpan.textContent = 'px';
      resizeValueInput.min = 1;
      resizeValueInput.removeAttribute('max');
    }

    // 2. Show/hide compression quality slider
    if (settings.format === 'jpeg' || settings.format === 'webp') {
      qualityGroup.style.display = 'flex';
    } else {
      qualityGroup.style.display = 'none';
    }

    // Update expected sizes in all cards
    updateAllExpectedSizes();
  }

  // Event Listeners for UI updates
  resizeModeRadios.forEach(radio => radio.addEventListener('change', () => {
    // Set appropriate default values when switching mode
    const mode = radio.value;
    if (mode === 'percent') {
      resizeValueInput.value = '50';
    } else if (mode === 'short-edge') {
      resizeValueInput.value = '800';
    } else if (mode === 'height') {
      resizeValueInput.value = '800';
    } else {
      resizeValueInput.value = '1200';
    }
    updateSettingsUI();
  }));
  
  formatRadios.forEach(radio => radio.addEventListener('change', updateSettingsUI));
  resizeValueInput.addEventListener('input', updateSettingsUI);
  suffixInput.addEventListener('input', updateSettingsUI);
  qualityInput.addEventListener('input', () => {
    qualityDisplay.textContent = qualityInput.value + '%';
  });

  // --- Calculate Target Dimensions ---
  function calculateDimensions(origW, origH, mode, targetVal) {
    let targetW = origW;
    let targetH = origH;

    switch (mode) {
      case 'percent':
        const scale = targetVal / 100;
        targetW = Math.round(origW * scale);
        targetH = Math.round(origH * scale);
        break;
      case 'width':
        targetW = targetVal;
        targetH = Math.round(origH * (targetVal / origW));
        break;
      case 'height':
        targetH = targetVal;
        targetW = Math.round(origW * (targetVal / origH));
        break;
      case 'long-edge':
        if (origW >= origH) {
          targetW = targetVal;
          targetH = Math.round(origH * (targetVal / origW));
        } else {
          targetH = targetVal;
          targetW = Math.round(origW * (targetVal / origH));
        }
        break;
      case 'short-edge':
        if (origW <= origH) {
          targetW = targetVal;
          targetH = Math.round(origH * (targetVal / origW));
        } else {
          targetH = targetVal;
          targetW = Math.round(origW * (targetVal / origH));
        }
        break;
    }

    // Guarantee minimum size of 1x1
    targetW = Math.max(1, targetW);
    targetH = Math.max(1, targetH);

    return { width: targetW, height: targetH };
  }

  // --- Update expected sizes on UI ---
  function updateAllExpectedSizes() {
    const settings = getSettings();
    filesQueue.forEach(item => {
      if (item.status === 'pending') {
        const expected = calculateDimensions(item.originalWidth, item.originalHeight, settings.mode, settings.targetVal);
        item.resizedWidth = expected.width;
        item.resizedHeight = expected.height;
        
        const sizeEl = document.getElementById(`expected-dim-${item.id}`);
        if (sizeEl) {
          sizeEl.textContent = ` -> ${expected.width} x ${expected.height}`;
        }
      }
    });
  }

  // --- Handle Drag & Drop Events ---
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  // --- Process and Load Uploaded Files ---
  function handleFiles(files) {
    const validImageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (validImageFiles.length === 0) return;

    validImageFiles.forEach(file => {
      const id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const originalSizeStr = formatBytes(file.size);
      const thumbnailUrl = URL.createObjectURL(file);

      // Create temporary image to get dimensions
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        // Calculate initial expected sizes
        const settings = getSettings();
        const expected = calculateDimensions(originalWidth, originalHeight, settings.mode, settings.targetVal);

        const fileItem = {
          id,
          file,
          name: file.name,
          originalSizeStr,
          originalWidth,
          originalHeight,
          resizedWidth: expected.width,
          resizedHeight: expected.height,
          thumbnailUrl,
          status: 'pending',
          resizedBlob: null,
          resizedName: ''
        };

        filesQueue.push(fileItem);
        renderCard(fileItem);
        updateButtonsState();
        URL.revokeObjectURL(img.src);
      };
      img.src = thumbnailUrl;
    });
  }

  // --- Render Image Card in Queue ---
  function renderCard(item) {
    // Hide empty message, show queue header
    emptyMessage.style.display = 'none';
    queueHeader.style.display = 'flex';

    const card = document.createElement('div');
    card.className = 'image-card';
    card.id = `card-${item.id}`;
    
    card.innerHTML = `
      <img src="${item.thumbnailUrl}" alt="${item.name}" class="card-thumb">
      <div class="card-details">
        <div class="file-name" title="${item.name}">${item.name}</div>
        <div class="file-meta">
          <span>${item.originalSizeStr}</span>
          <span class="meta-divider">|</span>
          <span class="resizing-resolution">
            <span>${item.originalWidth} x ${item.originalHeight}</span>
            <span id="expected-dim-${item.id}"> -> ${item.resizedWidth} x ${item.resizedHeight}</span>
          </span>
        </div>
      </div>
      <div class="card-right">
        <span class="status-badge status-pending" id="badge-${item.id}">대기 중</span>
        <div class="card-actions">
          <button class="icon-btn icon-btn-download" id="dl-${item.id}" title="개별 다운로드" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="icon-btn icon-btn-remove" id="rm-${item.id}" title="제거">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
    `;

    imageQueue.appendChild(card);

    // Event handler for individual removal
    document.getElementById(`rm-${item.id}`).addEventListener('click', () => removeFile(item.id));
    
    // Event handler for individual download
    document.getElementById(`dl-${item.id}`).addEventListener('click', () => {
      if (item.resizedBlob && item.resizedName) {
        downloadBlob(item.resizedBlob, item.resizedName);
      }
    });

    updateFileCountDisplay();
  }

  // --- Remove File from Queue ---
  function removeFile(id) {
    const idx = filesQueue.findIndex(item => item.id === id);
    if (idx !== -1) {
      const item = filesQueue[idx];
      // Revoke thumbnail URL to free memory
      if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
      filesQueue.splice(idx, 1);
      
      const card = document.getElementById(`card-${id}`);
      if (card) card.remove();
    }

    if (filesQueue.length === 0) {
      emptyMessage.style.display = 'flex';
      queueHeader.style.display = 'none';
      overallProgressContainer.style.display = 'none';
    }

    updateFileCountDisplay();
    updateButtonsState();
  }

  // --- Update Total File Count Display ---
  function updateFileCountDisplay() {
    fileCountSpan.textContent = filesQueue.length;
  }

  // --- Update Action Buttons (Disabled / Enabled States) ---
  function updateButtonsState() {
    const hasFiles = filesQueue.length > 0;
    const hasFinishedFiles = filesQueue.some(item => item.status === 'complete');
    const isProcessing = filesQueue.some(item => item.status === 'processing');

    btnResize.disabled = !hasFiles || isProcessing;
    btnDownloadAll.disabled = !hasFinishedFiles || isProcessing;
    btnClear.disabled = !hasFiles || isProcessing;
    
    // Disable file input / drop-zone while processing
    if (isProcessing) {
      dropZone.style.pointerEvents = 'none';
      dropZone.style.opacity = '0.5';
    } else {
      dropZone.style.pointerEvents = 'auto';
      dropZone.style.opacity = '1';
    }
  }

  // --- General Download Helper ---
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  // --- Core Resize Action: Run Batch Process ---
  async function startResizeBatch() {
    if (filesQueue.length === 0) return;

    const settings = getSettings();
    
    // Reset state & show overall progress
    overallProgressContainer.style.display = 'flex';
    overallProgressBar.style.width = '0%';
    progressText.textContent = `0 / ${filesQueue.length}`;

    // Mark all as pending and disable remove buttons during resize
    filesQueue.forEach(item => {
      item.status = 'pending';
      const badge = document.getElementById(`badge-${item.id}`);
      if (badge) {
        badge.className = 'status-badge status-pending';
        badge.textContent = '대기 중';
      }
      
      const rmBtn = document.getElementById(`rm-${item.id}`);
      if (rmBtn) rmBtn.disabled = true;
      
      const dlBtn = document.getElementById(`dl-${item.id}`);
      if (dlBtn) dlBtn.disabled = true;
    });

    updateButtonsState();

    let processedCount = 0;

    for (let i = 0; i < filesQueue.length; i++) {
      const item = filesQueue[i];
      item.status = 'processing';
      
      // Update badge UI
      const badge = document.getElementById(`badge-${item.id}`);
      if (badge) {
        badge.className = 'status-badge status-processing';
        badge.textContent = '변환 중';
      }
      updateButtonsState();

      try {
        const result = await resizeSingleImage(item, settings);
        item.status = 'complete';
        item.resizedBlob = result.blob;
        item.resizedName = result.filename;
        
        // Update badge UI to complete
        if (badge) {
          badge.className = 'status-badge status-complete';
          badge.textContent = '완료';
        }
        
        // Enable individual download button
        const dlBtn = document.getElementById(`dl-${item.id}`);
        if (dlBtn) dlBtn.disabled = false;
        
      } catch (err) {
        console.error('Resize error for file:', item.name, err);
        item.status = 'failed';
        if (badge) {
          badge.className = 'status-badge status-failed';
          badge.textContent = '실패';
        }
      }

      // Re-enable remove button
      const rmBtn = document.getElementById(`rm-${item.id}`);
      if (rmBtn) rmBtn.disabled = false;

      processedCount++;
      
      // Update overall progress bar
      const progressPercent = Math.round((processedCount / filesQueue.length) * 100);
      overallProgressBar.style.width = `${progressPercent}%`;
      progressText.textContent = `${processedCount} / ${filesQueue.length}`;
      
      // Yield thread back to browser for smooth UI updates
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    updateButtonsState();
  }

  // --- Resize Single Image Logic ---
  function resizeSingleImage(item, settings) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const originalW = img.width;
          const originalH = img.height;
          
          // Calculate final dimensions
          const dimensions = calculateDimensions(originalW, originalH, settings.mode, settings.targetVal);
          
          // Create canvas & draw
          const canvas = document.createElement('canvas');
          canvas.width = dimensions.width;
          canvas.height = dimensions.height;
          
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);

          // Get appropriate format & quality parameters
          let exportMime = item.file.type;
          if (settings.format !== 'original') {
            exportMime = `image/${settings.format}`;
          }

          // Build output filename
          const dotIndex = item.name.lastIndexOf('.');
          const baseName = dotIndex !== -1 ? item.name.substring(0, dotIndex) : item.name;
          let ext = dotIndex !== -1 ? item.name.substring(dotIndex) : '';
          
          if (settings.format !== 'original') {
            ext = `.${settings.format}`;
          }
          const outputFilename = `${baseName}${settings.suffix}${ext}`;

          // Export canvas to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({ blob, filename: outputFilename });
            } else {
              reject(new Error('Canvas export failed'));
            }
          }, exportMime, (exportMime === 'image/jpeg' || exportMime === 'image/webp') ? settings.quality : undefined);

        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image resource'));
      };

      // Load image source
      img.src = URL.createObjectURL(item.file);
    });
  }

  // --- Action: Download ZIP of all complete items ---
  function downloadAllZip() {
    const completedItems = filesQueue.filter(item => item.status === 'complete' && item.resizedBlob);
    if (completedItems.length === 0) return;

    if (typeof JSZip === 'undefined') {
      alert('JSZip 라이브러리가 로드되지 않았습니다. 인터넷 연결을 확인해 주세요.');
      return;
    }

    const zip = new JSZip();
    
    completedItems.forEach(item => {
      zip.file(item.resizedName, item.resizedBlob);
    });

    btnDownloadAll.disabled = true;
    const originalText = btnDownloadAll.querySelector('span').textContent;
    btnDownloadAll.querySelector('span').textContent = 'ZIP 생성 중...';

    zip.generateAsync({ type: 'blob' }).then(content => {
      downloadBlob(content, 'resized_images.zip');
      btnDownloadAll.querySelector('span').textContent = originalText;
      updateButtonsState();
    }).catch(err => {
      console.error('ZIP generation failed:', err);
      alert('ZIP 파일 생성 중 오류가 발생했습니다.');
      btnDownloadAll.querySelector('span').textContent = originalText;
      updateButtonsState();
    });
  }

  // --- Action: Clear File Queue ---
  function clearQueue() {
    filesQueue.forEach(item => {
      if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    filesQueue = [];
    imageQueue.innerHTML = '';
    imageQueue.appendChild(emptyMessage);
    
    emptyMessage.style.display = 'flex';
    queueHeader.style.display = 'none';
    overallProgressContainer.style.display = 'none';

    updateFileCountDisplay();
    updateButtonsState();
  }

  // --- Wire Action Buttons Event Listeners ---
  btnResize.addEventListener('click', startResizeBatch);
  btnDownloadAll.addEventListener('click', downloadAllZip);
  btnClear.addEventListener('click', clearQueue);

  // Initialize UI display based on default inputs
  updateSettingsUI();
});
