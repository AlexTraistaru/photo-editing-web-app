const $ = id => document.getElementById(id);
const el = {
  imageInput: $('imageInput'), startCameraBtn: $('startCameraBtn'), captureBtn: $('captureBtn'), stopCameraBtn: $('stopCameraBtn'),
  filterSelect: $('filterSelect'), brightnessRange: $('brightnessRange'), contrastRange: $('contrastRange'), saturationRange: $('saturationRange'),
  brightnessValue: $('brightnessValue'), contrastValue: $('contrastValue'), saturationValue: $('saturationValue'),
  rotateLeftBtn: $('rotateLeftBtn'), rotateRightBtn: $('rotateRightBtn'), flipBtn: $('flipBtn'), flipVerticalBtn: $('flipVerticalBtn'),
  resetBtn: $('resetBtn'), downloadBtn: $('downloadBtn'), watermarkText: $('watermarkText'), watermarkPosition: $('watermarkPosition'),
  watermarkAlpha: $('watermarkAlpha'), watermarkAlphaValue: $('watermarkAlphaValue'), showCanvasBtn: $('showCanvasBtn'),
  showVideoBtn: $('showVideoBtn'), video: $('video'), canvas: $('canvas'), cameraStatus: $('cameraStatus')
};

const ctx = el.canvas.getContext('2d');
let currentStream = null;
let sourceImage = null;

const state = {
  filter: 'none',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  rotation: 0,
  flipX: 1,
  flipY: 1,
  watermarkText: '',
  watermarkPosition: 'bottom-right',
  watermarkAlpha: 40
};

const clamp = v => Math.max(0, Math.min(255, v));
const cameraAllowed = () => window.isSecureContext || ['localhost', '127.0.0.1'].includes(location.hostname);

function setStatus(message, type = 'info') {
  el.cameraStatus.className = 'status ' + type;
  el.cameraStatus.textContent = message;
}

function showCanvas() {
  el.canvas.style.display = 'block';
  el.video.classList.add('hidden');
}

function showVideo() {
  if (!currentStream) {
    setStatus('Camera nu este pornita.', 'error');
    return;
  }
  el.canvas.style.display = 'none';
  el.video.classList.remove('hidden');
}

function drawPlaceholder() {
  el.canvas.width = 800;
  el.canvas.height = 500;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'center';
  ctx.font = '600 20px Arial';
  ctx.fillText('Nicio imagine incarcata', el.canvas.width / 2, el.canvas.height / 2 - 10);
  ctx.font = '14px Arial';
  ctx.fillText('Alege un fisier sau foloseste camera web', el.canvas.width / 2, el.canvas.height / 2 + 20);
  showCanvas();
}

function resetState() {
  Object.assign(state, {
    filter: 'none',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    rotation: 0,
    flipX: 1,
    flipY: 1,
    watermarkText: '',
    watermarkPosition: 'bottom-right',
    watermarkAlpha: 40
  });

  el.filterSelect.value = 'none';
  [[el.brightnessRange, el.brightnessValue], [el.contrastRange, el.contrastValue], [el.saturationRange, el.saturationValue]].forEach(([input, label]) => {
    input.value = 100;
    label.textContent = '100%';
  });
  el.watermarkText.value = '';
  el.watermarkPosition.value = 'bottom-right';
  el.watermarkAlpha.value = 40;
  el.watermarkAlphaValue.textContent = '40%';
}

function createProcessedCanvas() {
  const c = document.createElement('canvas');
  const t = c.getContext('2d');
  c.width = sourceImage.naturalWidth || sourceImage.width;
  c.height = sourceImage.naturalHeight || sourceImage.height;

  let filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
  if (state.filter === 'grayscale') filter += ' grayscale(100%)';
  if (state.filter === 'sepia') filter += ' sepia(100%)';

  t.filter = filter;
  t.drawImage(sourceImage, 0, 0, c.width, c.height);
  t.filter = 'none';

  if (state.filter === 'negative' || state.filter === 'threshold') {
    const imageData = t.getImageData(0, 0, c.width, c.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (state.filter === 'negative') {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      } else {
        const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const value = gray >= 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
      }

      data[i] = clamp(data[i]);
      data[i + 1] = clamp(data[i + 1]);
      data[i + 2] = clamp(data[i + 2]);
    }

    t.putImageData(imageData, 0, 0);
  }

  return c;
}

function drawWatermark() {
  const text = state.watermarkText.trim();
  if (!text) return;

  const margin = 20;
  const fontSize = Math.max(18, Math.round(el.canvas.width * 0.035));
  const positions = {
    'top-left': [margin, margin + fontSize, 'left'],
    'top-right': [el.canvas.width - margin, margin + fontSize, 'right'],
    'bottom-left': [margin, el.canvas.height - margin, 'left'],
    'bottom-right': [el.canvas.width - margin, el.canvas.height - margin, 'right'],
    'center': [el.canvas.width / 2, el.canvas.height / 2, 'center']
  };
  const [x, y, align] = positions[state.watermarkPosition];

  ctx.save();
  ctx.globalAlpha = state.watermarkAlpha / 100;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.textAlign = align;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function renderImage() {
  if (!sourceImage) {
    drawPlaceholder();
    return;
  }

  const processed = createProcessedCanvas();
  const w = processed.width;
  const h = processed.height;
  const angle = ((state.rotation % 360) + 360) % 360;
  const rotated = angle === 90 || angle === 270;

  el.canvas.width = rotated ? h : w;
  el.canvas.height = rotated ? w : h;

  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  ctx.save();
  ctx.translate(el.canvas.width / 2, el.canvas.height / 2);
  ctx.scale(state.flipX, state.flipY);
  ctx.rotate(state.rotation * Math.PI / 180);
  ctx.drawImage(processed, -w / 2, -h / 2);
  ctx.restore();

  drawWatermark();
  showCanvas();
}

function loadImage(url) {
  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    resetState();
    renderImage();
  };
  img.src = url;
}

