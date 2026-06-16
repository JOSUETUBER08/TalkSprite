let frames = [];
let audio = null;
let audioContext = null;
let analyser = null;
let dataArray = null;
let animationId = null;

let currentMouth = 0;
let smoothVolume = 0;
let lastFrameChange = 0;

let exportRecorder = null;
let exportAudio = null;
let exportAnimationId = null;
let isExporting = false;
let exportWasCancelled = false;
let exportMusic = null;

let eyesOpenUrl = "images/eyes/eyes_open.png";
let eyesClosedUrl = "images/eyes/eyes_closed.png";
let isBlinking = false;
let blinkTimeout = null;

let customAudioDataUrl = null;
let customAudioName = "";
let backgroundUrl = null;
let backgroundName = "";
let draggedFrameIndex = null;
let micStream = null;

const Sounds = {
    click: "audio/sounds/click.mp3",
    error: "audio/sounds/error.mp3",
    export: "audio/sounds/export.mp3",
    welcome: "audio/sounds/Welcome to Talk Sprite!.mp3"
};

const frameArea = document.getElementById("framesArea");
const character = document.getElementById("character");
const eyesLayer = document.getElementById("eyesLayer");
const exportStatus = document.getElementById("exportStatus");
const exportProgress = document.getElementById("exportProgress");

window.onload = function () {
    setTheme(localStorage.getItem("theme") || "light");
    loadDefaultPack();
    setupEyes();
    startBlinkLoop();
    updateEyesVisibility();
    updateExportProgress(0);
    setupVolumeLabel();
    playWelcomeOnce();
};

function setTheme(theme) {
    document.body.className = theme;
    localStorage.setItem("theme", theme);
}

function setupVolumeLabel() {
    const slider = document.getElementById("exportMusicVolume");
    const label = document.getElementById("volumeLabel");
    if (!slider || !label) return;
    label.textContent = slider.value + "%";
    slider.addEventListener("input", () => {
        label.textContent = slider.value + "%";
        if (exportMusic) exportMusic.volume = slider.value / 100;
    });
}

function playUISound(soundPath) {
    const enabled = document.getElementById("uiSounds")?.checked;
    if (!enabled) return;
    const sound = new Audio(soundPath);
    sound.volume = 0.55;
    sound.play().catch(() => {});
}

function playWelcomeSound() {
    playUISound(Sounds.welcome);
}

function playWelcomeOnce() {
    if (sessionStorage.getItem("talkspriteWelcomePlayed")) return;
    sessionStorage.setItem("talkspriteWelcomePlayed", "true");
    setTimeout(() => playWelcomeSound(), 600);
}

function startExportMusic() {
    const enabled = document.getElementById("exportMusicEnabled")?.checked;
    if (!enabled) return;
    stopExportMusic();
    exportMusic = new Audio(Sounds.export);
    exportMusic.loop = true;
    exportMusic.volume = (document.getElementById("exportMusicVolume")?.value || 40) / 100;
    exportMusic.play().catch(() => {});
}

function stopExportMusic() {
    if (!exportMusic) return;
    exportMusic.pause();
    exportMusic.currentTime = 0;
    exportMusic = null;
}

function showError(message) {
    playUISound(Sounds.error);
    alert(message);
}

function loadDefaultPack() {
    playUISound(Sounds.click);
    const pack = document.getElementById("defaultPack").value;
    frames = [];
    for (let i = 1; i <= 5; i++) {
        frames.push({ file: null, url: `images/${pack}/mouth${i}.png`, name: `${pack} - mouth${i}.png`, isDefault: true });
    }
    refreshFramesUI();
    character.src = frames[0].url;
}

function resetDefaultFrames() { loadDefaultPack(); }

function addFrame() {
    playUISound(Sounds.click);
    frames.push({ file: null, url: null, name: "Nenhum arquivo", isDefault: false });
    refreshFramesUI();
}

function loadFrame(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    fileToDataUrl(file).then(dataUrl => {
        frames[index] = { file: null, url: dataUrl, name: file.name, isDefault: false };
        refreshFramesUI();
        character.src = frames[index].url;
    });
}

