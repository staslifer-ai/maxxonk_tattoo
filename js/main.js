import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Converts a data URL to a Blob object.
 * @param {string} dataURL - The data URL to convert.
 * @returns {Blob} The Blob object.
 */
function dataURLtoBlob(dataURL) {
    const [header, data] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

/**
 * Captures screenshots of the 3D model, focusing on painted areas if available,
 * otherwise captures default views.
 * @param {THREE.PerspectiveCamera} camera - The camera used for rendering.
 * @param {OrbitControls} controls - The OrbitControls instance.
 * @param {THREE.WebGLRenderer} renderer - The WebGLRenderer instance.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {THREE.Mesh | THREE.Object3D} mainPaintedMesh - The main mesh or object being painted.
 * @param {Set<number>} paintedVertices - A Set of vertex indices that have been painted.
 * @returns {Promise<string[]>} An array of data URLs for the captured screenshots.
 */
async function captureModelScreenshots(camera, controls, renderer, scene, mainPaintedMesh, paintedVertices) {
    const originalPos = camera.position.clone();
    const originalTarget = controls.target.clone();
    const originalZoom = camera.zoom;

    // Fallback if no paint data or main model
    if (!mainPaintedMesh || !mainPaintedMesh.isMesh || paintedVertices.size === 0) {
        console.warn("No painted areas found or mainPaintedMesh is not a Mesh. Capturing default views.");
        return await captureDefaultModelScreenshots(camera, controls, renderer, scene);
    }

    const posAttr = mainPaintedMesh.geometry.attributes.position;

    const paintedWorldPositions = [];
    const tempVertex = new THREE.Vector3();

    // Convert painted vertices to world coordinates
    for (const index of paintedVertices) {
        tempVertex.fromBufferAttribute(posAttr, index);
        tempVertex.applyMatrix4(mainPaintedMesh.matrixWorld);
        paintedWorldPositions.push(tempVertex.clone());
    }

    if (paintedWorldPositions.length === 0) {
        console.warn("No painted world positions found. Capturing default views.");
        return await captureDefaultModelScreenshots(camera, controls, renderer, scene);
    }

    // 1. Calculate the Bounding Box for ALL painted areas
    const bbox = new THREE.Box3().setFromPoints(paintedWorldPositions);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Calculate optimal camera distance to fit the entire painted bbox
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
    cameraDistance *= 1.5; // Add some padding to ensure everything fits

    const shots = [];

    // Define capture directions relative to the center of the painted bbox
    // These are general views around the model, ensuring all painted areas are covered.
    const viewDirections = [
        new THREE.Vector3(0, 0, 1),  // Front view
        new THREE.Vector3(1, 0, 0),  // Right view
        new THREE.Vector3(0, 0, -1), // Back view
        new THREE.Vector3(-1, 0, 0), // Left view
        new THREE.Vector3(0, 1, 0),  // Top view
        // new THREE.Vector3(0, -1, 0)  // Bottom view (optional, typically not needed for body)
    ];


    for (const dir of viewDirections) {
        // Calculate camera position relative to the center of the painted bbox
        const cameraPos = center.clone().add(dir.normalize().multiplyScalar(cameraDistance));

        camera.position.copy(cameraPos);
        camera.lookAt(center); // Camera looks at the center of the painted area
        controls.target.copy(center); // Update OrbitControls target
        controls.update(); // Important to update controls after changing position and target

        renderer.render(scene, camera);
        await new Promise(r => setTimeout(r, 100)); // Small delay for rendering to complete
        shots.push(renderer.domElement.toDataURL('image/png'));
    }

    // Restore camera and controls to original position
    camera.position.copy(originalPos);
    controls.target.copy(originalTarget);
    camera.zoom = originalZoom;
    camera.updateProjectionMatrix(); // Update projection matrix after changing zoom
    controls.update();

    return shots;
}

/**
 * Captures screenshots from default fixed angles. Used as a fallback.
 * @param {THREE.PerspectiveCamera} camera - The camera used for rendering.
 * @param {OrbitControls} controls - The OrbitControls instance.
 * @param {THREE.WebGLRenderer} renderer - The WebGLRenderer instance.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @returns {Promise<string[]>} An array of data URLs for the captured screenshots.
 */
async function captureDefaultModelScreenshots(camera, controls, renderer, scene) {
    const originalPos = camera.position.clone();
    const originalTarget = controls.target.clone();
    const radius = originalPos.distanceTo(originalTarget);
    const y = originalPos.y; // Keep current Y level for default shots
    const positions = [
        [0, y, radius],     // Front
        [radius, y, 0],     // Right
        [0, y, -radius],    // Back
        [-radius, y, 0]     // Left
    ];

    const shots = [];
    for (const pos of positions) {
        camera.position.set(pos[0], pos[1], pos[2]);
        camera.lookAt(originalTarget);
        controls.update();
        renderer.render(scene, camera);
        await new Promise(r => setTimeout(r, 100)); // Small delay
        shots.push(renderer.domElement.toDataURL('image/png'));
    }

    camera.position.copy(originalPos);
    controls.target.copy(originalTarget);
    controls.update();
    return shots;
}

// --- Application State & Data ---
const appData = {
    contact: {},
    bodySpaces: [],
    tattooIdea: { description: '', references: [], screenshots3D: [] },
    appointmentDate: ''
};

// --- DOM Elements ---
const DOMElements = {
    tattooForm: document.getElementById('tattoo-form'),
    sections: document.querySelectorAll('.step-section'),
    navButtons: document.querySelectorAll('.btn[data-target]'),
    widthSlider: document.getElementById('width-slider'),
    widthValue: document.getElementById('width-value'),
    heightSlider: document.getElementById('height-slider'),
    heightValue: document.getElementById('height-value'),
    addSpaceBtn: document.getElementById('add-space-btn'),
    cardsContainer: document.getElementById('body-parts-cards'),
    bodyPartSelect: document.getElementById('body-part'),
    bodyDetailsInput: document.getElementById('body-details'),
    tab3d: document.getElementById('tab-3d'),
    tabManual: document.getElementById('tab-manual'),
    modelWrapper: document.getElementById('model-wrapper'),
    manualForm: document.getElementById('manual-form'),
    fileInput: document.getElementById('file-input'),
    dropArea: document.getElementById('file-drop-area'),
    previewContainer: document.getElementById('image-preview-container'),
    calendarGrid: document.querySelector('#schedule-section .calendar__grid'),
};

// --- Main Initializer ---
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupNavigation();
    setupFormSubmission();
    setupBodySelector();
    setupFileUpload();
    setupCalendar();
}

