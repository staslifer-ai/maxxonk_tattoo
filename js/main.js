import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Application State & Data ---
const appData = {
    contact: {},
    bodySpaces: [],
    tattooIdea: {
        description: '',
        references: []
    },
    appointmentDate: ''
};

// --- DOM Elements ---
const DOMElements = {
    sections: document.querySelectorAll('.step-section'),
    navButtons: document.querySelectorAll('.btn[data-target]'),
    toCompletedBtn: document.getElementById('to-completed-btn'),
    // Body Selector
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
    // File Upload
    fileInput: document.getElementById('file-input'),
    dropArea: document.getElementById('file-drop-area'),
    previewContainer: document.getElementById('image-preview-container'),
    // Calendar
    calendarGrid: document.querySelector('#schedule-section .calendar__grid'),
};

// --- Main Initializer ---
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupNavigation();
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
    
    DOMElements.toCompletedBtn.addEventListener('click', () => {
    collectAllData();
    document.getElementById('tattoo-form').submit(); // ← отправляем форму!
});
}

// --- Data Collection ---
function collectAllData() {
    appData.contact = {
        fullName: document.getElementById('fullname').value || 'Не указано',
        email: document.getElementById('email').value || 'Не указано',
        phone: document.getElementById('phone').value || 'Не указано',
        additional: document.getElementById('additional').value || 'Нет',
    };
    
    // БЕРЁМ описание из textarea!
    appData.tattooIdea.description = document.getElementById('tattoo-description').value || 'Нет описания';
    
    // Дата
    const selectedDateEl = DOMElements.calendarGrid.querySelector('.is-selected');
    const monthYear = document.querySelector('#schedule-section .calendar__header h3').textContent;
    appData.appointmentDate = selectedDateEl ? `${selectedDateEl.textContent} ${monthYear}` : 'Не выбрана';
}

// --- Body Selector Logic ---
function setupBodySelector() {
    // Sliders
    [DOMElements.widthSlider, DOMElements.heightSlider].forEach(slider => {
        if (slider) {
            const output = slider.id === 'width-slider' ? DOMElements.widthValue : DOMElements.heightValue;
            slider.addEventListener('input', e => {
                output.textContent = e.target.value;
            });
        }
    });

    // Add Space Button
    DOMElements.addSpaceBtn.addEventListener('click', () => {
        const space = {
            id: Date.now(),
            part: DOMElements.bodyPartSelect.value,
            details: DOMElements.bodyDetailsInput.value.trim(),
            size: `${DOMElements.widthValue.textContent}cm x ${DOMElements.heightValue.textContent}cm`
        };
        appData.bodySpaces.push(space);
        renderBodySpaceCards();
        DOMElements.bodyDetailsInput.value = ''; // Clear input
    });

    // Event delegation for removing cards
    DOMElements.cardsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('card__close-btn')) {
            const cardId = Number(e.target.parentElement.dataset.id);
            appData.bodySpaces = appData.bodySpaces.filter(space => space.id !== cardId);
            renderBodySpaceCards();
        }
    });

    // 3D/Manual Tabs
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
    
    // Open file dialog on click
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => handleFiles(e.target.files));

    // Drag & Drop events
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

    // Event delegation for remove buttons
    previewContainer.addEventListener('click', e => {
        if (e.target.classList.contains('preview-item__remove-btn')) {
            const fileId = e.target.parentElement.dataset.id;
            appData.tattooIdea.references = appData.tattooIdea.references.filter(f => f.id != fileId);
            e.target.parentElement.remove();
        }
    });
}