async function startMicrophone() {
    playUISound(Sounds.click);
    const validFrames = getValidFrames();
    if (validFrames.length === 0) { showError("Adicione pelo menos uma imagem."); return; }
    stopPreview();
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        const source = audioContext.createMediaStreamSource(micStream);
        connectAudioSource(source, analyser, audioContext, false);
        animateMicrophoneMouth();
    } catch {
        showError("Não consegui acessar o microfone. Permita o uso do microfone no navegador.");
    }
}

function animateMicrophoneMouth() {
    if (!micStream || !analyser || !dataArray || !audioContext) return;
    const volume = getVoiceVolume(audioContext, analyser, dataArray);
    updateVoiceMeter(volume);
    smoothVolume = smoothVolume * 0.78 + volume * 0.22;
    const now = performance.now();
    const mouthIndex = getMouthFrame(smoothVolume);
    const validFrames = getValidFrames();
    if (validFrames[mouthIndex] && mouthIndex !== currentMouth && now - lastFrameChange > 45) {
        currentMouth = mouthIndex;
        lastFrameChange = now;
        character.src = validFrames[mouthIndex].url;
    }
    animationId = requestAnimationFrame(animateMicrophoneMouth);
}

function stopMicrophone() {
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    updateVoiceMeter(0);
    const validFrames = getValidFrames();
    if (validFrames[0]) character.src = validFrames[0].url;
}

function refreshFramesUI() {
    frameArea.innerHTML = "";
    frames.forEach((frame, index) => {
        const div = document.createElement("div");
        div.className = "frameItem";
        div.draggable = true;
        div.dataset.index = index;
        div.addEventListener("dragstart", handleDragStart);
        div.addEventListener("dragover", handleDragOver);
        div.addEventListener("drop", handleDrop);
        div.addEventListener("dragend", handleDragEnd);
        div.innerHTML = `
            <div class="frameHeader"><span class="dragHandle">☰</span><b>Frame ${index + 1}</b></div>
            ${frame.url ? `<img class="frameThumb" src="${frame.url}" alt="Frame ${index + 1}">` : ""}
            <input type="file" accept="image/*" onchange="loadFrame(event, ${index})">
            <div class="frameName">${frame.name}</div>
            <button onclick="moveFrameUp(${index})">Subir</button>
            <button onclick="moveFrameDown(${index})">Descer</button>
            <button onclick="removeFrame(${index})">Remover</button>
        `;
        frameArea.appendChild(div);
    });
}

function handleDragStart(event) { draggedFrameIndex = Number(event.currentTarget.dataset.index); event.currentTarget.classList.add("dragging"); }
function handleDragOver(event) { event.preventDefault(); }
function handleDrop(event) {
    event.preventDefault();
    const targetIndex = Number(event.currentTarget.dataset.index);
    if (draggedFrameIndex === null || draggedFrameIndex === targetIndex) return;
    const [draggedFrame] = frames.splice(draggedFrameIndex, 1);
    frames.splice(targetIndex, 0, draggedFrame);
    draggedFrameIndex = null;
    refreshFramesUI();
}
function handleDragEnd(event) { event.currentTarget.classList.remove("dragging"); draggedFrameIndex = null; }

function moveFrameUp(index) { if (index <= 0) return; [frames[index], frames[index - 1]] = [frames[index - 1], frames[index]]; refreshFramesUI(); }
function moveFrameDown(index) { if (index >= frames.length - 1) return; [frames[index], frames[index + 1]] = [frames[index + 1], frames[index]]; refreshFramesUI(); }
function removeFrame(index) {
    if (frames.length <= 1) { showError("Você precisa ter pelo menos 1 frame."); return; }
    frames.splice(index, 1);
    refreshFramesUI();
    const validFrames = getValidFrames();
    if (validFrames[0]) character.src = validFrames[0].url;
}
function getValidFrames() { return frames.filter(frame => frame.url); }