// --- Navigation ---
function showScreen(targetId) {
    DOMElements.sections.forEach(section => {
        section.classList.toggle('is-active', section.id === targetId);
    });
    window.scrollTo(0, 0);
}

function setupNavigation() {
    DOMElements.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            showScreen(targetId);
        });
    });
}

// --- Form Submission ---
function setupFormSubmission() {
    DOMElements.tattooForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitButton = document.getElementById('to-completed-btn');
        submitButton.disabled = true;
        submitButton.textContent = 'Отправка...';

        const formData = new FormData(DOMElements.tattooForm);

        const selectedDateEl = DOMElements.calendarGrid.querySelector('.is-selected');
        const monthYear = document.querySelector('#schedule-section .calendar__header h3').textContent;
        const appointmentDate = selectedDateEl ? `${selectedDateEl.textContent} ${monthYear}` : 'Не выбрана';
        formData.append('appointmentDate', appointmentDate);

        const bodySpacesText = appData.bodySpaces.map(space =>
            `Часть тела: ${space.part}, Размер: ${space.size}${space.details ? ', Детали: ' + space.details : ''}`
        ).join('; \n');
        formData.append('bodySpaces', bodySpacesText || 'Не указано');

        if (appData.tattooIdea.screenshots3D.length) {
            appData.tattooIdea.screenshots3D.forEach((dataUrl, idx) => {
                const blob = dataURLtoBlob(dataUrl);
                formData.append('screenshots', blob, `screenshot_${idx + 1}.png`);
            });
        }

        appData.tattooIdea.references.forEach((ref, index) => {
            formData.append('references', ref.file, `reference_${index + 1}.jpg`);
        });

        try {
            const response = await fetch('/.netlify/functions/sendForm', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Не удалось отправить форму.');
            }

            showScreen('completed-section');

        } catch (error) {
            console.error('Ошибка при отправке:', error);
            alert(`Произошла ошибка: ${error.message}`);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Next';
        }
    });
}