function handleFiles(files) {
    [...files].forEach(file => {
        if (!file.type.startsWith('image/') || DOMElements.previewContainer.children.length >= 5) return;
        
        const fileData = {
            id: Date.now() + Math.random(), // Unique ID for the file
            file: file
        };
        appData.tattooIdea.references.push(fileData);
        
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

    // --- Вспомогательные функции и переменные для рисования (ПЕРЕМЕЩЕНЫ ВВЕРХ) ---
    const mapRadius = v => THREE.MathUtils.mapLinear(+v, 5, 40, 0.03, 0.12);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const brushColor = new THREE.Color(0x7B2BFF);
    const tempVec = new THREE.Vector3();
    const prevColor = new THREE.Color();
    // --- Конец перемещенного блока ---

    const { clientWidth: W, clientHeight: H } = DOMElements.modelWrapper;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.set(0, 1.5, 8);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    DOMElements.modelWrapper.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.5, 0);
    controls.update();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 5, 5);
    scene.add(dl);

    // Create UI inside the model wrapper
    create3DUI();

    // Load Model
    new GLTFLoader().load('man.glb', gltf => {
        const model = gltf.scene;
        model.traverse(obj => {
            if (obj.isMesh) {
                const g = obj.geometry;
                if (!g.hasAttribute('color')) {
                    const colors = new Float32Array(g.attributes.position.count * 3);
                    colors.fill(1);
                    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                }
                obj.material = obj.material.clone();
                obj.material.vertexColors = true;
            }
        });
        model.position.y = -16; // Adjust based on model pivot
        scene.add(model);
    }, undefined, err => console.error('GLB loading error:', err));
    
    
    // --- 3D UI and Painting Logic ---
    function create3DUI() {
        // Paint Button
        const paintBtn = document.createElement('button');
        paintBtn.id = 'paint-btn';
        paintBtn.className = 'model-ui-btn';
        paintBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg><span>Paint</span>`;
        paintBtn.onclick = () => {
            paintMode = !paintMode;
            controls.enabled = !paintMode;
            paintBtn.classList.toggle('active', paintMode);
        };
        
        // Ready Button
        const readyBtn = document.createElement('button');
        readyBtn.id = 'ready-btn';
        readyBtn.className = 'model-ui-btn';
        readyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Ready</span>`;
        // readyBtn.onclick = () => { /* Add logic for "Ready" */ };

        // Brush Slider
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'brush-slider';
        slider.min = 5; slider.max = 40; slider.value = 20;
        slider.oninput = () => { brushRadius = mapRadius(slider.value); };
        brushRadius = mapRadius(slider.value); // Initial value
        
        const sliderLabel = document.createElement('div');
        sliderLabel.className = 'brush-label';
        sliderLabel.innerHTML = 'Size<br>Brush';

        DOMElements.modelWrapper.append(paintBtn, readyBtn, slider, sliderLabel);
    }
    
    function setMouse(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function paint(e) {
        setMouse(e);
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObjects(scene.children, true)[0];
        if (!hit) return;

        const g = hit.object.geometry;
        const posAttr = g.attributes.position;
        const colorAttr = g.attributes.color;

        for (let i = 0; i < posAttr.count; i++) {
            tempVec.fromBufferAttribute(posAttr, i).applyMatrix4(hit.object.matrixWorld);
            const dist = tempVec.distanceTo(hit.point);
            if (dist > brushRadius) continue;
            
            const weight = 1 - (dist / brushRadius) ** 2; // Smooth falloff
            prevColor.fromBufferAttribute(colorAttr, i);
            prevColor.lerp(brushColor, weight);
            colorAttr.setXYZ(i, prevColor.r, prevColor.g, prevColor.b);
        }
        colorAttr.needsUpdate = true;
    }

    renderer.domElement.addEventListener('pointerdown', e => {
        if (paintMode && e.button === 0) {
            isPainting = true;
            paint(e);
        }
    });
    renderer.domElement.addEventListener('pointermove', e => {
        if (isPainting && paintMode) paint(e);
    });
    window.addEventListener('pointerup', () => { isPainting = false; });
    
    // Animation loop & Resizing
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    
    function onResize() {
        const { clientWidth, clientHeight } = DOMElements.modelWrapper;
        renderer.setSize(clientWidth, clientHeight);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
    }
    
    window.addEventListener('resize', onResize);
    animate();
    document.addEventListener('DOMContentLoaded', () => {
  const submitButton = document.getElementById('to-completed-btn');
  if (submitButton) {
    submitButton.addEventListener('click', () => {
      document.getElementById('tattoo-form').submit();
    });
  }
});
}