function setupEyes() {
    eyesLayer.src = eyesOpenUrl;
    document.getElementById("eyesEnabled").addEventListener("change", updateEyesVisibility);
    document.getElementById("eyesOpenFile").addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (!file) return;
        fileToDataUrl(file).then(dataUrl => { eyesOpenUrl = dataUrl; eyesLayer.src = eyesOpenUrl; });
    });
    document.getElementById("eyesClosedFile").addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (!file) return;
        fileToDataUrl(file).then(dataUrl => { eyesClosedUrl = dataUrl; });
    });
}
function updateEyesVisibility() { eyesLayer.style.display = document.getElementById("eyesEnabled").checked ? "block" : "none"; }
function startBlinkLoop() {
    clearTimeout(blinkTimeout);
    const delay = 2500 + Math.random() * 4500;
    blinkTimeout = setTimeout(() => { blinkEyes(); startBlinkLoop(); }, delay);
}
function blinkEyes() {
    const eyesEnabled = document.getElementById("eyesEnabled").checked;
    const blinkEnabled = document.getElementById("blinkEnabled").checked;
    if (!eyesEnabled || !blinkEnabled || isBlinking) return;
    isBlinking = true;
    eyesLayer.src = eyesClosedUrl;
    setTimeout(() => { eyesLayer.src = eyesOpenUrl; isBlinking = false; }, 120);
}
function shouldExportBlink(timeSeconds) {
    if (!document.getElementById("eyesEnabled").checked || !document.getElementById("blinkEnabled").checked) return false;
    return (timeSeconds % 4.2) < 0.12;
}

function loadCustomAudio(event) {
    const file = event.target.files[0];
    if (!file) return;
    customAudioName = file.name;
    fileToDataUrl(file).then(dataUrl => { customAudioDataUrl = dataUrl; });
}
function loadBackground(event) {
    const file = event.target.files[0];
    if (!file) return;
    backgroundName = file.name;
    fileToDataUrl(file).then(dataUrl => { backgroundUrl = dataUrl; });
}