function stopCamera() {
  if (currentStream) currentStream.getTracks().forEach(track => track.stop());
  currentStream = null;
  el.video.srcObject = null;
  el.captureBtn.disabled = true;
  el.stopCameraBtn.disabled = true;
  setStatus('Camera nu este pornita.', 'info');
  showCanvas();
}

function initCameraStatus() {
  if (!navigator.mediaDevices?.getUserMedia) {
    el.startCameraBtn.disabled = true;
    el.captureBtn.disabled = true;
    el.stopCameraBtn.disabled = true;
    setStatus('Acest browser nu suporta accesul la camera.', 'error');
    return;
  }

  el.captureBtn.disabled = true;
  el.stopCameraBtn.disabled = true;
  setStatus(
    cameraAllowed()
      ? 'Gata pentru captura. Browserul va cere permisiune.'
      : 'Camera poate fi blocata daca fisierul nu ruleaza pe localhost sau HTTPS.',
    cameraAllowed() ? 'info' : 'error'
  );
}

function bindSlider(input, label, key) {
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    label.textContent = input.value + '%';
    renderImage();
  });
}

function updateWatermark() {
  state.watermarkText = el.watermarkText.value;
  state.watermarkPosition = el.watermarkPosition.value;
  state.watermarkAlpha = Number(el.watermarkAlpha.value);
  el.watermarkAlphaValue.textContent = el.watermarkAlpha.value + '%';
  renderImage();
}

el.imageInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => loadImage(ev.target.result);
  reader.readAsDataURL(file);
});

el.startCameraBtn.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Browserul nu suporta functia de camera.', 'error');
    return;
  }
  if (!cameraAllowed()) {
    setStatus('Camera nu poate fi pornita aici. Ruleaza aplicatia pe localhost.', 'error');
    return;
  }

  try {
    stopCamera();
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
    el.video.srcObject = currentStream;
    el.captureBtn.disabled = false;
    el.stopCameraBtn.disabled = false;
    setStatus('Camera a fost pornita cu succes.', 'success');
    showVideo();
  } catch (error) {
    const messages = {
      NotAllowedError: 'Accesul la camera a fost refuzat sau blocat de browser.',
      NotFoundError: 'Nu a fost gasita nicio camera pe dispozitiv.'
    };
    setStatus(messages[error.name] || ('Camera nu a putut fi pornita: ' + error.message), 'error');
  }
});

el.captureBtn.addEventListener('click', () => {
  if (!currentStream || !el.video.videoWidth || !el.video.videoHeight) {
    setStatus('Porneste camera si asteapta initializarea fluxului video.', 'error');
    return;
  }

  const c = document.createElement('canvas');
  c.width = el.video.videoWidth;
  c.height = el.video.videoHeight;
  c.getContext('2d').drawImage(el.video, 0, 0, c.width, c.height);
  loadImage(c.toDataURL('image/png'));
  setStatus('Poza a fost capturata cu succes.', 'success');
});

el.stopCameraBtn.addEventListener('click', stopCamera);
el.filterSelect.addEventListener('change', () => {
  state.filter = el.filterSelect.value;
  renderImage();
});

bindSlider(el.brightnessRange, el.brightnessValue, 'brightness');
bindSlider(el.contrastRange, el.contrastValue, 'contrast');
bindSlider(el.saturationRange, el.saturationValue, 'saturation');

el.rotateLeftBtn.addEventListener('click', () => {
  state.rotation -= 90;
  renderImage();
});
el.rotateRightBtn.addEventListener('click', () => {
  state.rotation += 90;
  renderImage();
});
el.flipBtn.addEventListener('click', () => {
  state.flipX *= -1;
  renderImage();
});
el.flipVerticalBtn.addEventListener('click', () => {
  state.flipY *= -1;
  renderImage();
});

el.resetBtn.addEventListener('click', () => {
  if (!sourceImage) return;
  resetState();
  renderImage();
});

el.downloadBtn.addEventListener('click', () => {
  if (!sourceImage) {
    alert('Nu exista nicio imagine de descarcat.');
    return;
  }
  const link = document.createElement('a');
  link.download = 'imagine_editata.png';
  link.href = el.canvas.toDataURL('image/png');
  link.click();
});

el.watermarkText.addEventListener('input', updateWatermark);
el.watermarkPosition.addEventListener('change', updateWatermark);
el.watermarkAlpha.addEventListener('input', updateWatermark);
el.showCanvasBtn.addEventListener('click', showCanvas);
el.showVideoBtn.addEventListener('click', showVideo);
window.addEventListener('beforeunload', stopCamera);

drawPlaceholder();
initCameraStatus();