// --- Body Selector Logic ---
function setupBodySelector() {
    [DOMElements.widthSlider, DOMElements.heightSlider].forEach(slider => {
        if (slider) {
            const output = slider.id === 'width-slider' ? DOMElements.widthValue : DOMElements.heightValue;
            slider.addEventListener('input', e => {
                output.textContent = e.target.value;
            });
        }
    });

    DOMElements.addSpaceBtn.addEventListener('click', () => {
        const space = {
            id: Date.now(),
            part: DOMElements.bodyPartSelect.value,
            details: DOMElements.bodyDetailsInput.value.trim(),
            size: `${DOMElements.widthValue.textContent}cm x ${DOMElements.heightValue.textContent}cm`
        };
        appData.bodySpaces.push(space);
        renderBodySpaceCards();
        DOMElements.bodyDetailsInput.value = '';
    });

    DOMElements.cardsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('card__close-btn')) {
            const cardId = Number(e.target.parentElement.dataset.id);
            appData.bodySpaces = appData.bodySpaces.filter(space => space.id !== cardId);
            renderBodySpaceCards();
        }
    });

    let modelInitialized = false;
    DOMElements.tab3d.addEventListener('click', () => {
        toggleTabs(true);
        if (!modelInitialized) {
            init3DScene();
            modelInitialized = true;
        }
    });
    DOMElements.tabManual.addEventListener('click', () => toggleTabs(false));
}

function renderBodySpaceCards() {
    DOMElements.cardsContainer.innerHTML = appData.bodySpaces.map(space => `
        <div class="card" data-id="${space.id}">
            <button class="card__close-btn" type="button" title="Remove space">&times;</button>
            <div><b>Body part:</b> ${space.part}</div>
            <div><b>Size:</b> ${space.size}</div>
            ${space.details ? `<div><b>Details:</b> ${space.details}</div>` : ''}
        </div>
    `).join('');
}

function toggleTabs(show3d) {
    DOMElements.tab3d.classList.toggle('is-active', show3d);
    DOMElements.tabManual.classList.toggle('is-active', !show3d);
    DOMElements.modelWrapper.style.display = show3d ? 'block' : 'none';
    DOMElements.manualForm.style.display = show3d ? 'none' : 'flex';
}

// --- File Upload Logic ---
function setupFileUpload() {
    const { dropArea, fileInput, previewContainer } = DOMElements;
    if (!dropArea) return;

    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => handleFiles(e.target.files));

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    dropArea.addEventListener('dragenter', () => dropArea.classList.add('is-dragover'));
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('is-dragover'));
    dropArea.addEventListener('drop', e => {
        dropArea.classList.remove('is-dragover');
        handleFiles(e.dataTransfer.files);
    });

    previewContainer.addEventListener('click', e => {
        if (e.target.classList.contains('preview-item__remove-btn')) {
            const fileId = e.target.parentElement.dataset.id;
            appData.tattooIdea.references = appData.tattooIdea.references.filter(f => f.id != fileId);
            e.target.parentElement.remove();
        }
    });
}

function handleFiles(files) {
    ([...files]).forEach(file => {
        if (!file.type.startsWith('image/') || DOMElements.previewContainer.children.length >= 5) return;

        const fileData = {
            id: Date.now() + Math.random(),
            file: file
        };
        appData.tattooIdea.references.push(fileData);
        DOMElements.fileInput.value = '';

        const reader = new FileReader();
        reader.onload = () => {
            DOMElements.previewContainer.innerHTML += `
                <div class="preview-item" data-id="${fileData.id}">
                    <img src="${reader.result}" alt="${file.name}" class="preview-item__img">
                    <button class="preview-item__remove-btn" type="button" title="Remove image">&times;</button>
                </div>
            `;
        };
        reader.readAsDataURL(file);
    });
}

// --- Calendar Logic ---
function setupCalendar() {
    DOMElements.calendarGrid.addEventListener('click', e => {
        const target = e.target;
        if (target.classList.contains('calendar__date') && !target.classList.contains('is-other-month')) {
            DOMElements.calendarGrid.querySelector('.is-selected')?.classList.remove('is-selected');
            target.classList.add('is-selected');
        }
    });
}

