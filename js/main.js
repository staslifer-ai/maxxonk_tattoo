import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Application State & Data ---
const appData = {
    contact: {},
    bodySpaces: [],
    tattooIdea: { description: '', references: [], screenshot3D: null },
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

    // 3D UI Elements
    maleBtn: document.getElementById('male-btn'),
    femaleBtn: document.getElementById('female-btn'),
    modeToggle: document.getElementById('mode-toggle'),
    drawingTools: document.querySelector('.drawing-tools'),
    brushSizeBtn: document.getElementById('brush-size-btn'),
    brushSlider: document.getElementById('brush-slider'),
    undoBtn: document.getElementById('undo-btn'),
    readyBtn: document.getElementById('ready-btn'),
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
        if (button.id === 'ready-btn') return;
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

        appData.tattooIdea.references.forEach((ref, index) => {
            formData.append('references', ref.file, `reference_${index + 1}.jpg`);
        });

        if (appData.tattooIdea.screenshot3D) {
            const response = await fetch(appData.tattooIdea.screenshot3D);
            const blob = await response.blob();
            formData.append('screenshot3D', blob, 'tattoo_design.png');
        }

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
            slider.addEventListener('input', e => { output.textContent = e.target.value; });
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
    let threeSceneInstance = null;

    DOMElements.tab3d.addEventListener('click', () => {
        toggleTabs(true);
        if (!modelInitialized) {
            threeSceneInstance = init3DScene();
            modelInitialized = true;
        }
    });
    DOMElements.tabManual.addEventListener('click', () => toggleTabs(false));

    DOMElements.readyBtn.addEventListener('click', () => {
        if (DOMElements.tab3d.classList.contains('is-active') && threeSceneInstance) {
            const screenshotDataUrl = threeSceneInstance.takeScreenshot();
            appData.tattooIdea.screenshot3D = screenshotDataUrl;
            console.log("3D Screenshot captured and saved to appData.");
        }
        showScreen(DOMElements.readyBtn.dataset.target);
    });
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
        dropArea.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
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
    [...files].forEach(file => {
        if (!file.type.startsWith('image/') || DOMElements.previewContainer.children.length >= 5) return;
        const fileData = { id: Date.now() + Math.random(), file: file };
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

// --- 3D Scene Logic (Refactored) ---
function init3DScene() {
    // --- State Management ---
    // Группируем все переменные 3D-сцены в один объект для порядка
    const state = {
        renderer: null,
        scene: null,
        camera: null,
        controls: null,
        currentModel: null,
        brushRadius: 0.05,
        currentMode: 'navigate', // 'navigate' or 'draw'
        isPainting: false,
        historyStack: [],
        raycaster: new THREE.Raycaster(),
        mouse: new THREE.Vector2(),
        brushColor: new THREE.Color(0x7B2BFF),
    };

    // --- Core Setup Functions ---
    /**
     * Инициализирует сцену, камеру, свет и рендерер
     */
    function setupScene() {
        const { clientWidth: w, clientHeight: h } = DOMElements.modelWrapper;

        state.scene = new THREE.Scene();
        state.scene.background = new THREE.Color(0xf0f0f0);

        state.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        state.camera.position.set(0, 1.6, 5); // Позиция камеры немного изменена для лучшего вида

        state.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        state.renderer.setSize(w, h);
        DOMElements.modelWrapper.appendChild(state.renderer.domElement);

        // Освещение
        state.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 7.5);
        state.scene.add(directionalLight);
    }

    /**
     * Настраивает OrbitControls для управления камерой
     */
    function setupControls() {
        state.controls = new OrbitControls(state.camera, state.renderer.domElement);
        state.controls.enableDamping = true;
        state.controls.target.set(0, 1, 0); // Цель камеры в центре модели
        state.controls.update();
    }

    /**
     * Создает загрузчик моделей с функцией нормализации
     */
    function createModelLoader() {
        const loader = new GLTFLoader();
        // Создаем ЕДИНЫЙ материал для всех моделей, чтобы они выглядели одинаково
        const sharedBodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,       // Белый цвет по умолчанию
            metalness: 0.1,
            roughness: 0.8,
            vertexColors: true,    // Обязательно для рисования!
        });

        /**
         * Загружает, нормализует и добавляет модель на сцену
         * @param {string} url - Путь к файлу модели .glb
         */
        function loadAndNormalizeModel(url) {
            if (state.currentModel) {
                state.scene.remove(state.currentModel);
            }
            state.historyStack.length = 0; // Очищаем историю отмен

            loader.load(url, (gltf) => {
                state.currentModel = gltf.scene;

                // --- КЛЮЧЕВАЯ ЛОГИКА НОРМАЛИЗАЦИИ ---
                // 1. Вычисляем "габаритный контейнер" (Bounding Box) модели
                const box = new THREE.Box3().setFromObject(state.currentModel);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());

                // 2. Находим самый большой размер (ширина, высота или глубина)
                const maxDim = Math.max(size.x, size.y, size.z);
                
                // 3. Вычисляем масштаб, чтобы модель вписалась в нужный нам размер (например, 3 юнита в высоту)
                const desiredHeight = 3.0;
                const scale = desiredHeight / maxDim;
                state.currentModel.scale.setScalar(scale);

                // 4. Пересчитываем центр ПОСЛЕ масштабирования
                const newBox = new THREE.Box3().setFromObject(state.currentModel);
                const newCenter = newBox.getCenter(new THREE.Vector3());

                // 5. Смещаем модель так, чтобы ее новый центр был в точке (0, 1.5, 0)
                // (немного поднимаем, чтобы "ноги" были на уровне 0)
                state.currentModel.position.sub(newCenter).add(new THREE.Vector3(0, 1.5, 0));
                // --- КОНЕЦ ЛОГИКИ НОРМАЛИЗАЦИИ ---

                // Применяем общий материал и подготавливаем для рисования
                state.currentModel.traverse(obj => {
                    if (obj.isMesh) {
                        // Применяем наш единый материал
                        obj.material = sharedBodyMaterial;

                        // Убеждаемся, что у геометрии есть атрибут цвета для вершин
                        if (!obj.geometry.hasAttribute('color')) {
                            const colors = new Float32Array(obj.geometry.attributes.position.count * 3);
                            colors.fill(1); // Заполняем белым цветом (r=1, g=1, b=1)
                            obj.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                        }
                    }
                });
                
                state.scene.add(state.currentModel);
                console.log(`Loaded and normalized: ${url}`, state.currentModel);

            }, undefined, (err) => console.error(`GLB loading error for ${url}:`, err));
        }
        
        return { load: loadAndNormalizeModel };
    }

    // --- Event Listeners and UI ---
    /**
     * Настраивает все обработчики событий для 3D интерфейса
     */
    function setupUIEventListeners(modelLoader) {
        // --- Выбор модели ---
        DOMElements.maleBtn.addEventListener('click', () => {
            DOMElements.maleBtn.classList.add('active');
            DOMElements.femaleBtn.classList.remove('active');
            modelLoader.load('man.glb');
        });
        DOMElements.femaleBtn.addEventListener('click', () => {
            DOMElements.femaleBtn.classList.add('active');
            DOMElements.maleBtn.classList.remove('active');
            modelLoader.load('woman.glb');
        });

        // --- Переключение режимов (Навигация/Рисование) ---
        DOMElements.modeToggle.addEventListener('click', () => {
            state.currentMode = (state.currentMode === 'navigate') ? 'draw' : 'navigate';
            const isNavigateMode = state.currentMode === 'navigate';
            state.controls.enabled = isNavigateMode;
            DOMElements.modeToggle.innerHTML = isNavigateMode ? '🖐️' : '🖌️';
            DOMElements.drawingTools.classList.toggle('hidden', isNavigateMode);
        });

        // --- Инструменты рисования ---
        const mapRadius = v => THREE.MathUtils.mapLinear(+v, 1, 100, 0.01, 0.15);
        
        DOMElements.brushSizeBtn.addEventListener('click', () => DOMElements.brushSlider.classList.toggle('hidden'));
        DOMElements.brushSlider.addEventListener('input', () => {
            state.brushRadius = mapRadius(DOMElements.brushSlider.value);
        });
        state.brushRadius = mapRadius(DOMElements.brushSlider.value); // Инициализация
        
        // --- Отмена действия ---
        DOMElements.undoBtn.addEventListener('click', () => {
            if (state.historyStack.length > 0 && state.currentModel) {
                const lastState = state.historyStack.pop();
                state.currentModel.traverse(obj => {
                    if(obj.isMesh) {
                        const colorAttr = obj.geometry.attributes.color;
                        colorAttr.array.set(lastState);
                        colorAttr.needsUpdate = true;
                    }
                });
            }
        });
        
        // --- События мыши для рисования ---
        const setMouse = (e) => {
            const rect = state.renderer.domElement.getBoundingClientRect();
            state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        };

        state.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (state.currentMode === 'draw' && e.button === 0 && state.currentModel) {
                state.isPainting = true;
                // Сохраняем текущее состояние цвета для возможности отмены
                state.currentModel.traverse(obj => {
                    if(obj.isMesh) {
                        const colorAttr = obj.geometry.attributes.color;
                        state.historyStack.push(new Float32Array(colorAttr.array));
                    }
                });
                paint(e);
            }
        });
        state.renderer.domElement.addEventListener('pointermove', (e) => {
            if (state.isPainting && state.currentMode === 'draw') paint(e);
        });
        window.addEventListener('pointerup', () => { state.isPainting = false; });
        
        // --- Изменение размера окна ---
        window.addEventListener('resize', () => {
            const { clientWidth, clientHeight } = DOMElements.modelWrapper;
            state.renderer.setSize(clientWidth, clientHeight);
            state.camera.aspect = clientWidth / clientHeight;
            state.camera.updateProjectionMatrix();
        });
    }

    // --- Core Logic ---
    /**
     * Функция рисования на модели
     */
    function paint(e) {
        const { raycaster, mouse, camera, scene, brushRadius, brushColor } = state;
        const setMouse = (ev) => {
            const rect = state.renderer.domElement.getBoundingClientRect();
            mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        };

        setMouse(e);
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(scene.children, true);
        if (!intersects.length) return;

        const hit = intersects[0];
        const { object, point } = hit;
        if (!object.isMesh) return;

        const geometry = object.geometry;
        const posAttr = geometry.attributes.position;
        const colorAttr = geometry.attributes.color;

        const tempVec = new THREE.Vector3();
        const prevColor = new THREE.Color();

        for (let i = 0; i < posAttr.count; i++) {
            tempVec.fromBufferAttribute(posAttr, i).applyMatrix4(object.matrixWorld);
            const dist = tempVec.distanceTo(point);

            if (dist < brushRadius) {
                const weight = 1 - (dist / brushRadius); // Плавный переход
                prevColor.fromBufferAttribute(colorAttr, i);
                prevColor.lerp(brushColor, weight);
                colorAttr.setXYZ(i, prevColor.r, prevColor.g, prevColor.b);
            }
        }
        colorAttr.needsUpdate = true;
    }
    
    /**
     * Главный цикл анимации
     */
    function animate() {
        requestAnimationFrame(animate);
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
    }
    
    // --- Initialization ---
    function initialize() {
        setupScene();
        setupControls();
        const modelLoader = createModelLoader();
        setupUIEventListeners(modelLoader);

        // Загрузка модели по умолчанию
        DOMElements.maleBtn.classList.add('active');
        modelLoader.load('man.glb'); 
        
        animate();
    }

    initialize();

    // --- Public API ---
    // Возвращаем методы, которые могут быть вызваны извне
    return {
        takeScreenshot: () => {
            state.renderer.render(state.scene, state.camera);
            return state.renderer.domElement.toDataURL('image/png');
        }
    };
}