function playPreview() {
    playUISound(Sounds.click);
    const audioFile = document.getElementById("audioFile").files[0];
    if (!audioFile && !customAudioDataUrl) { showError("Escolha um áudio primeiro ou use o áudio padrão."); return; }
    startAudio(customAudioDataUrl || URL.createObjectURL(audioFile));
}
function playDefaultAudio() {
    playUISound(Sounds.click);
    const audioPath = document.getElementById("defaultAudio").value;
    document.getElementById("audioFile").value = "";
    customAudioDataUrl = null;
    customAudioName = "";
    startAudio(audioPath);
}
function startAudio(src) {
    const validFrames = getValidFrames();
    if (validFrames.length === 0) { showError("Adicione pelo menos uma imagem."); return; }
    stopPreview();
    audio = new Audio(src);
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    const source = audioContext.createMediaElementSource(audio);
    connectAudioSource(source, analyser, audioContext, true);
    audio.play().then(() => animateMouth()).catch(() => showError("Não consegui tocar o áudio. Veja se o arquivo existe."));
}
function connectAudioSource(source, analyserNode, context, playToSpeakers) {
    const noiseReduction = document.getElementById("noiseReduction").checked;
    if (!noiseReduction) {
        source.connect(analyserNode);
        if (playToSpeakers) source.connect(context.destination);
        return;
    }
    const noiseLevel = document.getElementById("noiseLevel").value;
    let highpassValue = 120;
    let lowpassValue = 3500;
    if (noiseLevel === "medium") { highpassValue = 200; lowpassValue = 3000; }
    if (noiseLevel === "strong") { highpassValue = 300; lowpassValue = 2500; }
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = highpassValue;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = lowpassValue;
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyserNode);
    if (playToSpeakers) lowpass.connect(context.destination);
}
function stopPreview() {
    stopMicrophone();
    if (audio) { audio.pause(); audio.currentTime = 0; audio = null; }
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    const validFrames = getValidFrames();
    if (validFrames[0]) character.src = validFrames[0].url;
    if (eyesLayer) eyesLayer.src = eyesOpenUrl;
    currentMouth = 0;
    smoothVolume = 0;
    updateVoiceMeter(0);
}
function animateMouth() {
    if (!audio || !analyser || !dataArray || !audioContext) return;
    const volume = getVoiceVolume(audioContext, analyser, dataArray);
    updateVoiceMeter(volume);
    smoothVolume = smoothVolume * 0.78 + volume * 0.22;
    const now = performance.now();
    const mouthIndex = getMouthFrame(smoothVolume);
    const validFrames = getValidFrames();
    if (validFrames[mouthIndex] && mouthIndex !== currentMouth && now - lastFrameChange > 45) {
        currentMouth = mouthIndex;
        lastFrameChange = now;
        character.src = validFrames[mouthIndex].url;
    }
    if (!audio.paused && !audio.ended) animationId = requestAnimationFrame(animateMouth);
    else { if (validFrames[0]) character.src = validFrames[0].url; updateVoiceMeter(0); }
}
function getVoiceVolume(context, analyserNode, array) {
    analyserNode.getByteFrequencyData(array);
    const voiceMode = document.getElementById("voiceMode").checked;
    let total = 0, count = 0;
    for (let i = 0; i < array.length; i++) {
        const freq = i * context.sampleRate / analyserNode.fftSize;
        if (voiceMode) {
            if (freq >= 120 && freq <= 3500) { total += array[i]; count++; }
        } else { total += array[i]; count++; }
    }
    return count === 0 ? 0 : total / count;
}
function getMouthFrame(volume) {
    const validFrames = getValidFrames();
    if (validFrames.length <= 1 || volume < 4) return 0;
    const maxIndex = validFrames.length - 1;
    const sensitivity = Number(document.getElementById("sensitivity").value);
    let normalized = Math.min(volume / sensitivity, 1);
    normalized = Math.pow(normalized, 0.75);
    let frame = Math.round(normalized * maxIndex);
    if (Math.random() < 0.08 && frame > 0) frame = Math.max(1, frame - 1);
    return Math.max(0, Math.min(frame, maxIndex));
}
function getExportMouthFrame(volume, amount) {
    if (amount <= 1 || volume < 4) return 0;
    const maxIndex = amount - 1;
    const sensitivity = Number(document.getElementById("sensitivity").value);
    let normalized = Math.min(volume / sensitivity, 1);
    normalized = Math.pow(normalized, 0.75);
    return Math.max(0, Math.min(Math.round(normalized * maxIndex), maxIndex));
}
function getQualitySize() {
    const sizes = { "16":[28,16], "32":[57,32], "64":[114,64], "144":[256,144], "240":[426,240], "360":[640,360], "480":[854,480], "720":[1280,720], "1080":[1920,1080], "1440":[2560,1440], "2160":[3840,2160] };
    return sizes[document.getElementById("quality").value];
}
async function exportFrames() {
    playUISound(Sounds.click);
    const validFrames = getValidFrames();
    if (validFrames.length === 0) { showError("Não tem frames para exportar."); return; }
    exportStatus.innerText = "Criando ZIP...";
    updateExportProgress(10);
    const zip = new JSZip();
    for (let i = 0; i < validFrames.length; i++) {
        const response = await fetch(validFrames[i].url);
        const blob = await response.blob();
        zip.file(`frame_${String(i + 1).padStart(2, "0")}.png`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "TalkSprite_Frames.zip");
    updateExportProgress(100);
    exportStatus.innerText = "Frames baixados!";
}
function getSelectedAudioForExport() {
    if (customAudioDataUrl) return customAudioDataUrl;
    const audioFile = document.getElementById("audioFile").files[0];
    if (audioFile) return URL.createObjectURL(audioFile);
    return document.getElementById("defaultAudio").value;
}
async function exportVideo() {
    playUISound(Sounds.click);

    const format = document.getElementById("exportFormat").value;

    if (format === "gif") {
        await exportGif();
        return;
    }

    startExportMusic();

    const durationMode = document.getElementById("durationMode").value;
    const customDuration = Number(document.getElementById("customDuration").value);
    const maxDuration = durationMode === "custom" ? customDuration : Infinity;
    const loopAudio = document.getElementById("loopAudio").checked;

    const validFrames = getValidFrames();

    if (validFrames.length === 0) {
        stopExportMusic();
        showError("Adicione os frames primeiro.");
        return;
    }

    const audioSrc = getSelectedAudioForExport();

    if (!audioSrc) {
        stopExportMusic();
        showError("Escolha um áudio ou use o áudio padrão.");
        return;
    }

    if (format === "mp4") {
        alert("MP4 ainda está em beta. Por enquanto o navegador vai baixar WebM.");
    }

    const [width, height] = getQualitySize();

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    const stream = canvas.captureStream(30);

    exportAudio = new Audio(audioSrc);
    exportAudio.loop = durationMode === "custom" && loopAudio;

    const exportAudioContext = new AudioContext();
    const source = exportAudioContext.createMediaElementSource(exportAudio);
    const destination = exportAudioContext.createMediaStreamDestination();

    const exportAnalyser = exportAudioContext.createAnalyser();
    exportAnalyser.fftSize = 512;

    source.connect(destination);
    connectAudioSource(source, exportAnalyser, exportAudioContext, false);

    const audioTrack = destination.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);

    let recorder;

    try {
        recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        exportRecorder = recorder;
        isExporting = true;
        exportWasCancelled = false;
    } catch {
        stopExportMusic();
        showError("Seu navegador não conseguiu exportar vídeo WebM.");
        return;
    }

    const chunks = [];

    recorder.ondataavailable = function(event) {
        if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = function() {
        stopExportMusic();

        if (exportWasCancelled) {
            exportAudioContext.close().catch(() => {});
            isExporting = false;
            return;
        }

        const blob = new Blob(chunks, { type: "video/webm" });
        const name = document.getElementById("videoName").value || "TalkSprite_Video";

        downloadBlob(blob, name + ".webm");

        exportStatus.innerText = "Vídeo baixado!";
        updateExportProgress(100);

        exportAudioContext.close().catch(() => {});
        isExporting = false;
    };

    const exportData = new Uint8Array(exportAnalyser.frequencyBinCount);
    const validImages = [];

    for (const frame of validFrames) {
        validImages.push(await loadImage(frame.url));
    }

    const eyesOpenImage = await loadImage(eyesOpenUrl).catch(() => null);
    const eyesClosedImage = await loadImage(eyesClosedUrl).catch(() => null);

    let backgroundImage = null;

    if (backgroundUrl) {
        backgroundImage = await loadImage(backgroundUrl).catch(() => null);
    }

    const subtitleText = document.getElementById("subtitleText").value;
    const transparentBg = document.getElementById("transparentBg").checked;

    let smooth = 0;
    let startTime = 0;

    recorder.start();
    await exportAudio.play();

    startTime = performance.now();

    function drawFrame() {
        const elapsed = (performance.now() - startTime) / 1000;

        let volume = 0;

        if (!exportAudio.ended || exportAudio.loop) {
            volume = getVoiceVolume(exportAudioContext, exportAnalyser, exportData);
        }

        smooth = smooth * 0.78 + volume * 0.22;

        const frameIndex = getExportMouthFrame(smooth, validImages.length);
        const img = validImages[frameIndex] || validImages[0];

        ctx.clearRect(0, 0, width, height);

        if (backgroundImage) {
            ctx.drawImage(backgroundImage, 0, 0, width, height);
        } else if (!transparentBg) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
        }

        drawContain(ctx, img, width, height);

        if (document.getElementById("eyesEnabled").checked) {
            const eyeImg = shouldExportBlink(elapsed) ? eyesClosedImage : eyesOpenImage;
            if (eyeImg) drawContain(ctx, eyeImg, width, height);
        }

        if (subtitleText.trim() !== "") {
            ctx.font = Math.floor(height * 0.055) + "px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.strokeStyle = "black";
            ctx.lineWidth = Math.max(3, height * 0.006);

            const textX = width / 2;
            const textY = height - height * 0.08;

            ctx.strokeText(subtitleText, textX, textY);
            ctx.fillText(subtitleText, textX, textY);
        }

        const progressPercent =
            durationMode === "custom"
                ? Math.min((elapsed / maxDuration) * 100, 100)
                : 0;

        updateExportProgress(progressPercent);
        exportStatus.innerText = "Exportando... " + elapsed.toFixed(1) + "s";

        if (durationMode === "custom") {
            if (elapsed < maxDuration) {
                exportAnimationId = requestAnimationFrame(drawFrame);
            } else {
                stopRecorderSafely(recorder);
            }
        } else {
            if (!exportAudio.ended) {
                exportAnimationId = requestAnimationFrame(drawFrame);
            } else {
                stopRecorderSafely(recorder);
            }
        }
    }

    drawFrame();
}
function stopRecorderSafely(recorder) { if (recorder && recorder.state !== "inactive") recorder.stop(); }
function drawContain(ctx, img, width, height) {
    const scale = Math.min(width / img.width, height / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
}
function cancelExport() {
    if (!isExporting) { exportStatus.innerText = "Nenhuma exportação acontecendo."; return; }
    exportWasCancelled = true;
    stopExportMusic();
    if (exportAnimationId) { cancelAnimationFrame(exportAnimationId); exportAnimationId = null; }
    if (exportAudio) { exportAudio.pause(); exportAudio.currentTime = 0; exportAudio = null; }
    if (exportRecorder && exportRecorder.state !== "inactive") exportRecorder.stop();
    isExporting = false;
    exportStatus.innerText = "Exportação cancelada.";
    updateExportProgress(0);
}
function saveProject() {
    const project = { version: 5, frames: frames.map(frame => ({ url: frame.url, name: frame.name, isDefault: frame.isDefault || false })), eyesOpenUrl, eyesClosedUrl, backgroundUrl, backgroundName, customAudioDataUrl, customAudioName, settings: collectSettings() };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    downloadBlob(blob, "TalkSprite_Project.talksprite");
}
function loadProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
        try {
            const project = JSON.parse(reader.result);
            if (!project.frames || !Array.isArray(project.frames)) { showError("Projeto inválido."); return; }
            frames = project.frames.map(frame => ({ file: null, url: frame.url, name: frame.name || "Frame", isDefault: frame.isDefault || false }));
            eyesOpenUrl = project.eyesOpenUrl || eyesOpenUrl;
            eyesClosedUrl = project.eyesClosedUrl || eyesClosedUrl;
            backgroundUrl = project.backgroundUrl || null;
            backgroundName = project.backgroundName || "";
            customAudioDataUrl = project.customAudioDataUrl || null;
            customAudioName = project.customAudioName || "";
            applySettings(project.settings || {});
            refreshFramesUI();
            const validFrames = getValidFrames();
            if (validFrames[0]) character.src = validFrames[0].url;
            eyesLayer.src = eyesOpenUrl;
            updateEyesVisibility();
            exportStatus.innerText = "Projeto carregado!";
        } catch (error) { showError("Não consegui abrir esse projeto."); console.error(error); }
    };
    reader.readAsText(file);
}
function collectSettings() {
    const ids = ["defaultPack","defaultAudio","eyesEnabled","blinkEnabled","noiseReduction","noiseLevel","voiceMode","sensitivity","videoName","exportFormat","durationMode","customDuration","loopAudio","quality","subtitleText","transparentBg","uiSounds","exportMusicEnabled","exportMusicVolume"];
    const settings = {};
    ids.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        settings[id] = element.type === "checkbox" ? element.checked : element.value;
    });
    return settings;
}
function applySettings(settings) {
    Object.keys(settings).forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        if (element.type === "checkbox") element.checked = settings[id];
        else element.value = settings[id];
    });
    updateEyesVisibility();
    setupVolumeLabel();
}
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Não foi possível carregar imagem: " + src));
        img.src = src;
    });
}
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
function updateVoiceMeter(volume) {
    const bar = document.getElementById("voiceBar");
    if (!bar) return;
    const sensitivity = Number(document.getElementById("sensitivity").value);
    const percent = Math.min((volume / sensitivity) * 100, 100);
    bar.style.width = percent + "%";
}
function updateExportProgress(percent) {
    if (!exportProgress) return;
    exportProgress.style.width = Math.max(0, Math.min(percent, 100)) + "%";
}
function playWelcomeSound() {

    const uiSounds =
        document.getElementById("uiSounds");

    if (uiSounds && !uiSounds.checked)
        return;

    const audio = new Audio(
        "audio/sounds/Welcome to Talk Sprite!.mp3"
    );

    audio.volume = 0.7;

    audio.play().catch(() => {
        console.log(
            "Navegador bloqueou autoplay."
        );
    });
}
window.addEventListener("click", firstInteraction);