// --- 3D Scene Logic ---
function init3DScene() {
    let renderer, scene, camera, controls, brushRadius;
    let paintMode = false;
    let isPainting = false;
    let paintedVertices = new Set(); // Stores indices of painted vertices for the main mesh
    let mainPaintedMesh = null; // Reference to the actual mesh being painted

    const mapRadius = v => THREE.MathUtils.mapLinear(+v, 5, 40, 0.03, 0.12);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const brushColor = new THREE.Color(0x7B2BFF);
    const tempVec = new THREE.Vector3();
    const prevColor = new THREE.Color();

    const { clientWidth: W, clientHeight: H } = DOMElements.modelWrapper;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.set(0, 1.5, 8);
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true // Crucial for toDataURL
    });
    renderer.setSize(W, H);
    DOMElements.modelWrapper.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.5, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 5, 5);
    scene.add(dl);

    const uiElements = create3DUI();
    DOMElements.modelWrapper.append(
        uiElements.paintBtn,
        uiElements.readyBtn,
        uiElements.slider,
        uiElements.sliderLabel,
        uiElements.zoomControls,
        uiElements.hintIcons,
        uiElements.genderBtn
    );

    uiElements.paintBtn.onclick = () => {
        paintMode = !paintMode;
        controls.enabled = !paintMode; // Disable orbit controls when in paint mode
        uiElements.paintBtn.classList.toggle('active', paintMode);
    };

    // Capture screenshots from several angles when the user is ready
    uiElements.readyBtn.addEventListener('click', async () => {
        try {
            uiElements.readyBtn.disabled = true;
            // Pass the mainPaintedMesh and the Set of painted vertices
            const shots = await captureModelScreenshots(camera, controls, renderer, scene, mainPaintedMesh, paintedVertices);
            appData.tattooIdea.screenshots3D = shots;
            uiElements.readyBtn.classList.add('captured');
        } catch (err) {
            console.error('Screenshot error:', err);
        } finally {
            uiElements.readyBtn.disabled = false;
        }
    });

    uiElements.slider.oninput = () => { brushRadius = mapRadius(uiElements.slider.value); };
    brushRadius = mapRadius(uiElements.slider.value);

    const zoomFactor = 1.2;
    uiElements.zoomInBtn.addEventListener('click', () => {
        camera.zoom *= zoomFactor;
        camera.updateProjectionMatrix();
    });
    uiElements.zoomOutBtn.addEventListener('click', () => {
        camera.zoom /= zoomFactor;
        camera.updateProjectionMatrix();
    });

    new GLTFLoader().load('man.glb', gltf => {
        const model = gltf.scene;
        model.traverse(obj => {
            if (obj.isMesh) {
                // Assign the first found mesh as the main one for painting.
                // If your GLB has multiple meshes and you only want to paint specific ones,
                // you might need a more robust way to identify your main mesh (e.g., by name).
                if (!mainPaintedMesh) {
                    mainPaintedMesh = obj;
                }

                const g = obj.geometry;
                if (!g.hasAttribute('color')) {
                    const colors = new Float32Array(g.attributes.position.count * 3);
                    colors.fill(1); // Default to white
                    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                }
                obj.material = obj.material.clone();
                obj.material.vertexColors = true;
            }
        });
        model.position.y = -16; // Adjust model position if needed
        scene.add(model);
    }, undefined, err => console.error('GLB loading error:', err));


    function paint(e) {
        setMouse(e);
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObjects(scene.children, true)[0];

        // Ensure we hit a mesh, and specifically our main painted mesh
        if (!hit || !hit.object.isMesh || hit.object !== mainPaintedMesh) return;

        const g = hit.object.geometry;
        const posAttr = g.attributes.position;
        const colorAttr = g.attributes.color;

        for (let i = 0; i < posAttr.count; i++) {
            // Transform vertex position to world coordinates for distance calculation
            tempVec.fromBufferAttribute(posAttr, i).applyMatrix4(hit.object.matrixWorld);
            const dist = tempVec.distanceTo(hit.point);
            if (dist > brushRadius) continue;

            const weight = 1 - (dist / brushRadius) ** 2; // Stronger in center, fades out
            prevColor.fromBufferAttribute(colorAttr, i);
            prevColor.lerp(brushColor, weight); // Blend colors
            colorAttr.setXYZ(i, prevColor.r, prevColor.g, prevColor.b);

            // Add the vertex index to the set of painted vertices
            paintedVertices.add(i);
        }
        colorAttr.needsUpdate = true; // Tell Three.js to re-upload color data to GPU
    }

    function setMouse(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    renderer.domElement.addEventListener('pointerdown', e => {
        if (paintMode && e.button === 0) { // Left click
            isPainting = true;
            paint(e);
        }
    });
    renderer.domElement.addEventListener('pointermove', e => {
        if (isPainting && paintMode) paint(e);
    });
    window.addEventListener('pointerup', () => { isPainting = false; });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    function onResize() {
        const { clientWidth, clientHeight } = DOMElements.modelWrapper;
        if (clientWidth === 0 || clientHeight === 0) return; // Prevent division by zero
        renderer.setSize(clientWidth, clientHeight);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
    }

    window.addEventListener('resize', onResize);
    animate(); // Start the animation loop
}