function firstInteraction() {

    playWelcomeSound();

    window.removeEventListener(
        "click",
        firstInteraction
    );
}

async function exportGif() {
    stopExportMusic();

    const validFrames = getValidFrames();

    if (validFrames.length === 0) {
        showError("Adicione os frames primeiro.");
        return;
    }

    if (typeof GIF === "undefined") {
        showError("A biblioteca GIF.js não carregou. Verifique o script no index.html.");
        return;
    }

    let [width, height] = getQualitySize();

    if (height > 720) {
        width = 1280;
        height = 720;
    }

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    exportStatus.innerText = "Criando GIF...";
    updateExportProgress(0);

    const gif = new GIF({
        workers: 2,
        quality: 20,
        width: width,
        height: height,
        workerScript: "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js"
    });

    const loadedImages = [];

    for (const frame of validFrames) {
        loadedImages.push(await loadImage(frame.url));
    }

    let backgroundImage = null;

    if (backgroundUrl) {
        backgroundImage = await loadImage(backgroundUrl).catch(() => null);
    }

    const eyesOpenImage = await loadImage(eyesOpenUrl).catch(() => null);
    const eyesClosedImage = await loadImage(eyesClosedUrl).catch(() => null);

    const subtitleText = document.getElementById("subtitleText").value;
    const transparentBg = document.getElementById("transparentBg").checked;

    const fps = 8;

    const durationMode = document.getElementById("durationMode").value;
    const customDuration = Number(document.getElementById("customDuration").value);

    const totalSeconds = durationMode === "custom" ? customDuration : 3;
    const totalFrames = Math.max(1, Math.floor(totalSeconds * fps));

    for (let i = 0; i < totalFrames; i++) {
        const elapsed = i / fps;
        const img = loadedImages[i % loadedImages.length];

        ctx.clearRect(0, 0, width, height);

        if (backgroundImage) {
            ctx.drawImage(backgroundImage, 0, 0, width, height);
        } else if (!transparentBg) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
        }

        drawContain(ctx, img, width, height);

        if (document.getElementById("eyesEnabled").checked) {
            const eyeImg = shouldExportBlink(elapsed) ? eyesClosedImage : eyesOpenImage;
            if (eyeImg) drawContain(ctx, eyeImg, width, height);
        }

        if (subtitleText.trim() !== "") {
            ctx.font = Math.floor(height * 0.055) + "px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.strokeStyle = "black";
            ctx.lineWidth = Math.max(3, height * 0.006);

            const textX = width / 2;
            const textY = height - height * 0.08;

            ctx.strokeText(subtitleText, textX, textY);
            ctx.fillText(subtitleText, textX, textY);
        }

        gif.addFrame(canvas, {
            copy: true,
            delay: 1000 / fps
        });

        updateExportProgress((i / totalFrames) * 100);
    }

    gif.on("finished", function(blob) {
        const name = document.getElementById("videoName").value || "TalkSprite_GIF";

        downloadBlob(blob, name + ".gif");

        exportStatus.innerText = "GIF baixado!";
        updateExportProgress(100);
    });

    gif.render();
}