/**
 * Creates and returns the UI elements for the 3D viewer.
 * @returns {Object} An object containing references to the created UI elements.
 */
function create3DUI() {
    // Paint Button
    const paintBtn = document.createElement('button');
    paintBtn.type = 'button';
    paintBtn.id = 'paint-btn';
    paintBtn.className = 'model-ui-btn';
    paintBtn.innerHTML = `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(4 4) scale(1.5)"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></g></svg><span>Paint</span>`;

    // Ready Button
    const readyBtn = document.createElement('button');
    readyBtn.type = 'button';
    readyBtn.id = 'ready-btn';
    readyBtn.className = 'model-ui-btn';
    readyBtn.innerHTML = `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(4 4) scale(1.5)"><polyline points="20 6 9 17 4 12"/></g></svg><span>Ready</span>`;

    // Brush Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'brush-slider';
    slider.min = 5; slider.max = 40; slider.value = 20;
    const sliderLabel = document.createElement('div');
    sliderLabel.className = 'brush-label';
    sliderLabel.innerHTML = 'Size<br>Brush';

    // Zoom Controls
    const zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';
    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.id = 'zoom-in-btn';
    zoomInBtn.className = 'zoom-btn';
    zoomInBtn.textContent = '+';
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.id = 'zoom-out-btn';
    zoomOutBtn.className = 'zoom-btn';
    zoomOutBtn.textContent = '−';
    zoomControls.append(zoomOutBtn, zoomInBtn);

    // Hint Icons
    const hintIcons = document.createElement('div');
    hintIcons.className = 'hint-icons';
    const rotateIcon = document.createElement('div');
    rotateIcon.className = 'hint-icon';
    rotateIcon.innerHTML = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 4C11.5817 4 8 7.58172 8 12V20C8 24.4183 11.5817 28 16 28C20.4183 28 24 24.4183 24 20V12C24 7.58172 20.4183 4 16 4Z" stroke="#333" stroke-width="1.5" fill="none"/><path d="M16 4V12" stroke="#333" stroke-width="1.5"/><path d="M16 4C20.4183 4 24 7.58172 24 12H16V4Z" fill="#90EE90"/><rect x="15" y="7" width="2" height="4" rx="1" stroke="#333" stroke-width="1.5" fill="white"/><path d="M10 36H22" stroke="#333" stroke-width="1.5" stroke-linecap="round"/><path d="M12 34L10 36L12 38" stroke="#333" stroke-width="1.5" stroke-linecap="round"/><path d="M20 34L22 36L20 38" stroke="#333" stroke-width="1.5" stroke-linecap="round"/></svg><span>Rotate</span>`;
    const zoomIcon = document.createElement('div');
    zoomIcon.className = 'hint-icon';
    zoomIcon.innerHTML = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 4C11.5817 4 8 7.58172 8 12V20C8 24.4183 11.5817 28 16 28C20.4183 28 24 24.4183 24 20V12C24 7.58172 20.4183 4 16 4Z" stroke="#333" stroke-width="1.5" fill="none"/><path d="M16 4V12" stroke="#333" stroke-width="1.5"/><path d="M16 4C11.5817 4 8 7.58172 8 12H16V4Z" fill="#90EE90"/><rect x="15" y="7" width="2" height="4" rx="1" stroke="#333" stroke-width="1.5" fill="white"/><path d="M32 12L32 20" stroke="#333" stroke-width="1.5" stroke-linecap="round"/><path d="M30 14L32 12L34 14" stroke="#333" stroke-width="1.5" stroke-linecap="round"/><path d="M30 18L32 20L34 18" stroke="#333" stroke-width="1.5" stroke-linecap="round"/></svg><span>Zoom</span>`;
    hintIcons.append(rotateIcon, zoomIcon);

    // Gender Button
    const genderBtn = document.createElement('button');
    genderBtn.type = 'button';
    genderBtn.id = 'gender-btn';
    genderBtn.className = 'gender-selector-btn';
    genderBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.5 8.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z" stroke="#333" stroke-width="1.5"/><path d="M12 12v9m-2-2h4M17.5 4.5l-3-3m0 3l3-3" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Gender</span>`;

    return { paintBtn, readyBtn, slider, sliderLabel, zoomControls, zoomInBtn, zoomOutBtn, hintIcons, genderBtn };
}
