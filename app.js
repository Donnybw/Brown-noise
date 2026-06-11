// Property Line Measurement App
// Uses Google Maps Static API - Manual boundary drawing

const DEFAULT_ZOOM_LEVEL = 19;
let currentZoomLevel = 19; // Will be updated from dropdown
const IMAGE_SIZE = 640; // Max size for Static Maps API
// Base meters per pixel at zoom 19, equator. Doubles for each zoom level decrease.
const METERS_PER_PIXEL_ZOOM_19 = 0.29858;
const FEET_PER_METER = 3.28084;

// Get the selected satellite zoom level from the dropdown
function getSelectedZoomLevel() {
    const select = document.getElementById('satellite-zoom');
    return select ? parseInt(select.value, 10) : DEFAULT_ZOOM_LEVEL;
}

// DOM Elements
const addressInput = document.getElementById('address');
const analyzeBtn = document.getElementById('analyze-btn');
const resultsSection = document.getElementById('results');
const mapWrapper = document.getElementById('map-wrapper'); // Wrapper for zoom/pan
const satelliteImg = document.getElementById('satellite-img');
const overlayCanvas = document.getElementById('overlay-canvas');
const loadingOverlay = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const measurementGrid = document.getElementById('measurement-grid');
const areaDisplay = document.getElementById('area-display');
const shedClearancesPanel = document.getElementById('shed-clearances');
const shedClearanceGrid = document.getElementById('shed-clearance-grid');
const shedClearanceWarning = document.getElementById('shed-clearance-warning');
const addHouseBtn = document.getElementById('add-house-btn');
const removeHouseBtn = document.getElementById('remove-house-btn');
const alignShedBtn = document.getElementById('align-shed-btn');
const errorSection = document.getElementById('error');
const errorMessage = document.getElementById('error-message');

// Zoom & Pan Controls
const btnReset = document.getElementById('btn-reset');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnPanMode = document.getElementById('btn-pan-mode');
const btnRotateLeft = document.getElementById('btn-rotate-left');
const btnRotateRight = document.getElementById('btn-rotate-right');

// Zoom/Pan/Rotation State
let scale = 1;
let panX = 0;
let panY = 0;
let mapRotation = 0; // Map rotation in radians
let isPanMode = true; // Always on (toggle removed)
let isPanning = false;
let panStart = { x: 0, y: 0 };
let isSnapMode = true;
try {
    isSnapMode = localStorage.getItem('snapMode') !== 'false';
} catch (e) { }
let isShadowLabelMode = false;
let initialPinchDistance = null;
let lastScale = 1;

// Help panel (desktop open by default; remember user choice; keep mobile closed)
const workflowHelp = document.getElementById('workflow-help');
if (workflowHelp) {
    const isTouchDevice = window.matchMedia
        ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
        : ('ontouchstart' in window);
    const isMobileScreen = window.matchMedia
        ? window.matchMedia('(max-width: 900px)').matches
        : (window.innerWidth <= 900);

    let shouldOpen = false;
    try {
        const saved = localStorage.getItem('workflowHelpOpen');
        if (saved === '1') shouldOpen = true;
        else if (saved === '0') shouldOpen = false;
        else shouldOpen = !(isTouchDevice && isMobileScreen);
    } catch (e) {
        shouldOpen = !(isTouchDevice && isMobileScreen);
    }

    workflowHelp.open = shouldOpen;
    workflowHelp.addEventListener('toggle', () => {
        try {
            localStorage.setItem('workflowHelpOpen', workflowHelp.open ? '1' : '0');
        } catch (e) { }
    });
}

// Add Snap toggle control (does not affect default behavior; starts ON).
const mapControls = btnReset && btnReset.parentElement;
let btnSnapMode = null;
let btnSquareProperty = null;
let btnShedTool = null;
let btnHouseTool = null;
let btnShadowLabel = null;
let shedPopup = null;
let housePopup = null;
let setbackPopupRef = null;
let btnSetbackToolRef = null;

// Popup input state (replaces removed HTML inputs)
let popupShedW = 12;
let popupShedH = 10;
let popupHouseW = 40;
let popupHouseH = 30;

// Reference Line State (Global)
let customReferenceLine = null; // { p1: {x, y}, p2: {x, y} } or null
let isDrawingReferenceLine = false; // True when placing a new reference line
let referenceLineStartPoint = null; // Temp start point during drawing
let referenceLineCurrentPoint = null; // Temp current point for preview
let isDraggingReferenceEndpoint = false; // True when dragging an endpoint
let draggedReferenceEndpoint = null; // 'p1' or 'p2'
let showReferenceLineDistance = true; // Show distance from shed to reference line

// Custom Labeled Lines State (Global)
let customLabeledLines = []; // Array of { id, p1: {x,y}, p2: {x,y}, label: string }
let isDrawingLabeledLine = false;
let labeledLineStartPoint = null;
let labeledLineCurrentPoint = null;
let pendingLabeledLineLabel = ''; // Label to use when line is completed
let isDraggingLabeledLineEndpoint = false;
let draggedLabeledLine = null; // { line, endpoint: 'p1' | 'p2' }
let btnLabeledLineTool = null;
let labeledLinePopup = null;

// Helper: Close all popups
function closeAllPopups() {
    if (shedPopup) shedPopup.classList.remove('visible');
    if (housePopup) housePopup.classList.remove('visible');
    if (setbackPopupRef) setbackPopupRef.classList.remove('visible');
    if (window.measurePopupRef) window.measurePopupRef.classList.remove('visible');
    if (window.whiteoutPopupRef) window.whiteoutPopupRef.classList.remove('visible');
    if (window.labeledLinePopupRef) window.labeledLinePopupRef.classList.remove('visible');
    if (btnShedTool) btnShedTool.classList.remove('active');
    if (btnHouseTool) btnHouseTool.classList.remove('active');
    if (window.btnMeasureToolRef) window.btnMeasureToolRef.classList.remove('active');
    if (window.btnWhiteoutToolRef) window.btnWhiteoutToolRef.classList.remove('active');
    if (btnSetbackToolRef) btnSetbackToolRef.classList.remove('active');
    if (window.btnLabeledLineToolRef) window.btnLabeledLineToolRef.classList.remove('active');
}

// Helper: Create popup element
function createToolPopup(id) {
    const popup = document.createElement('div');
    popup.id = id;
    popup.className = 'map-tool-popup';
    return popup;
}

if (mapControls) {
    btnSnapMode = document.createElement('button');
    btnSnapMode.id = 'btn-snap-mode';
    btnSnapMode.type = 'button';
    btnSnapMode.className = 'control-btn';
    btnSnapMode.title = 'Snap (toggle)';
    btnSnapMode.setAttribute('aria-label', 'Toggle snapping');
    btnSnapMode.textContent = 'SNAP';
    btnSnapMode.classList.toggle('active', isSnapMode);
    btnSnapMode.setAttribute('aria-pressed', String(isSnapMode));

    btnSquareProperty = document.createElement('button');
    btnSquareProperty.id = 'btn-square-property';
    btnSquareProperty.type = 'button';
    btnSquareProperty.className = 'control-btn';
    btnSquareProperty.title = 'Square boundary (4 corners)';
    btnSquareProperty.setAttribute('aria-label', 'Square property boundary');
    btnSquareProperty.textContent = 'RECT';

    // SHED Tool with Popup
    const shedWrapper = document.createElement('div');
    shedWrapper.className = 'control-btn-wrapper';

    btnShedTool = document.createElement('button');
    btnShedTool.id = 'btn-shed-tool';
    btnShedTool.type = 'button';
    btnShedTool.className = 'control-btn';
    btnShedTool.title = 'Shed tool';
    btnShedTool.setAttribute('aria-label', 'Shed tool');
    btnShedTool.textContent = 'SHED';

    shedPopup = createToolPopup('shed-popup');
    shedPopup.innerHTML = `
        <div class="map-tool-popup-title">🛖 Structures</div>
        <div class="map-tool-popup-row" style="margin-bottom: 6px;">
            <select id="popup-structure-type" style="flex: 1; padding: 4px;">
                <option value="shed">Shed</option>
                <option value="garage">Garage</option>
                <option value="pool">Pool</option>
                <option value="patio">Patio</option>
                <option value="other">Other</option>
            </select>
        </div>
        <div class="map-tool-popup-row">
            <input type="number" id="popup-shed-w" value="12" step="1" min="1">
            <span>×</span>
            <input type="number" id="popup-shed-h" value="10" step="1" min="1">
            <span>ft</span>
        </div>
        <button id="popup-add-shed" class="btn btn-secondary">Add Structure</button>
        <button id="popup-square-shed" class="btn btn-secondary" style="display:none;">Square</button>
        <button id="popup-remove-shed" class="btn btn-secondary btn-remove" style="display:none;">Remove Selected</button>
        <div id="structures-list" style="margin-top: 8px; max-height: 100px; overflow-y: auto;"></div>
        <div id="shed-distance-toggles" style="display:none; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; cursor: pointer; margin-bottom: 6px;">
                <input type="checkbox" id="toggle-shed-lines-master" checked style="width: 14px; height: 14px;">
                <span style="color: var(--text-primary);">Show clearance lines</span>
            </label>
            <div id="shed-lines-individual" style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" id="toggle-shed-line-1" checked style="width: 12px; height: 12px;">
                    <span style="color: var(--text-secondary);">Line 1</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" id="toggle-shed-line-2" checked style="width: 12px; height: 12px;">
                    <span style="color: var(--text-secondary);">Line 2</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" id="toggle-shed-line-3" checked style="width: 12px; height: 12px;">
                    <span style="color: var(--text-secondary);">Line 3</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" id="toggle-shed-line-4" checked style="width: 12px; height: 12px;">
                    <span style="color: var(--text-secondary);">Line 4</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                    <input type="checkbox" id="toggle-shed-line-house" checked style="width: 12px; height: 12px;">
                    <span style="color: var(--text-secondary);">House</span>
                </label>
            </div>
        </div>
    `;
    shedWrapper.appendChild(btnShedTool);
    shedWrapper.appendChild(shedPopup);

    // HOUSE Tool with Popup
    const houseWrapper = document.createElement('div');
    houseWrapper.className = 'control-btn-wrapper';

    btnHouseTool = document.createElement('button');
    btnHouseTool.id = 'btn-house-tool';
    btnHouseTool.type = 'button';
    btnHouseTool.className = 'control-btn';
    btnHouseTool.title = 'House tool';
    btnHouseTool.setAttribute('aria-label', 'House tool');
    btnHouseTool.textContent = 'HOUSE';

    housePopup = createToolPopup('house-popup');
    housePopup.innerHTML = `
        <div class="map-tool-popup-title">🏠 House</div>
        <div class="map-tool-popup-row">
            <input type="number" id="popup-house-w" value="40" step="1" min="1">
            <span>×</span>
            <input type="number" id="popup-house-h" value="30" step="1" min="1">
            <span>ft</span>
        </div>
        <button id="popup-select-house" class="btn btn-secondary" style="width: 100%; margin-bottom: 4px;">Select on Map</button>
        <button id="popup-remove-house" class="btn btn-secondary btn-remove" style="display:none; width: 100%;">Clear House</button>
        
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);">
             <button id="popup-draw-ref-line" class="btn btn-secondary" style="width: 100%; margin-bottom: 4px;">📏 Draw Distance Line</button>
             <button id="popup-remove-ref-line" class="btn btn-secondary btn-remove" style="width: 100%; display:none;">Clear Distance Line</button>
        </div>
    `;
    houseWrapper.appendChild(btnHouseTool);
    houseWrapper.appendChild(housePopup);

    // Bind House Popup Buttons (Reference Line)
    setTimeout(() => { // Ensure DOM is ready just in case, though appendChild is sync
        const btnDraw = document.getElementById('popup-draw-ref-line');
        const btnRemoveRef = document.getElementById('popup-remove-ref-line');

        if (btnDraw) btnDraw.addEventListener('click', () => {
            closeAllPopups();
            setReferenceLineMode(true);
        });

        if (btnRemoveRef) btnRemoveRef.addEventListener('click', () => {
            customReferenceLine = null;
            drawBoundary(currentCorners);
            updateHousePopupState(); // Refresh buttons
        });
    }, 0);

    btnShadowLabel = document.createElement('button');
    btnShadowLabel.id = 'btn-shadow-label';
    btnShadowLabel.type = 'button';
    btnShadowLabel.className = 'control-btn';
    btnShadowLabel.title = 'Add a SHADOW label';
    btnShadowLabel.setAttribute('aria-label', 'Add a shadow label');
    btnShadowLabel.textContent = 'SHDW';
    btnShadowLabel.classList.toggle('active', isShadowLabelMode);
    btnShadowLabel.setAttribute('aria-pressed', String(isShadowLabelMode));

    // WHITEOUT Tool with Popup
    const whiteoutWrapper = document.createElement('div');
    whiteoutWrapper.className = 'control-btn-wrapper';

    const btnWhiteoutTool = document.createElement('button');
    btnWhiteoutTool.id = 'btn-whiteout-tool';
    btnWhiteoutTool.type = 'button';
    btnWhiteoutTool.className = 'control-btn';
    btnWhiteoutTool.title = 'White out areas';
    btnWhiteoutTool.setAttribute('aria-label', 'White out areas');
    btnWhiteoutTool.innerHTML = 'WHITE<br>OUT';
    btnWhiteoutTool.classList.toggle('active', false);
    btnWhiteoutTool.setAttribute('aria-pressed', 'false');

    const whiteoutPopup = createToolPopup('whiteout-popup');
    whiteoutPopup.innerHTML = `
        <div class="map-tool-popup-title">⬜ White Out</div>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0 0 8px;">Click and drag on the map to white out an area.</p>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <button id="popup-pick-color" class="btn btn-secondary" style="flex: 1;">🎨 Pick Color</button>
            <div id="whiteout-color-preview" style="width: 28px; height: 28px; border-radius: 4px; border: 2px solid #666; background: white;"></div>
        </div>
        <button id="popup-clear-whiteout" class="btn btn-secondary btn-remove">Clear All</button>
    `;
    whiteoutWrapper.appendChild(btnWhiteoutTool);
    whiteoutWrapper.appendChild(whiteoutPopup);



    // SETBACK Tool with Popup
    const setbackWrapper = document.createElement('div');
    setbackWrapper.className = 'control-btn-wrapper';

    const btnSetbackTool = document.createElement('button');
    btnSetbackTool.id = 'btn-setback-tool';
    btnSetbackTool.type = 'button';
    btnSetbackTool.className = 'control-btn';
    btnSetbackTool.title = 'Setback line';
    btnSetbackTool.setAttribute('aria-label', 'Setback line');
    btnSetbackTool.innerHTML = 'SET<br>BACK';

    const setbackPopup = createToolPopup('setback-popup');
    setbackPopup.innerHTML = `
        <div class="map-tool-popup-title">📏 Setback</div>
        <div class="map-tool-popup-row">
            <input type="number" id="popup-setback-distance" value="5" step="1" min="0" max="50">
            <span>ft</span>
        </div>
        <label class="map-tool-popup-row" style="cursor: pointer; margin-bottom: 0;">
            <input type="checkbox" id="popup-setback-toggle" style="width: 18px; height: 18px;">
            <span>Show setback line</span>
        </label>
    `;
    setbackWrapper.appendChild(btnSetbackTool);
    setbackWrapper.appendChild(setbackPopup);

    // Store references for closeAllPopups
    setbackPopupRef = setbackPopup;
    btnSetbackToolRef = btnSetbackTool;

    // TAPE MEASURE Tool with Popup
    const measureWrapper = document.createElement('div');
    measureWrapper.className = 'control-btn-wrapper';

    const btnMeasureTool = document.createElement('button');
    btnMeasureTool.id = 'btn-measure-tool';
    btnMeasureTool.type = 'button';
    btnMeasureTool.className = 'control-btn';
    btnMeasureTool.title = 'Edit measurements';
    btnMeasureTool.setAttribute('aria-label', 'Edit measurements');
    btnMeasureTool.innerHTML = '📏';

    const measurePopup = createToolPopup('measure-popup');
    measurePopup.innerHTML = `
        <div class="map-tool-popup-title">📏 Property Size</div>
        <div class="measure-popup-grid" id="measure-popup-grid">
            <!-- Dynamically populated based on number of corners -->
        </div>
    `;
    measureWrapper.appendChild(btnMeasureTool);
    measureWrapper.appendChild(measurePopup);

    // Store references
    window.measurePopupRef = measurePopup;
    window.btnMeasureToolRef = btnMeasureTool;

    // Store whiteout references
    window.whiteoutPopupRef = whiteoutPopup;
    window.btnWhiteoutToolRef = btnWhiteoutTool;

    // LABELED LINE Tool with Popup
    const labeledLineWrapper = document.createElement('div');
    labeledLineWrapper.className = 'control-btn-wrapper';

    btnLabeledLineTool = document.createElement('button');
    btnLabeledLineTool.id = 'btn-labeled-line-tool';
    btnLabeledLineTool.type = 'button';
    btnLabeledLineTool.className = 'control-btn';
    btnLabeledLineTool.title = 'Draw labeled line';
    btnLabeledLineTool.setAttribute('aria-label', 'Draw labeled line');
    btnLabeledLineTool.innerHTML = '🏷️';

    labeledLinePopup = createToolPopup('labeled-line-popup');
    labeledLinePopup.innerHTML = `
        <div class="map-tool-popup-title">🏷️ Labeled Line</div>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0 0 8px;">Draw a line with a custom label and measurement.</p>
        <div style="margin-bottom: 8px;">
            <input type="text" id="labeled-line-input" placeholder="Label (e.g., Sewer Line)" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary);">
        </div>
        <button id="popup-draw-labeled-line" class="btn btn-secondary" style="width: 100%; margin-bottom: 4px;">📏 Draw Line</button>
        <div id="labeled-lines-list" style="margin-top: 8px; max-height: 150px; overflow-y: auto;"></div>
    `;
    labeledLineWrapper.appendChild(btnLabeledLineTool);
    labeledLineWrapper.appendChild(labeledLinePopup);

    // Store reference for closeAllPopups
    window.labeledLinePopupRef = labeledLinePopup;
    window.btnLabeledLineToolRef = btnLabeledLineTool;

    if (btnPanMode && btnPanMode.parentElement === mapControls) {
        mapControls.insertBefore(btnSnapMode, btnPanMode);
        mapControls.insertBefore(btnSquareProperty, btnPanMode);
        mapControls.insertBefore(shedWrapper, btnPanMode);
        mapControls.insertBefore(houseWrapper, btnPanMode);
        mapControls.insertBefore(btnShadowLabel, btnPanMode);
        mapControls.insertBefore(whiteoutWrapper, btnPanMode);
        mapControls.insertBefore(setbackWrapper, btnPanMode);
        mapControls.insertBefore(measureWrapper, btnPanMode);
        mapControls.insertBefore(labeledLineWrapper, btnPanMode);
    } else {
        mapControls.appendChild(btnSnapMode);
        mapControls.appendChild(btnSquareProperty);
        mapControls.appendChild(shedWrapper);
        mapControls.appendChild(houseWrapper);
        mapControls.appendChild(btnShadowLabel);
        mapControls.appendChild(whiteoutWrapper);
        mapControls.appendChild(setbackWrapper);
        mapControls.appendChild(measureWrapper);
        mapControls.appendChild(labeledLineWrapper);
    }

    // Event: Setback Tool button toggle popup
    btnSetbackTool.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = setbackPopup.classList.contains('visible');
        closeAllPopups();
        if (typeof isWhiteoutMode !== 'undefined' && isWhiteoutMode) setWhiteoutMode(false);
        if (!isVisible) {
            setbackPopup.classList.add('visible');
            btnSetbackTool.classList.add('active');
            // Sync checkbox with current state
            const toggle = document.getElementById('popup-setback-toggle');
            const distInput = document.getElementById('popup-setback-distance');
            if (toggle) toggle.checked = showSetback;
            if (distInput) distInput.value = setbackDistance;
        }
    });

    // Event: Snap toggle
    btnSnapMode.addEventListener('click', () => {
        isSnapMode = !isSnapMode;
        btnSnapMode.classList.toggle('active', isSnapMode);
        btnSnapMode.setAttribute('aria-pressed', String(isSnapMode));
        try {
            localStorage.setItem('snapMode', String(isSnapMode));
        } catch (e) { }
    });

    // Event: Square property
    btnSquareProperty.addEventListener('click', () => {
        if (!currentCorners || currentCorners.length !== 4) return;
        squareBoundaryToRectangle();
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        queueShedClearancesUpdate();
    });

    // Event: SHED Tool button toggle popup
    btnShedTool.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = shedPopup.classList.contains('visible');
        closeAllPopups();
        if (typeof isWhiteoutMode !== 'undefined' && isWhiteoutMode) setWhiteoutMode(false);
        if (!isVisible) {
            shedPopup.classList.add('visible');
            btnShedTool.classList.add('active');
            updateShedPopupState();
        }
    });

    // Event: HOUSE Tool button toggle popup
    btnHouseTool.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = housePopup.classList.contains('visible');
        closeAllPopups();
        if (typeof isWhiteoutMode !== 'undefined' && isWhiteoutMode) setWhiteoutMode(false);
        if (!isVisible) {
            housePopup.classList.add('visible');
            btnHouseTool.classList.add('active');
            updateHousePopupState();
        }
    });

    // Event: Shadow label toggle
    btnShadowLabel.addEventListener('click', () => {
        if (typeof isWhiteoutMode !== 'undefined' && isWhiteoutMode) setWhiteoutMode(false);
        setReferenceLineMode(false); // Exit reference line mode
        isShadowLabelMode = !isShadowLabelMode;
        btnShadowLabel.classList.toggle('active', isShadowLabelMode);
        btnShadowLabel.setAttribute('aria-pressed', String(isShadowLabelMode));
        if (currentCorners) drawBoundary(currentCorners);
    });



    // Popups now close only when clicking blank area of the map (handled in canvas mousedown)

    // Popup interactions (deferred to after functions are defined)
    document.addEventListener('DOMContentLoaded', () => {
        // Shed popup actions
        document.getElementById('popup-add-shed')?.addEventListener('click', () => {
            popupShedW = parseFloat(document.getElementById('popup-shed-w')?.value) || 12;
            popupShedH = parseFloat(document.getElementById('popup-shed-h')?.value) || 10;
            const structureType = document.getElementById('popup-structure-type')?.value || 'shed';
            addShedFromPopup(structureType);
            updateShedPopupState();
            updateStructuresListUI();
        });
        document.getElementById('popup-square-shed')?.addEventListener('click', () => {
            if (currentShed && currentCorners) squareShedToFenceLines();
        });
        document.getElementById('popup-remove-shed')?.addEventListener('click', () => {
            captureUndoState();
            if (selectedStructureIndex >= 0 && selectedStructureIndex < structures.length) {
                structures.splice(selectedStructureIndex, 1);
                selectedStructureIndex = structures.length > 0 ? 0 : -1;
                syncCurrentShed();
            } else {
                // Fallback: remove all structures
                structures = [];
                selectedStructureIndex = -1;
                currentShed = null;
            }
            updateShedPopupState();
            updateStructuresListUI();
            queueShedClearancesUpdate();
            if (currentCorners) drawBoundary(currentCorners);
        });

        // Shed distance line toggle event handlers
        document.getElementById('toggle-shed-lines-master')?.addEventListener('change', (e) => {
            showShedDistanceLines = e.target.checked;
            const indivContainer = document.getElementById('shed-lines-individual');
            if (indivContainer) indivContainer.style.opacity = showShedDistanceLines ? '1' : '0.5';
            if (currentCorners) drawBoundary(currentCorners);
        });

        // Map checkbox IDs to clearance labels
        const shedLineToggles = [
            { id: 'toggle-shed-line-1', label: 'Line 1' },
            { id: 'toggle-shed-line-2', label: 'Line 2' },
            { id: 'toggle-shed-line-3', label: 'Line 3' },
            { id: 'toggle-shed-line-4', label: 'Line 4' },
            { id: 'toggle-shed-line-house', label: 'House' },
        ];

        for (const toggle of shedLineToggles) {
            document.getElementById(toggle.id)?.addEventListener('change', (e) => {
                setShedClearanceIncluded(toggle.label, e.target.checked);
                if (currentCorners) drawBoundary(currentCorners);
            });
        }

        // House popup actions
        document.getElementById('popup-select-house')?.addEventListener('click', () => {
            popupHouseW = parseFloat(document.getElementById('popup-house-w')?.value) || 40;
            popupHouseH = parseFloat(document.getElementById('popup-house-h')?.value) || 30;
            setHouseSelectMode(true);
            closeAllPopups();
        });
        document.getElementById('popup-remove-house')?.addEventListener('click', () => {
            captureUndoState();
            currentHouse = null;
            setHouseSelectMode(false);
            updateHousePopupState();
            queueShedClearancesUpdate();
            if (currentCorners) drawBoundary(currentCorners);
        });
        const applyFromHouseInputs = () => applyHouseSizeFromPopupInputs();
        document.getElementById('popup-house-w')?.addEventListener('input', applyFromHouseInputs);
        document.getElementById('popup-house-h')?.addEventListener('input', applyFromHouseInputs);
        document.getElementById('popup-house-w')?.addEventListener('change', applyFromHouseInputs);
        document.getElementById('popup-house-h')?.addEventListener('change', applyFromHouseInputs);

        // Setback popup actions
        document.getElementById('popup-setback-toggle')?.addEventListener('change', (e) => {
            showSetback = e.target.checked;
            if (currentCorners) drawBoundary(currentCorners);
        });
        document.getElementById('popup-setback-distance')?.addEventListener('change', (e) => {
            setbackDistance = parseFloat(e.target.value) || 5;
            if (currentCorners && showSetback) drawBoundary(currentCorners);
        });

        // Measure Tool button toggle popup
        window.btnMeasureToolRef?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = window.measurePopupRef.classList.contains('visible');
            closeAllPopups();
            if (typeof isWhiteoutMode !== 'undefined' && isWhiteoutMode) setWhiteoutMode(false);
            if (!isVisible) {
                window.measurePopupRef.classList.add('visible');
                window.btnMeasureToolRef.classList.add('active');
                // Sync inputs with current measurements (dynamically creates inputs for all sides)
                syncMeasurePopupWithCorners();
            }
        });

        // Whiteout Tool button toggle popup
        window.btnWhiteoutToolRef?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = window.whiteoutPopupRef.classList.contains('visible');
            closeAllPopups();
            if (!isVisible) {
                window.whiteoutPopupRef.classList.add('visible');
                window.btnWhiteoutToolRef.classList.add('active');
                setWhiteoutMode(true);
            } else {
                setWhiteoutMode(false);
            }
        });

        // Clear whiteout button
        document.getElementById('popup-clear-whiteout')?.addEventListener('click', () => {
            clearWhiteoutRegions();
        });

        // Pick color button
        document.getElementById('popup-pick-color')?.addEventListener('click', () => {
            isPickingWhiteoutColor = true;
            const btn = document.getElementById('popup-pick-color');
            if (btn) {
                btn.textContent = '🎯 Click map...';
                btn.classList.add('active');
            }
            overlayCanvas.style.cursor = 'crosshair';
        });

        // Labeled Line Tool button toggle popup
        window.btnLabeledLineToolRef?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = window.labeledLinePopupRef.classList.contains('visible');
            closeAllPopups();
            if (typeof isWhiteoutMode !== 'undefined' && isWhiteoutMode) setWhiteoutMode(false);
            if (!isVisible) {
                window.labeledLinePopupRef.classList.add('visible');
                window.btnLabeledLineToolRef.classList.add('active');
                updateLabeledLinesListUI();
            }
        });

        // Draw labeled line button
        document.getElementById('popup-draw-labeled-line')?.addEventListener('click', () => {
            const input = document.getElementById('labeled-line-input');
            pendingLabeledLineLabel = input?.value?.trim() || 'Line';
            setLabeledLineMode(true);
            closeAllPopups();
        });
    });
}

// Helper: Set labeled line drawing mode
function setLabeledLineMode(enabled) {
    isDrawingLabeledLine = Boolean(enabled);
    labeledLineStartPoint = null;
    labeledLineCurrentPoint = null;
    if (overlayCanvas) {
        overlayCanvas.style.cursor = isDrawingLabeledLine ? 'crosshair' : '';
    }
    if (btnLabeledLineTool) {
        btnLabeledLineTool.classList.toggle('active', isDrawingLabeledLine);
    }
}

// Helper: Update the list of labeled lines in the popup
function updateLabeledLinesListUI() {
    const list = document.getElementById('labeled-lines-list');
    if (!list) return;

    if (customLabeledLines.length === 0) {
        list.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0;">No lines drawn yet.</p>';
        return;
    }

    list.innerHTML = '';
    customLabeledLines.forEach((line, index) => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.1);';

        const label = document.createElement('span');
        label.style.cssText = 'font-size: 0.75rem; color: var(--text-primary);';
        label.textContent = line.label || `Line ${index + 1}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.style.cssText = 'background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.75rem; padding: 2px 6px;';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete line';
        deleteBtn.addEventListener('click', () => {
            captureUndoState();
            customLabeledLines.splice(index, 1);
            updateLabeledLinesListUI();
            if (currentCorners) drawBoundary(currentCorners);
        });

        item.appendChild(label);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    });
}

// Sync measure popup inputs with current corner measurements
function syncMeasurePopupWithCorners() {
    const grid = document.getElementById('measure-popup-grid');
    if (!grid || !currentCorners || currentCorners.length < 3 || !currentLatitude) return;

    const feetPerPixel = getFeetPerPixel(currentLatitude);

    // Calculate all side distances
    const sides = [];
    for (let i = 0; i < currentCorners.length; i++) {
        const j = (i + 1) % currentCorners.length;
        sides.push(calculateDistance(currentCorners[i], currentCorners[j], feetPerPixel));
    }

    // Generate labels based on number of corners
    const labels = sides.map((_, i) => `Line ${i + 1}`);

    // Clear and rebuild the grid
    grid.innerHTML = '';

    sides.forEach((distance, index) => {
        const row = document.createElement('div');
        row.className = 'measure-popup-row';
        row.innerHTML = `
            <label>${labels[index]}</label>
            <input type="number" id="popup-measure-side-${index}" value="${distance.toFixed(1)}" step="0.5" min="1">
            <span>ft</span>
        `;
        grid.appendChild(row);

        // Attach change listener
        const input = row.querySelector('input');
        input.addEventListener('change', (e) => {
            const newFeet = parseFloat(e.target.value);
            if (isNaN(newFeet) || newFeet <= 0 || !currentCorners) return;
            const fpp = getFeetPerPixel(currentLatitude);
            updateSideLength(index, newFeet, fpp);
        });
    });
}

// Update shed popup button visibility
function updateShedPopupState() {
    const addBtn = document.getElementById('popup-add-shed');
    const squareBtn = document.getElementById('popup-square-shed');
    const removeBtn = document.getElementById('popup-remove-shed');
    const togglesSection = document.getElementById('shed-distance-toggles');

    const hasStructures = structures.length > 0;
    const hasSelectedStructure = selectedStructureIndex >= 0 && selectedStructureIndex < structures.length;

    // Always show add button (can add multiple structures)
    if (addBtn) addBtn.style.display = 'block';
    if (addBtn) addBtn.textContent = hasStructures ? 'Add Another' : 'Add Structure';

    // Show square and remove only when a structure is selected
    if (squareBtn) squareBtn.style.display = hasSelectedStructure ? 'block' : 'none';
    if (removeBtn) removeBtn.style.display = hasSelectedStructure ? 'block' : 'none';

    if (hasStructures && togglesSection) {
        togglesSection.style.display = 'block';
        // Sync checkbox states with current values
        const masterToggle = document.getElementById('toggle-shed-lines-master');
        if (masterToggle) masterToggle.checked = showShedDistanceLines;

        const indivContainer = document.getElementById('shed-lines-individual');
        if (indivContainer) indivContainer.style.opacity = showShedDistanceLines ? '1' : '0.5';

        // Sync individual toggles
        const line1Toggle = document.getElementById('toggle-shed-line-1');
        if (line1Toggle) line1Toggle.checked = isShedClearanceIncluded('Line 1');

        const line2Toggle = document.getElementById('toggle-shed-line-2');
        if (line2Toggle) line2Toggle.checked = isShedClearanceIncluded('Line 2');

        const line3Toggle = document.getElementById('toggle-shed-line-3');
        if (line3Toggle) line3Toggle.checked = isShedClearanceIncluded('Line 3');

        const line4Toggle = document.getElementById('toggle-shed-line-4');
        if (line4Toggle) line4Toggle.checked = isShedClearanceIncluded('Line 4');

        const houseToggle = document.getElementById('toggle-shed-line-house');
        if (houseToggle) houseToggle.checked = isShedClearanceIncluded('House');
    } else if (togglesSection) {
        togglesSection.style.display = 'none';
    }
}

// Update structures list UI in the popup
function updateStructuresListUI() {
    const listContainer = document.getElementById('structures-list');
    if (!listContainer) return;

    if (structures.length === 0) {
        listContainer.innerHTML = '';
        return;
    }

    const typeLabels = {
        'shed': 'Shed',
        'garage': 'Garage',
        'pool': 'Pool',
        'patio': 'Patio',
        'other': 'Structure'
    };

    listContainer.innerHTML = structures.map((s, i) => {
        const typeName = typeLabels[s.type] || 'Structure';
        const isSelected = i === selectedStructureIndex;
        const ft = currentLatitude ? getFeetPerPixel(currentLatitude) : 0.29858 * 3.28084 / Math.cos(0);
        const wFt = Math.round(s.width * ft);
        const hFt = Math.round(s.height * ft);
        return `
            <div class="structure-list-item ${isSelected ? 'selected' : ''}" data-index="${i}">
                <span class="structure-name">${typeName} (${wFt}×${hFt}ft)</span>
                <button class="structure-delete-btn" data-index="${i}" title="Delete">✕</button>
            </div>
        `;
    }).join('');

    // Add click handlers for selection
    listContainer.querySelectorAll('.structure-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('structure-delete-btn')) return;
            const idx = parseInt(item.dataset.index);
            if (!isNaN(idx)) {
                selectedStructureIndex = idx;
                syncCurrentShed();
                updateStructuresListUI();
                updateShedPopupState();
                drawBoundary(currentCorners);
            }
        });
    });

    // Add click handlers for delete buttons
    listContainer.querySelectorAll('.structure-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            if (!isNaN(idx) && idx >= 0 && idx < structures.length) {
                captureUndoState();
                structures.splice(idx, 1);
                if (selectedStructureIndex >= structures.length) {
                    selectedStructureIndex = structures.length - 1;
                }
                syncCurrentShed();
                updateStructuresListUI();
                updateShedPopupState();
                queueShedClearancesUpdate();
                drawBoundary(currentCorners);
            }
        });
    });
}

// Update house popup button visibility
function updateHousePopupState() {
    const selectBtn = document.getElementById('popup-select-house');
    const removeBtn = document.getElementById('popup-remove-house');
    if (currentHouse) {
        if (selectBtn) selectBtn.textContent = 'Reselect';
        if (removeBtn) removeBtn.style.display = 'block';
    } else {
        if (selectBtn) selectBtn.textContent = 'Select on Map';
        if (removeBtn) removeBtn.style.display = 'none';
    }

    // Updated Ref Line logic
    const refDrawBtn = document.getElementById('popup-draw-ref-line');
    const refRemoveBtn = document.getElementById('popup-remove-ref-line');
    if (customReferenceLine) {
        if (refDrawBtn) refDrawBtn.textContent = 'Redraw Distance Line';
        if (refRemoveBtn) refRemoveBtn.style.display = 'block';
    } else {
        if (refDrawBtn) refDrawBtn.textContent = '📏 Draw Distance Line';
        if (refRemoveBtn) refRemoveBtn.style.display = 'none';
    }
}

// Add structure using popup values
function addShedFromPopup(type = 'shed') {
    if (!currentLatitude) return;
    const feetPerPixel = getFeetPerPixel(currentLatitude);

    const widthPixels = popupShedW / feetPerPixel;
    const heightPixels = popupShedH / feetPerPixel;

    // Get label based on type
    const typeLabels = {
        'shed': 'PROPOSED SHED',
        'garage': 'GARAGE',
        'pool': 'POOL',
        'patio': 'PATIO',
        'other': 'STRUCTURE'
    };

    captureUndoState();

    const newStructure = {
        id: Date.now(),
        type: type,
        x: IMAGE_SIZE / 2,
        y: IMAGE_SIZE / 2,
        width: widthPixels,
        height: heightPixels,
        rotation: 0,
        label: typeLabels[type] || 'STRUCTURE'
    };

    structures.push(newStructure);
    selectedStructureIndex = structures.length - 1;
    syncCurrentShed();

    queueShedClearancesUpdate();
    drawBoundary(currentCorners);
    updateShedPopupState();
}

/* AI house detection removed (manual selection only).
function showHouseAIDebugModal(dataUrl, meta) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.82);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
        background: #111827;
        border-radius: 12px;
        padding: 1rem;
        max-width: 820px;
        width: 100%;
        max-height: 86vh;
        overflow: auto;
        border: 1px solid rgba(255,255,255,0.12);
        color: #e5e7eb;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap: 1rem; margin-bottom: 0.75rem;';

    const title = document.createElement('div');
    title.textContent = 'House AI Debug (image sent to Gemini)';
    title.style.cssText = 'font-weight: 700;';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.06);
        color: #e5e7eb;
        cursor: pointer;
        font-family: inherit;
    `;

    const pre = document.createElement('pre');
    pre.textContent = meta ? JSON.stringify(meta, null, 2) : '';
    pre.style.cssText = `
        margin: 0 0 0.75rem;
        padding: 0.75rem;
        border-radius: 10px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 12px;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;
    `;
    pre.style.display = pre.textContent ? 'block' : 'none';

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'House AI Debug';
    img.style.cssText = `
        width: 100%;
        height: auto;
        display: block;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
    `;

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(pre);
    panel.appendChild(img);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    const cleanup = () => modal.remove();
    closeBtn.addEventListener('click', cleanup);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cleanup();
    });

    return {
        update: (nextDataUrl, nextMeta) => {
            if (nextDataUrl) img.src = nextDataUrl;
            if (nextMeta !== undefined) {
                try {
                    pre.textContent = nextMeta ? JSON.stringify(nextMeta, null, 2) : '';
                } catch (e) {
                    pre.textContent = String(nextMeta || '');
                }
                pre.style.display = pre.textContent ? 'block' : 'none';
            }
        },
        close: cleanup
    };
}

async function detectHouseWithAI() {
    if (!satelliteImg.src || !satelliteImg.complete) {
        alert('Please load a satellite image first!');
        return;
    }

    const detectBtn = document.getElementById('popup-auto-detect-house');
    const originalText = detectBtn?.textContent || '🤖 Auto-detect';

    try {
        // Sync latest user-entered house size (feet)
        popupHouseW = parseFloat(document.getElementById('popup-house-w')?.value) || popupHouseW || 40;
        popupHouseH = parseFloat(document.getElementById('popup-house-h')?.value) || popupHouseH || 30;
        let debugModal = null;

        if (detectBtn) {
            detectBtn.textContent = '⏳ Detecting...';
            detectBtn.disabled = true;
        }

        // Build an AI-friendly image:
        // - Use the full-resolution image (scale=2 => typically 1280x1280) for more detail
        // - Crop around the property boundary (plus padding) to reduce distractions
        // - Darken everything OUTSIDE the boundary so the model focuses on the property
        const sourceW = satelliteImg.naturalWidth || IMAGE_SIZE;
        const sourceH = satelliteImg.naturalHeight || IMAGE_SIZE;
        const toSourceScaleX = sourceW / IMAGE_SIZE;
        const toSourceScaleY = sourceH / IMAGE_SIZE;

        const hasBoundary = Boolean(currentCorners && currentCorners.length >= 3);
        const boundarySrc = hasBoundary
            ? currentCorners.map((c) => ({ x: c.x * toSourceScaleX, y: c.y * toSourceScaleY }))
            : null;

        let cropX = 0;
        let cropY = 0;
        let cropW = sourceW;
        let cropH = sourceH;

        if (boundarySrc) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const c of boundarySrc) {
                minX = Math.min(minX, c.x);
                minY = Math.min(minY, c.y);
                maxX = Math.max(maxX, c.x);
                maxY = Math.max(maxY, c.y);
            }

            const spanW = Math.max(1, maxX - minX);
            const spanH = Math.max(1, maxY - minY);
            const pad = Math.round(Math.max(24, Math.min(160, 0.06 * Math.max(spanW, spanH))));

            const x1 = clamp(Math.floor(minX - pad), 0, sourceW);
            const y1 = clamp(Math.floor(minY - pad), 0, sourceH);
            const x2 = clamp(Math.ceil(maxX + pad), 0, sourceW);
            const y2 = clamp(Math.ceil(maxY + pad), 0, sourceH);

            cropX = x1;
            cropY = y1;
            cropW = Math.max(64, x2 - x1);
            cropH = Math.max(64, y2 - y1);
        }

        console.log('AI house detection crop:', { sourceW, sourceH, cropX, cropY, cropW, cropH });

        const aiCanvas = document.createElement('canvas');
        aiCanvas.width = cropW;
        aiCanvas.height = cropH;
        const aiCtx = aiCanvas.getContext('2d');
        aiCtx.drawImage(satelliteImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        if (boundarySrc) {
            const boundaryCrop = boundarySrc.map((p) => ({ x: p.x - cropX, y: p.y - cropY }));

            // Dark overlay that is transparent inside the boundary polygon.
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = cropW;
            maskCanvas.height = cropH;
            const maskCtx = maskCanvas.getContext('2d');
            maskCtx.fillStyle = 'rgba(0,0,0,0.60)';
            maskCtx.fillRect(0, 0, cropW, cropH);
            maskCtx.globalCompositeOperation = 'destination-out';
            maskCtx.beginPath();
            maskCtx.moveTo(boundaryCrop[0].x, boundaryCrop[0].y);
            for (let i = 1; i < boundaryCrop.length; i++) {
                maskCtx.lineTo(boundaryCrop[i].x, boundaryCrop[i].y);
            }
            maskCtx.closePath();
            maskCtx.fill();
            aiCtx.drawImage(maskCanvas, 0, 0);

            // Boundary outline (blue) for additional clarity.
            aiCtx.save();
            aiCtx.beginPath();
            aiCtx.moveTo(boundaryCrop[0].x, boundaryCrop[0].y);
            for (let i = 1; i < boundaryCrop.length; i++) {
                aiCtx.lineTo(boundaryCrop[i].x, boundaryCrop[i].y);
            }
            aiCtx.closePath();
            aiCtx.strokeStyle = 'rgba(99, 102, 241, 0.95)';
            aiCtx.lineWidth = 4;
            aiCtx.stroke();
            aiCtx.restore();
        }

        const aiMimeType = 'image/jpeg';
        const aiDataUrl = aiCanvas.toDataURL(aiMimeType, 0.86);
        const imageBase64 = aiDataUrl.split(',')[1];

        // Debug: set `localStorage.debugHouseAI = "1"` to preview the exact image sent to Gemini.
        try {
            window.__lastHouseDetect = { sourceW, sourceH, cropX, cropY, cropW, cropH, aiMimeType };
            if (localStorage.getItem('debugHouseAI') === '1') {
                debugModal = showHouseAIDebugModal(aiDataUrl, window.__lastHouseDetect);
            }
        } catch (e) { }

        let result;
        const localGeminiKey = localStorage.getItem('geminiKey');

        // Use local key or Netlify function
        if (isLocalhost && localGeminiKey) {
            const geminiHouseModel = (localStorage.getItem('geminiHouseModel') || 'gemini-2.0-flash').trim();
            console.log('Using Local Gemini API Key for house detection', { model: geminiHouseModel });
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiHouseModel)}:generateContent?key=${localGeminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                {
                                    text: (hasBoundary
                                        ? `Analyze this satellite/aerial image of a property. The area OUTSIDE the property is DARKENED, and the boundary is outlined in BLUE. Find the MAIN HOUSE (largest residential building) INSIDE the undarkened area.
Return a TIGHT bounding box around the house roof/footprint only (exclude driveways, yards, and neighboring structures).`
                                        : `Analyze this satellite/aerial image of a property. Find the MAIN HOUSE (largest residential building) in the image.
Return a TIGHT bounding box around the house roof/footprint only (exclude driveways, yards, and neighboring structures).`) + `

Return ONLY a JSON object with the bounding box coordinates as decimal values from 0 to 1, where (0,0) is top-left and (1,1) is bottom-right:
{"x1": 0.XX, "y1": 0.XX, "x2": 0.XX, "y2": 0.XX, "confidence": 0.XX}

x1,y1 = top-left corner of house
x2,y2 = bottom-right corner of house
confidence = how confident you are (0-1)

If no house is found (or none is inside the undarkened area), return: {"error": "No house detected"}

IMPORTANT: Return ONLY the JSON, no other text.`
                                },
                                {
                                    inline_data: {
                                        mime_type: aiMimeType,
                                        data: imageBase64
                                    }
                                }
                            ]
                        }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 200
                        }
                    })
                }
            );

            if (!response.ok) throw new Error('Failed to detect house');
            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Could not parse AI response');
            result = JSON.parse(jsonMatch[0]);
        } else {
            // Use Netlify function
            const response = await fetch('/.netlify/functions/detect-house', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64, mimeType: aiMimeType })
            });

            if (!response.ok) throw new Error('Failed to detect house');
            result = await response.json();
        }

        console.log('AI house detection raw result:', result);

        if (result.error) {
            alert(result.error);
            return;
        }

        const toNumber = (value) => (typeof value === 'number' ? value : Number.parseFloat(String(value)));
        const rawX1 = toNumber(result.x1);
        const rawY1 = toNumber(result.y1);
        const rawX2 = toNumber(result.x2);
        const rawY2 = toNumber(result.y2);
        if (![rawX1, rawY1, rawX2, rawY2].every(Number.isFinite)) {
            throw new Error('Invalid AI response (missing x1,y1,x2,y2)');
        }

        const nx1 = clamp(rawX1, 0, 1);
        const ny1 = clamp(rawY1, 0, 1);
        const nx2 = clamp(rawX2, 0, 1);
        const ny2 = clamp(rawY2, 0, 1);

        // Convert normalized coords (0-1) from the AI crop back into IMAGE_SIZE-space.
        const ax1 = nx1 * cropW + cropX;
        const ay1 = ny1 * cropH + cropY;
        const ax2 = nx2 * cropW + cropX;
        const ay2 = ny2 * cropH + cropY;

        const sx1 = Math.min(ax1, ax2);
        const sy1 = Math.min(ay1, ay2);
        const sx2 = Math.max(ax1, ax2);
        const sy2 = Math.max(ay1, ay2);

        const x1 = clamp(sx1 / toSourceScaleX, 0, IMAGE_SIZE);
        const y1 = clamp(sy1 / toSourceScaleY, 0, IMAGE_SIZE);
        const x2 = clamp(sx2 / toSourceScaleX, 0, IMAGE_SIZE);
        const y2 = clamp(sy2 / toSourceScaleY, 0, IMAGE_SIZE);

        if (debugModal) {
            try {
                const rx1 = Math.min(nx1, nx2) * cropW;
                const ry1 = Math.min(ny1, ny2) * cropH;
                const rx2 = Math.max(nx1, nx2) * cropW;
                const ry2 = Math.max(ny1, ny2) * cropH;

                const dbgCanvas = document.createElement('canvas');
                dbgCanvas.width = aiCanvas.width;
                dbgCanvas.height = aiCanvas.height;
                const dbgCtx = dbgCanvas.getContext('2d');
                dbgCtx.drawImage(aiCanvas, 0, 0);
                dbgCtx.fillStyle = 'rgba(239, 68, 68, 0.12)';
                dbgCtx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
                dbgCtx.lineWidth = 4;
                dbgCtx.fillRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
                dbgCtx.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1);

                const dbgUrl = dbgCanvas.toDataURL(aiMimeType, 0.86);
                const debugInfo = {
                    ...window.__lastHouseDetect,
                    aiResponse: result,
                    boxNormalized: { x1: nx1, y1: ny1, x2: nx2, y2: ny2 },
                    boxCropPx: { x1: rx1, y1: ry1, x2: rx2, y2: ry2 },
                    boxImagePx: { x1, y1, x2, y2 }
                };
                window.__lastHouseDetect = debugInfo;
                debugModal.update(dbgUrl, debugInfo);
            } catch (e) { }
        }

        const aiWidth = Math.abs(x2 - x1);
        const aiHeight = Math.abs(y2 - y1);
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;

        if (currentCorners && currentCorners.length >= 3) {
            const inside = isPointInPolygon({ x: centerX, y: centerY }, currentCorners);
            if (!inside) {
                throw new Error('AI detected a building outside the boundary. Try again or use Reselect.');
            }
        }

        // Size strategy:
        // - Start with the AI bbox size
        // - If it looks implausible vs user-entered size, fall back to user size (feet -> pixels)
        // - If the AI box shape is very different from the user's aspect ratio, "rectify" it by
        //   preserving AI area but matching the user aspect ratio (helps when Gemini returns a tall
        //   skinny box on a wide house, or vice versa)
        let width = aiWidth;
        let height = aiHeight;
        let sizeSource = 'ai';

        if (currentLatitude) {
            const feetPerPixel = getFeetPerPixel(currentLatitude);
            const userWFeet = popupHouseW || 40;
            const userHFeet = popupHouseH || 30;
            const expectedW = userWFeet / feetPerPixel;
            const expectedH = userHFeet / feetPerPixel;
            const expectedAR = (expectedH > 0) ? (expectedW / expectedH) : null;

            const ar = (aiHeight > 0) ? (aiWidth / aiHeight) : Infinity;
            const aiSane = Number.isFinite(ar) && aiWidth >= 10 && aiHeight >= 10 && ar >= 0.35 && ar <= 3.0;

            const minW = expectedW * 0.4;
            const maxW = expectedW * 3.0;
            const minH = expectedH * 0.4;
            const maxH = expectedH * 3.0;

            if (!aiSane || aiWidth < minW || aiWidth > maxW || aiHeight < minH || aiHeight > maxH) {
                width = expectedW;
                height = expectedH;
                sizeSource = 'user';
            } else {
                // Shape rectify: keep area but match the user's aspect ratio if the model's box is
                // wildly different (common failure mode with aerial imagery).
                if (Number.isFinite(expectedAR) && expectedAR > 0) {
                    const ratioDiff = Math.max(ar / expectedAR, expectedAR / ar);
                    if (Number.isFinite(ratioDiff) && ratioDiff >= 1.6) {
                        const area = aiWidth * aiHeight;
                        const rectW = Math.sqrt(area * expectedAR);
                        const rectH = area / rectW;
                        if (Number.isFinite(rectW) && Number.isFinite(rectH) && rectW > 0 && rectH > 0) {
                            const rectFits =
                                rectW >= minW && rectW <= maxW &&
                                rectH >= minH && rectH <= maxH;
                            if (rectFits) {
                                width = rectW;
                                height = rectH;
                                sizeSource = 'ai-adjusted';
                            }
                        }
                    }
                }

                // If the user left the defaults, adopt the AI size into the inputs so UI + box match.
                const isDefault = Math.abs(userWFeet - 40) < 1e-6 && Math.abs(userHFeet - 30) < 1e-6;
                if (isDefault && sizeSource === 'ai') {
                    const aiWFeet = Math.max(1, Math.round(width * feetPerPixel));
                    const aiHFeet = Math.max(1, Math.round(height * feetPerPixel));
                    popupHouseW = aiWFeet;
                    popupHouseH = aiHFeet;
                    const wEl = document.getElementById('popup-house-w');
                    const hEl = document.getElementById('popup-house-h');
                    if (wEl) wEl.value = String(aiWFeet);
                    if (hEl) hEl.value = String(aiHFeet);
                }
            }
        }

        // Small expansion to better cover roof overhangs / attached structures.
        // Tune with `localStorage.houseDetectPad = "0.12"` (fractional, e.g. 0.08–0.25).
        let padFrac = 0.12;
        try {
            const raw = localStorage.getItem('houseDetectPad');
            if (raw != null) {
                const v = Number.parseFloat(String(raw));
                if (Number.isFinite(v)) padFrac = v;
            }
        } catch (e) { }
        padFrac = clamp(padFrac, 0, 0.4);
        if (padFrac > 0) {
            width *= (1 + padFrac);
            height *= (1 + padFrac);
        }

        const rotation = 0;

        if (debugModal) {
            try {
                const fx1 = clamp(centerX - width / 2, 0, IMAGE_SIZE);
                const fy1 = clamp(centerY - height / 2, 0, IMAGE_SIZE);
                const fx2 = clamp(centerX + width / 2, 0, IMAGE_SIZE);
                const fy2 = clamp(centerY + height / 2, 0, IMAGE_SIZE);

                const rx1 = (fx1 * toSourceScaleX) - cropX;
                const ry1 = (fy1 * toSourceScaleY) - cropY;
                const rx2 = (fx2 * toSourceScaleX) - cropX;
                const ry2 = (fy2 * toSourceScaleY) - cropY;

                const dbgCanvas = document.createElement('canvas');
                dbgCanvas.width = aiCanvas.width;
                dbgCanvas.height = aiCanvas.height;
                const dbgCtx = dbgCanvas.getContext('2d');
                dbgCtx.drawImage(aiCanvas, 0, 0);

                // AI box (red)
                const aiRx1 = Math.min(nx1, nx2) * cropW;
                const aiRy1 = Math.min(ny1, ny2) * cropH;
                const aiRx2 = Math.max(nx1, nx2) * cropW;
                const aiRy2 = Math.max(ny1, ny2) * cropH;
                dbgCtx.fillStyle = 'rgba(239, 68, 68, 0.12)';
                dbgCtx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
                dbgCtx.lineWidth = 4;
                dbgCtx.fillRect(aiRx1, aiRy1, aiRx2 - aiRx1, aiRy2 - aiRy1);
                dbgCtx.strokeRect(aiRx1, aiRy1, aiRx2 - aiRx1, aiRy2 - aiRy1);

                // Final rect used (green)
                dbgCtx.fillStyle = 'rgba(34, 197, 94, 0.08)';
                dbgCtx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
                dbgCtx.lineWidth = 4;
                dbgCtx.fillRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
                dbgCtx.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1);

                const dbgUrl = dbgCanvas.toDataURL(aiMimeType, 0.86);
                const finalDebugInfo = {
                    ...window.__lastHouseDetect,
                    sizeSource,
                    padFrac,
                    finalRect: { x: centerX, y: centerY, width, height, rotation }
                };
                window.__lastHouseDetect = finalDebugInfo;
                debugModal.update(dbgUrl, finalDebugInfo);
            } catch (e) { }
        }

        // Create house rectangle
        currentHouse = {
            x: centerX,
            y: centerY,
            width: width,
            height: height,
            rotation
        };

        updateHousePopupState();
        queueShedClearancesUpdate();
        if (currentCorners) drawBoundary(currentCorners);

        console.log(`House detected at center (${centerX.toFixed(0)}, ${centerY.toFixed(0)}) size ${width.toFixed(0)}x${height.toFixed(0)} (${sizeSource}) aiBox ${aiWidth.toFixed(0)}x${aiHeight.toFixed(0)} confidence: ${result.confidence}`);

    } catch (error) {
        console.error('House detection error:', error);
        alert('Failed to detect house: ' + error.message);
    } finally {
        if (detectBtn) {
            detectBtn.textContent = originalText;
            detectBtn.disabled = false;
        }
    }
}
*/
// Helper to calculate distance between two fingers
function getPinchDistance(e) {
    if (e.touches.length < 2) return 0;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper to update transform (pan, zoom, rotation)
function updateScaleTransform() {
    // Get the container dimensions for center-based rotation
    const container = mapWrapper.parentElement;
    const cx = container ? container.clientWidth / 2 : 0;
    const cy = container ? container.clientHeight / 2 : 0;
    // Rotate around center by translating to center, rotating, then translating back
    const rotDeg = (mapRotation * 180) / Math.PI;
    mapWrapper.style.transform = `translate(${panX}px, ${panY}px) translate(${cx}px, ${cy}px) rotate(${rotDeg}deg) translate(${-cx}px, ${-cy}px) scale(${scale})`;
}

// Helper to snap position to align with other corners (Smart Rotated Grid)
function applySnap(pos, corners, skipIndex, screenThreshold = 20) {
    // 1. Adjust threshold based on zoom scale for consistent feel
    const threshold = screenThreshold / scale;

    // 2. Find the reference angle (longest fixed edge)
    let maxDist = 0;
    let refAngle = 0;
    let foundRef = false;

    for (let i = 0; i < corners.length; i++) {
        // Skip edges connected to the moving point (to avoid rotation loops)
        const p1Idx = i;
        const p2Idx = (i + 1) % corners.length;
        if (p1Idx === skipIndex || p2Idx === skipIndex) continue;

        const p1 = corners[p1Idx];
        const p2 = corners[p2Idx];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = dx * dx + dy * dy;

        if (dist > maxDist) {
            maxDist = dist;
            refAngle = Math.atan2(dy, dx);
            foundRef = true;
        }
    }

    // If no stable edge found (e.g. triangle or starting out), default to 0 (Global Grid)
    if (!foundRef) refAngle = 0;

    // 3. Rotate world to align with reference edge
    // We use a simplified rotation (around origin 0,0) since we only care about relative alignment
    const cos = Math.cos(-refAngle);
    const sin = Math.sin(-refAngle);

    function toLocal(p) {
        return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
    }

    // Inverse rotation
    const cosInv = Math.cos(refAngle);
    const sinInv = Math.sin(refAngle);
    function toGlobal(p) {
        return { x: p.x * cosInv - p.y * sinInv, y: p.x * sinInv + p.y * cosInv };
    }

    const localPos = toLocal(pos);
    let snappedLocal = { x: localPos.x, y: localPos.y };
    let snapX = false;
    let snapY = false;

    // 4. Check alignment in local space
    for (let i = 0; i < corners.length; i++) {
        if (i === skipIndex) continue;
        const localOther = toLocal(corners[i]);

        if (!snapX && Math.abs(localPos.x - localOther.x) < threshold) {
            snappedLocal.x = localOther.x;
            snapX = true;
        }
        if (!snapY && Math.abs(localPos.y - localOther.y) < threshold) {
            snappedLocal.y = localOther.y;
            snapY = true;
        }
        if (snapX && snapY) break;
    }

    // 5. Rotate back
    return toGlobal(snappedLocal);
}

// Address Autocomplete via Netlify Function (API key stays server-side)
let autocompleteTimeout = null;
let autocompleteDropdown = null;

function initAutocomplete() {
    // Create dropdown container - append to body to avoid overflow:hidden clipping
    autocompleteDropdown = document.createElement('div');
    autocompleteDropdown.className = 'autocomplete-dropdown';
    autocompleteDropdown.style.cssText = `
        position: fixed;
        background: var(--bg-secondary, #1a1a2e);
        border: 1px solid var(--border, #333);
        border-radius: 8px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 10000;
        display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(autocompleteDropdown);

    // Listen for input
    addressInput.addEventListener('input', handleAutocompleteInput);

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!addressInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
            autocompleteDropdown.style.display = 'none';
        }
    });

    // Reposition dropdown on scroll/resize
    window.addEventListener('scroll', positionAutocompleteDropdown, true);
    window.addEventListener('resize', positionAutocompleteDropdown);
}

function positionAutocompleteDropdown() {
    if (autocompleteDropdown.style.display === 'none') return;
    const rect = addressInput.getBoundingClientRect();
    autocompleteDropdown.style.top = `${rect.bottom + 4}px`;
    autocompleteDropdown.style.left = `${rect.left}px`;
    autocompleteDropdown.style.width = `${rect.width}px`;
}

async function handleAutocompleteInput(e) {
    const input = e.target.value.trim();

    // Clear previous timeout
    if (autocompleteTimeout) clearTimeout(autocompleteTimeout);

    if (input.length < 3) {
        autocompleteDropdown.style.display = 'none';
        return;
    }

    // Debounce: wait 300ms before fetching
    autocompleteTimeout = setTimeout(async () => {
        try {
            // Netlify Function (only works in production or netlify dev)
            // On localhost 'npx serve', this will fail 404/500, which is fine.
            // We just catch the error and do nothing.
            const response = await fetch('/.netlify/functions/autocomplete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.predictions && data.predictions.length > 0) {
                    showAutocompleteResults(data.predictions);
                } else {
                    autocompleteDropdown.style.display = 'none';
                }
            } else {
                autocompleteDropdown.style.display = 'none';
            }
        } catch (err) {
            // Silence errors on localhost
            autocompleteDropdown.style.display = 'none';
        }
    }, 300);
}

function showAutocompleteResults(predictions) {
    autocompleteDropdown.innerHTML = '';

    predictions.forEach(pred => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            color: #fff;
            font-size: 0.9rem;
        `;
        item.textContent = pred.description;

        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(255,255,255,0.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
            addressInput.value = pred.description;
            autocompleteDropdown.style.display = 'none';
        });

        autocompleteDropdown.appendChild(item);
    });

    positionAutocompleteDropdown();
    autocompleteDropdown.style.display = 'block';
}

// Initialize autocomplete on page load
document.addEventListener('DOMContentLoaded', initAutocomplete);

// Show error
function showError(message) {
    if (message) {
        errorSection.style.display = 'block';
        errorMessage.textContent = message;
    } else {
        errorSection.style.display = 'none';
    }
}

// Localhost Detection
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const devKeyInput = document.getElementById('dev-google-key');
const devSaveBtn = document.getElementById('dev-save-keys');
const devSection = document.getElementById('dev-api-keys');

// Show local key input only on localhost
if (isLocalhost) {
    devSection.style.display = 'block';
    const localKey = localStorage.getItem('googleMapsKey');
    if (localKey) devKeyInput.value = localKey;

    devSaveBtn.addEventListener('click', () => {
        localStorage.setItem('googleMapsKey', devKeyInput.value);
        alert('Local API Keys Saved!');
        location.reload();
    });
}

// Show/hide loading
function setLoading(show, text = 'Processing...') {
    loadingOverlay.style.display = show ? 'flex' : 'none';
    loadingText.textContent = text;
}

// Geocode address
async function geocodeAddress(address) {
    const localKey = localStorage.getItem('googleMapsKey');

    // Direct API call if on localhost and key exists
    if (isLocalhost && localKey) {
        console.log('Using Local API Key for Geocoding');
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${localKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error(data.error_message || `Geocoding failed: ${data.status}`);
        }
        return data.results[0].geometry.location;
    }

    // Default: Use Netlify Function
    const response = await fetch('/.netlify/functions/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Geocoding failed');
    return data;
}

// Get satellite image URL
async function getSatelliteImageUrl(lat, lng) {
    const localKey = localStorage.getItem('googleMapsKey');
    // Use the selected zoom level from dropdown
    currentZoomLevel = getSelectedZoomLevel();
    console.log(`Fetching satellite image at zoom level ${currentZoomLevel}`);

    // Direct API call if on localhost and key exists
    if (isLocalhost && localKey) {
        console.log('Using Local API Key for Satellite Image');
        return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${currentZoomLevel}&size=${IMAGE_SIZE}x${IMAGE_SIZE}&maptype=satellite&scale=2&key=${localKey}`;
    }

    // Default: Use Netlify Function
    const response = await fetch('/.netlify/functions/satellite-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, size: IMAGE_SIZE, zoom: currentZoomLevel })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to get satellite image');
    return data.url;
}

// Calculate feet per pixel at given latitude, accounting for current zoom level
function getFeetPerPixel(latitude) {
    // Meters per pixel varies with latitude due to Mercator projection
    // Also scales with zoom level: each zoom level decrease doubles the meters per pixel
    const zoomScaleFactor = Math.pow(2, 19 - currentZoomLevel);
    const metersPerPixel = METERS_PER_PIXEL_ZOOM_19 * zoomScaleFactor * Math.cos(latitude * Math.PI / 180);
    return metersPerPixel * FEET_PER_METER;
}

// Calculate distance between two points in pixels, then convert to feet
function calculateDistance(p1, p2, feetPerPixel) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    return pixelDistance * feetPerPixel;
}

// Calculate polygon area using Shoelace formula
function calculatePolygonArea(corners, feetPerPixel) {
    let area = 0;
    const n = corners.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += corners[i].x * corners[j].y;
        area -= corners[j].x * corners[i].y;
    }

    area = Math.abs(area) / 2;
    // Convert from square pixels to square feet
    return area * feetPerPixel * feetPerPixel;
}

function getRotatedRectCorners(rect) {
    if (!rect) return [];
    const angle = rect.rotation || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    const local = [
        { x: -halfW, y: halfH },  // front-left (bottom-left)
        { x: halfW, y: halfH },   // front-right (bottom-right)
        { x: halfW, y: -halfH },  // back-right (top-right)
        { x: -halfW, y: -halfH }  // back-left (top-left)
    ];

    return local.map((p) => ({
        x: rect.x + p.x * cos - p.y * sin,
        y: rect.y + p.x * sin + p.y * cos
    }));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function pointSegmentDistance(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const denom = abx * abx + aby * aby;
    if (denom === 0) return Math.hypot(apx, apy);
    const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    return Math.hypot(p.x - cx, p.y - cy);
}

function segmentsIntersect(a, b, c, d) {
    const eps = 1e-9;
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSegment = (p, q, r) =>
        Math.min(p.x, q.x) - eps <= r.x && r.x <= Math.max(p.x, q.x) + eps &&
        Math.min(p.y, q.y) - eps <= r.y && r.y <= Math.max(p.y, q.y) + eps &&
        Math.abs(orient(p, q, r)) <= eps;

    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);

    if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) return true;
    if (Math.abs(o1) <= eps && onSegment(a, b, c)) return true;
    if (Math.abs(o2) <= eps && onSegment(a, b, d)) return true;
    if (Math.abs(o3) <= eps && onSegment(c, d, a)) return true;
    if (Math.abs(o4) <= eps && onSegment(c, d, b)) return true;
    return false;
}

function segmentSegmentDistance(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
        pointSegmentDistance(a, c, d),
        pointSegmentDistance(b, c, d),
        pointSegmentDistance(c, a, b),
        pointSegmentDistance(d, a, b)
    );
}

function polygonToSegmentDistance(polygon, a, b) {
    if (!polygon || polygon.length < 2) return Infinity;
    let min = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        min = Math.min(min, segmentSegmentDistance(polygon[i], polygon[j], a, b));
    }
    return min;
}

function polygonToPolygonDistance(polyA, polyB) {
    if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return Infinity;
    let min = Infinity;
    for (let i = 0; i < polyA.length; i++) {
        const j = (i + 1) % polyA.length;
        for (let k = 0; k < polyB.length; k++) {
            const l = (k + 1) % polyB.length;
            min = Math.min(min, segmentSegmentDistance(polyA[i], polyA[j], polyB[k], polyB[l]));
        }
    }
    return min;
}

function closestPointOnSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const denom = abx * abx + aby * aby;
    if (denom === 0) return { x: a.x, y: a.y };

    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
    return { x: a.x + t * abx, y: a.y + t * aby };
}

function getPolygonSeparationDirection(polyA, polyB) {
    if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return null;

    let bestDist = Infinity;
    let bestA = null;
    let bestB = null;

    for (let i = 0; i < polyA.length; i++) {
        const j = (i + 1) % polyA.length;
        const a1 = polyA[i];
        const a2 = polyA[j];

        for (let k = 0; k < polyB.length; k++) {
            const l = (k + 1) % polyB.length;
            const b1 = polyB[k];
            const b2 = polyB[l];

            if (segmentsIntersect(a1, a2, b1, b2)) {
                bestDist = 0;
                bestA = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
                bestB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
                break;
            }

            const bClose1 = closestPointOnSegment(a1, b1, b2);
            const d1 = Math.hypot(a1.x - bClose1.x, a1.y - bClose1.y);
            if (d1 < bestDist) {
                bestDist = d1;
                bestA = a1;
                bestB = bClose1;
            }

            const bClose2 = closestPointOnSegment(a2, b1, b2);
            const d2 = Math.hypot(a2.x - bClose2.x, a2.y - bClose2.y);
            if (d2 < bestDist) {
                bestDist = d2;
                bestA = a2;
                bestB = bClose2;
            }

            const aClose1 = closestPointOnSegment(b1, a1, a2);
            const d3 = Math.hypot(b1.x - aClose1.x, b1.y - aClose1.y);
            if (d3 < bestDist) {
                bestDist = d3;
                bestA = aClose1;
                bestB = b1;
            }

            const aClose2 = closestPointOnSegment(b2, a1, a2);
            const d4 = Math.hypot(b2.x - aClose2.x, b2.y - aClose2.y);
            if (d4 < bestDist) {
                bestDist = d4;
                bestA = aClose2;
                bestB = b2;
            }
        }

        if (bestDist === 0) break;
    }

    if (!bestA || !bestB) return null;
    const vx = bestA.x - bestB.x;
    const vy = bestA.y - bestB.y;
    const len = Math.hypot(vx, vy);
    if (!Number.isFinite(len) || len === 0) return { x: 1, y: 0, dist: bestDist };
    return { x: vx / len, y: vy / len, dist: bestDist };
}

function normalizeAngleRad(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function getNearestBoundaryEdgeAngle(point, corners) {
    if (!point || !corners || corners.length < 2) return 0;
    let bestAngle = 0;
    let bestDist = Infinity;
    for (let i = 0; i < corners.length; i++) {
        const j = (i + 1) % corners.length;
        const a = corners[i];
        const b = corners[j];
        const d = pointSegmentDistance(point, a, b);
        if (d < bestDist) {
            bestDist = d;
            bestAngle = Math.atan2(b.y - a.y, b.x - a.x);
        }
    }
    return bestAngle;
}

function snapAngleToFenceLines(angle, fenceAngle) {
    const candidates = [0, 1, 2, 3].map((k) => fenceAngle + k * (Math.PI / 2));
    let best = candidates[0];
    let bestDiff = Infinity;
    for (const candidate of candidates) {
        const diff = Math.abs(normalizeAngleRad(angle - candidate));
        if (diff < bestDiff) {
            bestDiff = diff;
            best = candidate;
        }
    }
    return best;
}

function squareBoundaryToRectangle() {
    if (!currentCorners || currentCorners.length !== 4) return;

    const c0 = currentCorners[0];
    const c1 = currentCorners[1];
    const c2 = currentCorners[2];
    const c3 = currentCorners[3];

    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const width = (dist(c0, c1) + dist(c2, c3)) / 2;
    const height = (dist(c1, c2) + dist(c3, c0)) / 2;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

    // Axis along the "front" edge (corner 0 -> 1)
    let axX = c1.x - c0.x;
    let axY = c1.y - c0.y;
    let axLen = Math.hypot(axX, axY);
    if (!Number.isFinite(axLen) || axLen === 0) {
        axX = 1;
        axY = 0;
        axLen = 1;
    }
    axX /= axLen;
    axY /= axLen;

    // Choose a perpendicular axis that points from the front edge towards the back edge.
    const midFront = { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 };
    const midBack = { x: (c2.x + c3.x) / 2, y: (c2.y + c3.y) / 2 };
    const toBack = { x: midBack.x - midFront.x, y: midBack.y - midFront.y };

    const perpA = { x: axY, y: -axX };
    const perpB = { x: -axY, y: axX };
    const dotA = perpA.x * toBack.x + perpA.y * toBack.y;
    const dotB = perpB.x * toBack.x + perpB.y * toBack.y;

    let ayX = perpA.x;
    let ayY = perpA.y;
    if (dotB > dotA) {
        ayX = perpB.x;
        ayY = perpB.y;
    }

    const ayLen = Math.hypot(ayX, ayY) || 1;
    ayX /= ayLen;
    ayY /= ayLen;

    // Keep the rectangle centered where the user's shape is.
    const centroid = {
        x: (c0.x + c1.x + c2.x + c3.x) / 4,
        y: (c0.y + c1.y + c2.y + c3.y) / 4
    };

    const halfW = width / 2;
    const halfH = height / 2;

    currentCorners = [
        { x: centroid.x - axX * halfW - ayX * halfH, y: centroid.y - axY * halfW - ayY * halfH }, // FL
        { x: centroid.x + axX * halfW - ayX * halfH, y: centroid.y + axY * halfW - ayY * halfH }, // FR
        { x: centroid.x + axX * halfW + ayX * halfH, y: centroid.y + axY * halfW + ayY * halfH }, // BR
        { x: centroid.x - axX * halfW + ayX * halfH, y: centroid.y - axY * halfW + ayY * halfH }  // BL
    ];
}

function squareShedToFenceLines() {
    if (!currentShed || !currentCorners) return;
    captureUndoState();
    const fenceAngle = getNearestBoundaryEdgeAngle({ x: currentShed.x, y: currentShed.y }, currentCorners);
    currentShed.rotation = snapAngleToFenceLines(currentShed.rotation || 0, fenceAngle);
    drawBoundary(currentCorners);
    queueShedClearancesUpdate();
}

// Helper: Point in Polygon (Ray Casting)
function isPointInPolygon(p, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let isInside = false;

    // Calculate bounding box first for optimization
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;

    for (let i = 1; i < polygon.length; i++) {
        minX = Math.min(polygon[i].x, minX);
        maxX = Math.max(polygon[i].x, maxX);
        minY = Math.min(polygon[i].y, minY);
        maxY = Math.max(polygon[i].y, maxY);
    }

    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        return false;
    }

    // Ray casting
    let j = polygon.length - 1;
    for (let i = 0; i < polygon.length; i++) {
        if ((polygon[i].y > p.y) !== (polygon[j].y > p.y) &&
            p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x) {
            isInside = !isInside;
        }
        j = i;
    }
    return isInside;
}

// Draw boundary overlay on canvas
function drawBoundary(corners, highlightIndex = -1) {
    const ctx = overlayCanvas.getContext('2d');

    try {
        if (!corners || corners.length === 0) return;

        // Match canvas size to image
        overlayCanvas.width = satelliteImg.naturalWidth;
        overlayCanvas.height = satelliteImg.naturalHeight;

        // Scale factor if image is displayed smaller
        const scaleX = satelliteImg.naturalWidth / IMAGE_SIZE;
        const scaleY = satelliteImg.naturalHeight / IMAGE_SIZE;

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        // Draw filled polygon with transparency
        ctx.beginPath();
        ctx.moveTo(corners[0].x * scaleX, corners[0].y * scaleY);
        for (let i = 1; i < corners.length; i++) {
            ctx.lineTo(corners[i].x * scaleX, corners[i].y * scaleY);
        }
        ctx.closePath();
        // ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
        // ctx.fill();

        // Draw border
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw corner points
        corners.forEach((corner, index) => {
            ctx.beginPath();
            const radius = index === highlightIndex ? 12 : 10;
            ctx.arc(corner.x * scaleX, corner.y * scaleY, radius, 0, Math.PI * 2);
            ctx.fillStyle = index === highlightIndex ? '#a855f7' : '#6366f1';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Add corner label
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';

            let label = (index + 1).toString();
            if (corners.length === 4) {
                const labels = ['FL', 'FR', 'BR', 'BL'];
                label = labels[index];
            }
            ctx.fillText(label, corner.x * scaleX, corner.y * scaleY - 16);
        });

        // Draw edge midpoint handles (small squares)
        for (let i = 0; i < corners.length; i++) {
            const j = (i + 1) % corners.length;
            const midX = ((corners[i].x + corners[j].x) / 2) * scaleX;
            const midY = ((corners[i].y + corners[j].y) / 2) * scaleY;

            const handleSize = 6 / scale;
            ctx.fillStyle = '#22d3ee'; // Cyan for edge handles
            ctx.fillRect(midX - handleSize / 2, midY - handleSize / 2, handleSize, handleSize);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1 / scale;
            ctx.strokeRect(midX - handleSize / 2, midY - handleSize / 2, handleSize, handleSize);
        }
        // Draw Boundary Rotation Handle (at bottom-right, offset outside shape)
        // Find the corner with max x+y (bottom-right-ish)
        let brIndex = 0;
        let maxSum = -Infinity;
        for (let i = 0; i < corners.length; i++) {
            const sum = corners[i].x + corners[i].y;
            if (sum > maxSum) {
                maxSum = sum;
                brIndex = i;
            }
        }
        const brCorner = corners[brIndex];
        const handleOffset = 20; // Pixels offset from corner
        const hx = (brCorner.x + handleOffset) * scaleX;
        const hy = (brCorner.y + handleOffset) * scaleY;

        // Adjust size for zoom
        const arrowRadius = 8 / scale;

        // Curved arrow
        ctx.beginPath();
        ctx.arc(hx, hy, arrowRadius, -Math.PI * 0.8, Math.PI * 0.4);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        const arrowTip = arrowRadius * 0.7;
        ctx.moveTo(hx + arrowTip, hy - arrowRadius * 0.3);
        ctx.lineTo(hx + arrowRadius, hy - arrowRadius * 0.6);
        ctx.lineTo(hx + arrowTip * 0.4, hy - arrowRadius * 0.5);
        ctx.closePath();
        ctx.fillStyle = 'white';
        ctx.fill();

        const baseFontSize = 12 / scale;
        const smallFontSize = 10 / scale;
        const dimOffset = 14 / scale;

        const drawPill = (text, x, y, fontSize, fg) => {
            if (!text) return;
            ctx.save();
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const padX = 8 / scale;
            const padY = 5 / scale;
            const lineGap = 2 / scale;
            const lines = String(text).split('\n');
            const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
            const textH = lines.length * fontSize + (lines.length - 1) * lineGap;
            const boxW = textW + padX * 2;
            const boxH = textH + padY * 2;
            const r = Math.min(10 / scale, boxH / 2);

            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 10 / scale;
            ctx.shadowOffsetY = 2 / scale;

            ctx.beginPath();
            ctx.roundRect
                ? ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, r)
                : ctx.rect(x - boxW / 2, y - boxH / 2, boxW, boxH);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.fill();

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.lineWidth = 1 / scale;
            ctx.stroke();

            ctx.fillStyle = fg;
            let lineY = y - textH / 2 + fontSize / 2;
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], x, lineY + i * (fontSize + lineGap));
            }
            ctx.restore();
        };

        const getPillBox = (text, fontSize) => {
            ctx.save();
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            const padX = 8 / scale;
            const padY = 5 / scale;
            const lineGap = 2 / scale;
            const lines = String(text).split('\n');
            const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
            const textH = lines.length * fontSize + (lines.length - 1) * lineGap;
            const boxW = textW + padX * 2;
            const boxH = textH + padY * 2;
            ctx.restore();
            return { boxW, boxH };
        };

        const getPillExtentAlong = (text, fontSize, ux, uy) => {
            const { boxW, boxH } = getPillBox(text, fontSize);
            return Math.abs(ux) * (boxW / 2) + Math.abs(uy) * (boxH / 2);
        };

        // Draw whiteout regions (solid white rectangles with rotation)
        if (whiteoutRegions && whiteoutRegions.length > 0) {
            for (let i = 0; i < whiteoutRegions.length; i++) {
                const region = whiteoutRegions[i];
                const cx = region.x * scaleX;
                const cy = region.y * scaleY;
                const rw = region.width * scaleX;
                const rh = region.height * scaleY;
                const angle = region.rotation || 0;
                const isSelected = (i === selectedWhiteoutIndex);

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(angle);

                // Fill with color (default white)
                ctx.fillStyle = region.fillColor || 'white';
                ctx.fillRect(-rw / 2, -rh / 2, rw, rh);

                // Border - highlight if selected
                ctx.strokeStyle = isSelected ? 'rgba(100, 100, 255, 0.9)' : 'rgba(200, 200, 200, 0.8)';
                ctx.lineWidth = isSelected ? 2 : 1;
                ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);

                // Rotation handle (only for selected region)
                if (isSelected) {
                    ctx.beginPath();
                    ctx.arc(0, -rh / 2 - 15, 6, -Math.PI * 0.8, Math.PI * 0.4);
                    ctx.strokeStyle = '#6366f1'; // Indigo
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Arrow head
                    ctx.beginPath();
                    ctx.moveTo(4, -rh / 2 - 10);
                    ctx.lineTo(6, -rh / 2 - 14);
                    ctx.lineTo(2, -rh / 2 - 14);
                    ctx.closePath();
                    ctx.fillStyle = '#6366f1';
                    ctx.fill();
                }

                ctx.restore();
            }
        }

        // Whiteout selection preview (click/drag)
        if (isSelectingWhiteout && whiteoutSelectStart && whiteoutSelectEnd) {
            const x1 = Math.min(whiteoutSelectStart.x, whiteoutSelectEnd.x) * scaleX;
            const y1 = Math.min(whiteoutSelectStart.y, whiteoutSelectEnd.y) * scaleY;
            const x2 = Math.max(whiteoutSelectStart.x, whiteoutSelectEnd.x) * scaleX;
            const y2 = Math.max(whiteoutSelectStart.y, whiteoutSelectEnd.y) * scaleY;
            const w = Math.max(0, x2 - x1);
            const h = Math.max(0, y2 - y1);

            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.fillRect(x1, y1, w, h);
            ctx.strokeRect(x1, y1, w, h);
            ctx.restore();
        }

        // House selection preview (click/drag)
        if (isSelectingHouse && houseSelectStart && houseSelectEnd) {
            const x1 = Math.min(houseSelectStart.x, houseSelectEnd.x) * scaleX;
            const y1 = Math.min(houseSelectStart.y, houseSelectEnd.y) * scaleY;
            const x2 = Math.max(houseSelectStart.x, houseSelectEnd.x) * scaleX;
            const y2 = Math.max(houseSelectStart.y, houseSelectEnd.y) * scaleY;
            const w = Math.max(0, x2 - x1);
            const h = Math.max(0, y2 - y1);

            ctx.save();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.fillRect(x1, y1, w, h);
            ctx.strokeRect(x1, y1, w, h);
            ctx.restore();
        }

        // Draw House
        if (currentHouse) {
            const houseW = currentHouse.width * scaleX;
            const houseH = currentHouse.height * scaleY;
            const houseAngle = currentHouse.rotation || 0;
            const houseCenterX = currentHouse.x * scaleX;
            const houseCenterY = currentHouse.y * scaleY;

            ctx.save();
            ctx.translate(houseCenterX, houseCenterY);
            ctx.rotate(houseAngle);

            ctx.fillStyle = 'rgba(148, 163, 184, 0.25)'; // Slate
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2;
            ctx.fillRect(-houseW / 2, -houseH / 2, houseW, houseH);
            ctx.strokeRect(-houseW / 2, -houseH / 2, houseW, houseH);

            // Rotation handle (curved arrow)
            ctx.beginPath();
            ctx.arc(0, -houseH / 2 - 15, 6, -Math.PI * 0.8, Math.PI * 0.4);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Arrow head
            ctx.beginPath();
            ctx.moveTo(4, -houseH / 2 - 10);
            ctx.lineTo(6, -houseH / 2 - 14);
            ctx.lineTo(2, -houseH / 2 - 14);
            ctx.closePath();
            ctx.fillStyle = 'white';
            ctx.fill();

            ctx.restore();
            drawPill('HOUSE', houseCenterX, houseCenterY, baseFontSize, '#ffffff');
        }

        // Draw all structures
        const structureColors = {
            'shed': { fill: 'rgba(234, 179, 8, 0.4)', stroke: '#eab308' },       // Yellow/Gold
            'garage': { fill: 'rgba(168, 162, 158, 0.4)', stroke: '#a8a29e' },   // Stone
            'pool': { fill: 'rgba(56, 189, 248, 0.4)', stroke: '#38bdf8' },      // Sky blue
            'patio': { fill: 'rgba(167, 139, 250, 0.4)', stroke: '#a78bfa' },    // Violet
            'other': { fill: 'rgba(251, 146, 60, 0.4)', stroke: '#fb923c' }      // Orange
        };

        structures.forEach((structure, structIdx) => {
            const isSelected = structIdx === selectedStructureIndex;
            const colors = structureColors[structure.type] || structureColors['other'];

            ctx.save();
            ctx.translate(structure.x * scaleX, structure.y * scaleY);
            ctx.rotate(structure.rotation || 0);

            ctx.fillStyle = colors.fill;
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = isSelected ? 3 : 2;

            // Draw structure rect centered
            const w = structure.width * scaleX;
            const h = structure.height * scaleY;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.strokeRect(-w / 2, -h / 2, w, h);

            // Draw selection indicator if selected
            if (isSelected) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
                ctx.setLineDash([]);
            }

            // Draw rotation handle (curved arrow only) - only for selected structure
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(0, -h / 2 - 15, 6, -Math.PI * 0.8, Math.PI * 0.4);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Arrow head
                ctx.beginPath();
                ctx.moveTo(4, -h / 2 - 10);
                ctx.lineTo(6, -h / 2 - 14);
                ctx.lineTo(2, -h / 2 - 14);
                ctx.closePath();
                ctx.fillStyle = 'white';
                ctx.fill();
            }

            const structCenterX = structure.x * scaleX;
            const structCenterY = structure.y * scaleY;
            const angle = structure.rotation || 0;

            ctx.restore();

            // Structure labels (drawn after restore so they don't cover the interior)
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const axisX = { x: cos, y: sin };
            const axisY = { x: -sin, y: cos };

            if (currentLatitude) {
                const fp = getFeetPerPixel(currentLatitude);
                const ftW = structure.width * fp;
                const ftH = structure.height * fp;
                const wInt = Math.round(ftW);
                const hInt = Math.round(ftH);

                // Arrow direction should follow the side direction (axisX = width, axisY = height).
                const widthText = formatDimensionArrowText(wInt, axisX);
                const heightText = formatDimensionArrowText(hInt, axisY);
                const dimFont = baseFontSize + (2 / scale);
                const gap = 8 / scale;
                const labelGap = 8 / scale;

                let widthDist = 0;
                let widthExtent = 0;
                if (widthText) {
                    widthExtent = getPillExtentAlong(widthText, dimFont, axisY.x, axisY.y);
                    widthDist = (h / 2) + gap + widthExtent;
                    drawPill(widthText, structCenterX + axisY.x * widthDist, structCenterY + axisY.y * widthDist, dimFont, '#ffffff');
                }

                if (heightText) {
                    const heightExtent = getPillExtentAlong(heightText, dimFont, axisX.x, axisX.y);
                    const heightDist = (w / 2) + gap + heightExtent;
                    drawPill(heightText, structCenterX + axisX.x * heightDist, structCenterY + axisX.y * heightDist, dimFont, '#ffffff');
                }

                // Keep the structure label under the width dimension (toward +axisY).
                const labelText = structure.label || 'STRUCTURE';
                const labelExtent = getPillExtentAlong(labelText, baseFontSize, axisY.x, axisY.y);
                const labelDist = widthText
                    ? (widthDist + labelGap + widthExtent + labelExtent)
                    : ((h / 2) + gap + labelExtent);
                drawPill(labelText, structCenterX + axisY.x * labelDist, structCenterY + axisY.y * labelDist, baseFontSize, '#ffffff');
            }
        });

        // Draw Shed Distance Lines (visual lines from shed to property lines and house)
        if (currentShed && showShedDistanceLines && currentLatitude) {
            const shedPoly = getRotatedRectCorners(currentShed);
            const feetPerPixel = getFeetPerPixel(currentLatitude);

            // Fence labels (same as used in updateShedClearancesUI)
            const fenceLabels = corners.map((_, i) => `Line ${i + 1}`);

            // Draw lines to each fence
            for (let i = 0; i < corners.length; i++) {
                const label = fenceLabels[i];
                if (!isShedClearanceIncluded(label)) continue;

                const j = (i + 1) % corners.length;
                const p1 = corners[i];
                const p2 = corners[j];

                const closest = getClosestPointsBetweenPolygonAndSegment(shedPoly, p1, p2);
                if (!closest || closest.distance < 1) continue;

                const feet = closest.distance * feetPerPixel;

                // Draw dashed line from shed to fence
                ctx.beginPath();
                ctx.moveTo(closest.polyPoint.x * scaleX, closest.polyPoint.y * scaleY);
                ctx.lineTo(closest.segPoint.x * scaleX, closest.segPoint.y * scaleY);
                ctx.strokeStyle = 'rgba(251, 146, 60, 0.8)'; // Orange
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw distance label at midpoint
                const midX = ((closest.polyPoint.x + closest.segPoint.x) / 2) * scaleX;
                const midY = ((closest.polyPoint.y + closest.segPoint.y) / 2) * scaleY;
                const distText = `${feet.toFixed(1)}'`;

                ctx.font = `bold ${10 / scale}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const metrics = ctx.measureText(distText);
                const padX = 4 / scale;
                const padY = 3 / scale;
                const boxW = metrics.width + padX * 2;
                const boxH = (10 / scale) + padY * 2;

                // Background pill
                ctx.fillStyle = 'rgba(251, 146, 60, 0.9)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, 4 / scale);
                    ctx.fill();
                } else {
                    ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
                }

                ctx.fillStyle = '#000000';
                ctx.fillText(distText, midX, midY);
            }

            // Draw line to house if present
            if (currentHouse && isShedClearanceIncluded('House')) {
                const housePoly = getRotatedRectCorners(currentHouse);
                const closest = getClosestPointsBetweenPolygons(shedPoly, housePoly);

                if (closest && closest.distance >= 1) {
                    const feet = closest.distance * feetPerPixel;

                    // Draw dashed line from shed to house
                    ctx.beginPath();
                    ctx.moveTo(closest.pointA.x * scaleX, closest.pointA.y * scaleY);
                    ctx.lineTo(closest.pointB.x * scaleX, closest.pointB.y * scaleY);
                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)'; // Slate (house color)
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Draw distance label at midpoint
                    const midX = ((closest.pointA.x + closest.pointB.x) / 2) * scaleX;
                    const midY = ((closest.pointA.y + closest.pointB.y) / 2) * scaleY;
                    const distText = `${feet.toFixed(1)}'`;

                    ctx.font = `bold ${10 / scale}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const metrics = ctx.measureText(distText);
                    const padX = 4 / scale;
                    const padY = 3 / scale;
                    const boxW = metrics.width + padX * 2;
                    const boxH = (10 / scale) + padY * 2;

                    // Background pill
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, 4 / scale);
                        ctx.fill();
                    } else {
                        ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
                    }

                    ctx.fillStyle = '#000000';
                    ctx.fillText(distText, midX, midY);
                }
            }
        }

        // Draw line measurements & Setbacks
        if (currentLatitude) {
            const feetPerPixel = getFeetPerPixel(currentLatitude);

            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let i = 0; i < corners.length; i++) {
                const j = (i + 1) % corners.length;
                const p1 = corners[i];
                const p2 = corners[j];

                // 1. Draw Distance Label for Property Line
                const distance = calculateDistance(p1, p2, feetPerPixel);
                const text = `${distance.toFixed(1)} ft`;

                // Calculate midpoint
                const midX = (p1.x + p2.x) / 2 * scaleX;
                const midY = (p1.y + p2.y) / 2 * scaleY;

                // Draw text background
                ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
                const metrics = ctx.measureText(text);
                const padding = 4;
                const w = metrics.width + padding * 2;
                const h = 20;
                ctx.fillRect(midX - w / 2, midY - h / 2, w, h);

                // Draw text
                ctx.fillStyle = '#10b981'; // Green text
                ctx.fillText(text, midX, midY);

                // 2. Draw Setback Line (Dashed) - if enabled
                if (showSetback && setbackDistance > 0) {
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len > 0) {
                        const pixelsSetback = setbackDistance / feetPerPixel;

                        // Two possible normal directions
                        const n1x = -dy / len;
                        const n1y = dx / len;
                        const n2x = dy / len;
                        const n2y = -dx / len;

                        // Test which one points inside
                        const mid = { x: p1.x + dx / 2, y: p1.y + dy / 2 };
                        const testPoint = { x: mid.x + n1x * pixelsSetback, y: mid.y + n1y * pixelsSetback };

                        let finalNx, finalNy;
                        if (isPointInPolygon(testPoint, corners)) {
                            finalNx = n1x; finalNy = n1y;
                        } else {
                            finalNx = n2x; finalNy = n2y;
                        }

                        const offX = finalNx * pixelsSetback;
                        const offY = finalNy * pixelsSetback;

                        ctx.beginPath();
                        ctx.moveTo((p1.x + offX) * scaleX, (p1.y + offY) * scaleY);
                        ctx.lineTo((p2.x + offX) * scaleX, (p2.y + offY) * scaleY);
                        ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)';
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Draw perpendicular arrow with distance on ALL sides
                        // Position at 1/4 along the line to avoid overlapping with property measurement at midpoint
                        const quarterX = p1.x + dx * 0.25;
                        const quarterY = p1.y + dy * 0.25;

                        const arrowStartX = quarterX * scaleX;
                        const arrowStartY = quarterY * scaleY;
                        const arrowEndX = (quarterX + offX) * scaleX;
                        const arrowEndY = (quarterY + offY) * scaleY;

                        // Draw the arrow line
                        ctx.beginPath();
                        ctx.moveTo(arrowStartX, arrowStartY);
                        ctx.lineTo(arrowEndX, arrowEndY);
                        ctx.strokeStyle = 'rgba(255, 200, 100, 0.9)';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([]);
                        ctx.stroke();

                        // Draw arrowhead
                        const arrowSize = 6;
                        const angle = Math.atan2(arrowEndY - arrowStartY, arrowEndX - arrowStartX);
                        ctx.beginPath();
                        ctx.moveTo(arrowEndX, arrowEndY);
                        ctx.lineTo(arrowEndX - arrowSize * Math.cos(angle - Math.PI / 6), arrowEndY - arrowSize * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(arrowEndX, arrowEndY);
                        ctx.lineTo(arrowEndX - arrowSize * Math.cos(angle + Math.PI / 6), arrowEndY - arrowSize * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();

                        // Draw distance label at midpoint of arrow
                        const labelX = (arrowStartX + arrowEndX) / 2;
                        const labelY = (arrowStartY + arrowEndY) / 2 - 8;
                        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                        ctx.fillRect(labelX - 18, labelY - 10, 36, 16);
                        ctx.fillStyle = 'rgba(255, 200, 100, 1)';
                        ctx.font = 'bold 10px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(`${setbackDistance}ft`, labelX, labelY);
                        ctx.textAlign = 'left';

                        ctx.lineWidth = 1;
                    }
                }
            }
        }

        // Shadow labels
        if (shadowLabels && shadowLabels.length) {
            for (const label of shadowLabels) {
                const text = (label && label.text) ? label.text : SHADOW_LABEL_TEXT;
                if (!label) continue;
                drawPill(text, label.x * scaleX, label.y * scaleY, baseFontSize, '#ffffff');
            }
        }

        // Custom Reference Line
        if (customReferenceLine) {
            const p1 = customReferenceLine.p1;
            const p2 = customReferenceLine.p2;

            // Draw the reference line (purple dashed)
            ctx.beginPath();
            ctx.moveTo(p1.x * scaleX, p1.y * scaleY);
            ctx.lineTo(p2.x * scaleX, p2.y * scaleY);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)'; // Purple
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw draggable endpoints (circles)
            const endpointRadius = 8 / scale;

            // P1 endpoint
            ctx.beginPath();
            ctx.arc(p1.x * scaleX, p1.y * scaleY, endpointRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();

            // P2 endpoint
            ctx.beginPath();
            ctx.arc(p2.x * scaleX, p2.y * scaleY, endpointRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();


            // Draw distance from shed to reference line if shed exists
            if (currentShed && showReferenceLineDistance && currentLatitude) {
                const shedPoly = getRotatedRectCorners(currentShed);
                const closest = getClosestPointsBetweenPolygonAndSegment(shedPoly, p1, p2);

                if (closest && closest.distance > 1) {
                    const feetPerPixel = getFeetPerPixel(currentLatitude);
                    const feet = closest.distance * feetPerPixel;

                    // Draw dashed line from shed to reference line
                    ctx.beginPath();
                    ctx.moveTo(closest.polyPoint.x * scaleX, closest.polyPoint.y * scaleY);
                    ctx.lineTo(closest.segPoint.x * scaleX, closest.segPoint.y * scaleY);
                    ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Draw distance label
                    const distMidX = ((closest.polyPoint.x + closest.segPoint.x) / 2) * scaleX;
                    const distMidY = ((closest.polyPoint.y + closest.segPoint.y) / 2) * scaleY;
                    const distText = `${feet.toFixed(1)}'`;

                    ctx.font = `bold ${10 / scale}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const metrics = ctx.measureText(distText);
                    const padX = 4 / scale;
                    const padY = 3 / scale;
                    const boxW = metrics.width + padX * 2;
                    const boxH = (10 / scale) + padY * 2;

                    ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(distMidX - boxW / 2, distMidY - boxH / 2, boxW, boxH, 4 / scale);
                        ctx.fill();
                    } else {
                        ctx.fillRect(distMidX - boxW / 2, distMidY - boxH / 2, boxW, boxH);
                    }

                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(distText, distMidX, distMidY);
                }
            }
        }

        // Preview Reference Line (while drawing)
        if (isDrawingReferenceLine && referenceLineStartPoint && referenceLineCurrentPoint) {
            ctx.beginPath();
            ctx.moveTo(referenceLineStartPoint.x * scaleX, referenceLineStartPoint.y * scaleY);
            ctx.lineTo(referenceLineCurrentPoint.x * scaleX, referenceLineCurrentPoint.y * scaleY);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)'; // Lighter purple
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw start point circle
            ctx.beginPath();
            ctx.arc(referenceLineStartPoint.x * scaleX, referenceLineStartPoint.y * scaleY, 6 / scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
            ctx.fill();
            ctx.stroke();
        }

        // Draw Custom Labeled Lines
        if (customLabeledLines.length > 0 && currentLatitude) {
            const feetPerPixel = getFeetPerPixel(currentLatitude);

            customLabeledLines.forEach((line) => {
                const p1 = line.p1;
                const p2 = line.p2;

                // Draw the line (cyan/teal color)
                ctx.beginPath();
                ctx.moveTo(p1.x * scaleX, p1.y * scaleY);
                ctx.lineTo(p2.x * scaleX, p2.y * scaleY);
                ctx.strokeStyle = '#06b6d4'; // Cyan
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
                ctx.stroke();

                // Draw endpoint circles
                [p1, p2].forEach((pt) => {
                    ctx.beginPath();
                    ctx.arc(pt.x * scaleX, pt.y * scaleY, 5 / scale, 0, Math.PI * 2);
                    ctx.fillStyle = '#06b6d4';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });

                // Calculate line length and angle
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const lengthPx = Math.hypot(dx, dy);
                const lengthFeet = lengthPx * feetPerPixel;
                const angle = Math.atan2(dy, dx);

                // Midpoint for label
                const midX = ((p1.x + p2.x) / 2) * scaleX;
                const midY = ((p1.y + p2.y) / 2) * scaleY;

                // Create label text with measurement
                const labelText = `${line.label} ${lengthFeet.toFixed(1)}'`;

                // Draw rotated label aligned with line
                ctx.save();
                ctx.translate(midX, midY);

                // Flip text if it would be upside down
                let textAngle = angle;
                if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                    textAngle += Math.PI;
                }
                ctx.rotate(textAngle);

                // Draw label background pill
                const fontSize = 14 / scale;
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const metrics = ctx.measureText(labelText);
                const padX = 10 / scale;
                const padY = 6 / scale;
                const boxW = metrics.width + padX * 2;
                const boxH = fontSize + padY * 2;

                // Offset above the line
                const offsetY = -14 / scale;

                // Draw dark border/shadow for better visibility
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(-boxW / 2 - 1, offsetY - boxH / 2 - 1, boxW + 2, boxH + 2, 5 / scale);
                    ctx.fill();
                }

                // Draw main pill background
                ctx.fillStyle = '#06b6d4';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1.5 / scale;
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(-boxW / 2, offsetY - boxH / 2, boxW, boxH, 4 / scale);
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.fillRect(-boxW / 2, offsetY - boxH / 2, boxW, boxH);
                }

                // Draw text with shadow for extra readability
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillText(labelText, 1 / scale, offsetY + 1 / scale);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(labelText, 0, offsetY);

                ctx.restore();
            });
        }

        // Preview Labeled Line (while drawing)
        if (isDrawingLabeledLine && labeledLineStartPoint && labeledLineCurrentPoint) {
            ctx.beginPath();
            ctx.moveTo(labeledLineStartPoint.x * scaleX, labeledLineStartPoint.y * scaleY);
            ctx.lineTo(labeledLineCurrentPoint.x * scaleX, labeledLineCurrentPoint.y * scaleY);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw start point circle
            ctx.beginPath();
            ctx.arc(labeledLineStartPoint.x * scaleX, labeledLineStartPoint.y * scaleY, 6 / scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
            ctx.fill();
            ctx.stroke();

            // Show preview label with live measurement
            if (currentLatitude) {
                const feetPerPixel = getFeetPerPixel(currentLatitude);
                const dx = labeledLineCurrentPoint.x - labeledLineStartPoint.x;
                const dy = labeledLineCurrentPoint.y - labeledLineStartPoint.y;
                const lengthPx = Math.hypot(dx, dy);
                const lengthFeet = lengthPx * feetPerPixel;

                const midX = ((labeledLineStartPoint.x + labeledLineCurrentPoint.x) / 2) * scaleX;
                const midY = ((labeledLineStartPoint.y + labeledLineCurrentPoint.y) / 2) * scaleY;

                const previewText = `${pendingLabeledLineLabel} ${lengthFeet.toFixed(1)}'`;
                ctx.font = `bold ${10 / scale}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const metrics = ctx.measureText(previewText);
                const padX = 4 / scale;
                const padY = 3 / scale;
                const boxW = metrics.width + padX * 2;
                const boxH = (10 / scale) + padY * 2;

                ctx.fillStyle = 'rgba(6, 182, 212, 0.8)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(midX - boxW / 2, midY - 20 / scale - boxH / 2, boxW, boxH, 4 / scale);
                    ctx.fill();
                } else {
                    ctx.fillRect(midX - boxW / 2, midY - 20 / scale - boxH / 2, boxW, boxH);
                }
                ctx.fillStyle = '#ffffff';
                ctx.fillText(previewText, midX, midY - 20 / scale);
            }
        }

        queueShedClearancesUpdate();
    } catch (e) {
        console.error("Error drawing boundary:", e);
    }
}

// Helper: Point in Polygon (Ray Casting)
function isPointInPolygon(p, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let isInside = false;

    // Calculate bounding box first for optimization
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;

    for (let i = 1; i < polygon.length; i++) {
        minX = Math.min(polygon[i].x, minX);
        maxX = Math.max(polygon[i].x, maxX);
        minY = Math.min(polygon[i].y, minY);
        maxY = Math.max(polygon[i].y, maxY);
    }

    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        return false;
    }

    // Ray casting
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if ((polygon[i].y > p.y) !== (polygon[j].y > p.y) &&
            p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x) {
            isInside = !isInside;
        }
    }
    return isInside;
}

// State for dragging
let currentCorners = null;
let currentLatitude = null;
let dragIndex = -1;
let isDragging = false;
let isDraggingBoundary = false;
let isRotatingBoundary = false;
let boundaryRotationStart = 0;
let isDraggingEdge = false;
let dragEdgeIndex = -1;
let edgeDragStart = null;

// Shed/Structures state - supports multiple structures
let currentShed = null; // Legacy - will be computed from structures[0] for backwards compatibility
let structures = []; // Array of { id, type: 'shed'|'garage'|'pool'|'patio', x, y, width, height, rotation, label }
let selectedStructureIndex = -1; // Which structure is selected (-1 = none)
let isDraggingShed = false;
let dragStartPos = null;

// Helper: Get the primary shed (first structure of type 'shed') for backwards compatibility
function getPrimaryShed() {
    return structures.find(s => s.type === 'shed') || structures[0] || null;
}

// Helper: Get selected structure
function getSelectedStructure() {
    return selectedStructureIndex >= 0 && selectedStructureIndex < structures.length
        ? structures[selectedStructureIndex]
        : null;
}

// Helper: Sync currentShed with structures for backwards compatibility
function syncCurrentShed() {
    // Set currentShed to the selected structure (for dragging, rotation, etc.)
    currentShed = getSelectedStructure();
}

// House state
let currentHouse = null;
let isHouseSelectMode = false;
let isSelectingHouse = false;
let houseSelectStart = null;
let houseSelectEnd = null;
let isDraggingHouse = false;
let isRotatingHouse = false;

// Shadow label state
const SHADOW_LABEL_TEXT = 'SHADOW';
let shadowLabels = [];
let isDraggingShadowLabel = false;
let dragShadowLabelIndex = -1;
let shadowLabelDragOffset = { x: 0, y: 0 };

// Whiteout state
let whiteoutRegions = []; // Array of {x, y, width, height, rotation, fillColor} rectangles (x,y is center)
let isWhiteoutMode = false;
let isSelectingWhiteout = false;
let whiteoutSelectStart = null;
let whiteoutSelectEnd = null;
let selectedWhiteoutIndex = -1; // Which whiteout is selected for rotation
let isRotatingWhiteout = false;
let isDraggingWhiteout = false;
let whiteoutDragOffset = { x: 0, y: 0 };
let isPickingWhiteoutColor = false; // Color picker mode
let currentWhiteoutColor = 'white'; // Current fill color for new/selected whiteouts

// Setback settings
let setbackDistance = 5; // feet, configurable
let showSetback = false; // Off by default, user can enable

// Shed distance lines (visual lines from shed to property lines)
let showShedDistanceLines = true; // Master toggle - on by default

// Custom reference line (user-drawable line for shed distance measurements)
// State variables moved to top of file

// ============ SAVE/LOAD PROJECT SYSTEM ============
const PROJECT_STORAGE_KEY = 'propertyline_projects_v1';

function getProjectState() {
    return {
        version: 1,
        timestamp: Date.now(),
        address: addressInput?.value || '',
        currentCorners,
        currentLatitude,
        currentShed,
        structures,
        selectedStructureIndex,
        currentHouse,
        customReferenceLine,
        customLabeledLines,
        shadowLabels,
        whiteoutRegions,
        setbackDistance,
        showSetback,
        showShedDistanceLines,
        scale,
        panX,
        panY,
        mapRotation
    };
}

function loadProjectState(state) {
    if (!state) {
        console.error('loadProjectState: No state provided');
        return false;
    }

    try {
        if (state.address && addressInput) addressInput.value = state.address;
        currentCorners = state.currentCorners || null;
        currentLatitude = state.currentLatitude || null;

        // Load structures array (with backwards compatibility for old saves)
        if (state.structures && Array.isArray(state.structures)) {
            structures = state.structures;
            selectedStructureIndex = state.selectedStructureIndex ?? (structures.length > 0 ? 0 : -1);
            syncCurrentShed();
        } else if (state.currentShed) {
            // Old format: convert single shed to structures array
            structures = [{
                id: Date.now(),
                type: 'shed',
                x: state.currentShed.x,
                y: state.currentShed.y,
                width: state.currentShed.width,
                height: state.currentShed.height,
                rotation: state.currentShed.rotation || 0,
                label: state.currentShed.label || 'PROPOSED SHED'
            }];
            selectedStructureIndex = 0;
            syncCurrentShed();
        } else {
            structures = [];
            selectedStructureIndex = -1;
            currentShed = null;
        }

        currentHouse = state.currentHouse || null;
        customReferenceLine = state.customReferenceLine || null;
        customLabeledLines = state.customLabeledLines || [];
        shadowLabels = state.shadowLabels || [];
        whiteoutRegions = state.whiteoutRegions || [];
        setbackDistance = state.setbackDistance ?? 5;
        showSetback = state.showSetback ?? false;
        showShedDistanceLines = state.showShedDistanceLines ?? true;

        // View state
        if (state.scale) scale = state.scale;
        if (state.panX !== undefined) panX = state.panX;
        if (state.panY !== undefined) panY = state.panY;
        if (state.mapRotation !== undefined) mapRotation = state.mapRotation;

        // Update UI (safe - these check for null elements)
        const setbackInput = document.getElementById('popup-setback-distance');
        if (setbackInput) setbackInput.value = setbackDistance;
        const setbackToggle = document.getElementById('popup-setback-toggle');
        if (setbackToggle) setbackToggle.checked = showSetback;

        // Update structures UI (only if functions exist)
        if (typeof updateStructuresListUI === 'function') updateStructuresListUI();
        if (typeof updateShedPopupState === 'function') updateShedPopupState();

        // Redraw
        if (currentCorners && typeof drawBoundary === 'function') {
            drawBoundary(currentCorners);
            if (typeof updateScaleTransform === 'function') updateScaleTransform();
        }

        return true;
    } catch (e) {
        console.error('Error loading project state:', e);
        console.error('Stack:', e.stack);
        return false;
    }
}

function getSavedProjects() {
    try {
        const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveProject(name) {
    if (!name) return false;
    const projects = getSavedProjects();
    projects[name] = getProjectState();
    try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
        return true;
    } catch (e) {
        console.error('Error saving project:', e);
        return false;
    }
}

function loadProject(name) {
    const projects = getSavedProjects();
    if (!projects[name]) return false;
    return loadProjectState(projects[name]);
}

function deleteProject(name) {
    const projects = getSavedProjects();
    delete projects[name];
    try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
        return true;
    } catch (e) {
        return false;
    }
}

function exportProjectToFile() {
    const state = getProjectState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `property-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importProjectFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const state = JSON.parse(e.target.result);

                // If state has an address, we need to fetch the satellite image first
                if (state.address) {
                    addressInput.value = state.address;

                    // Fetch satellite image for the saved address
                    try {
                        setLoading(true, 'Loading saved project...');
                        const coords = await geocodeAddress(state.address);
                        if (coords) {
                            currentLatitude = coords.lat;
                            state.currentLatitude = coords.lat;
                            const imageUrl = await getSatelliteImageUrl(coords.lat, coords.lng);

                            // Load image and then restore state
                            satelliteImg.onload = () => {
                                setLoading(false);
                                resultsSection.style.display = 'block';
                                document.getElementById('bottom-action-bar').style.display = 'flex';

                                // Now load the rest of the state
                                if (loadProjectState(state)) {
                                    resolve(true);
                                } else {
                                    reject(new Error('Failed to restore project state'));
                                }
                            };
                            satelliteImg.onerror = () => {
                                setLoading(false);
                                reject(new Error('Failed to load satellite image'));
                            };
                            satelliteImg.src = imageUrl;
                        } else {
                            setLoading(false);
                            reject(new Error('Could not geocode saved address'));
                        }
                    } catch (err) {
                        setLoading(false);
                        reject(err);
                    }
                } else {
                    // No address, just load state directly
                    if (loadProjectState(state)) {
                        resolve(true);
                    } else {
                        reject(new Error('Invalid project file'));
                    }
                }
            } catch (err) {
                console.error('Import error:', err);
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// ============ UNDO/REDO SYSTEM ============
const MAX_UNDO_STATES = 50;
let undoStack = [];
let redoStack = [];
let isUndoRedoAction = false;

function captureUndoState() {
    if (isUndoRedoAction) return;

    const state = {
        currentCorners: currentCorners ? JSON.parse(JSON.stringify(currentCorners)) : null,
        currentShed: currentShed ? JSON.parse(JSON.stringify(currentShed)) : null,
        structures: JSON.parse(JSON.stringify(structures)),
        selectedStructureIndex: selectedStructureIndex,
        currentHouse: currentHouse ? JSON.parse(JSON.stringify(currentHouse)) : null,
        customReferenceLine: customReferenceLine ? JSON.parse(JSON.stringify(customReferenceLine)) : null,
        customLabeledLines: JSON.parse(JSON.stringify(customLabeledLines)),
        shadowLabels: JSON.parse(JSON.stringify(shadowLabels)),
        whiteoutRegions: JSON.parse(JSON.stringify(whiteoutRegions))
    };

    undoStack.push(state);
    if (undoStack.length > MAX_UNDO_STATES) {
        undoStack.shift();
    }
    redoStack = []; // Clear redo stack on new action
}

function undo() {
    if (undoStack.length === 0) return false;

    // Save current state to redo stack
    const currentState = {
        currentCorners: currentCorners ? JSON.parse(JSON.stringify(currentCorners)) : null,
        currentShed: currentShed ? JSON.parse(JSON.stringify(currentShed)) : null,
        structures: JSON.parse(JSON.stringify(structures)),
        selectedStructureIndex: selectedStructureIndex,
        currentHouse: currentHouse ? JSON.parse(JSON.stringify(currentHouse)) : null,
        customReferenceLine: customReferenceLine ? JSON.parse(JSON.stringify(customReferenceLine)) : null,
        customLabeledLines: JSON.parse(JSON.stringify(customLabeledLines)),
        shadowLabels: JSON.parse(JSON.stringify(shadowLabels)),
        whiteoutRegions: JSON.parse(JSON.stringify(whiteoutRegions))
    };
    redoStack.push(currentState);

    // Restore previous state
    const prevState = undoStack.pop();
    isUndoRedoAction = true;

    currentCorners = prevState.currentCorners;
    structures = prevState.structures || [];
    selectedStructureIndex = prevState.selectedStructureIndex ?? -1;
    currentShed = prevState.currentShed;
    syncCurrentShed();
    currentHouse = prevState.currentHouse;
    customReferenceLine = prevState.customReferenceLine;
    customLabeledLines = prevState.customLabeledLines;
    shadowLabels = prevState.shadowLabels;
    whiteoutRegions = prevState.whiteoutRegions;

    updateStructuresListUI();
    updateShedPopupState();
    if (currentCorners) drawBoundary(currentCorners);
    isUndoRedoAction = false;

    return true;
}

function redo() {
    if (redoStack.length === 0) return false;

    // Save current state to undo stack
    const currentState = {
        currentCorners: currentCorners ? JSON.parse(JSON.stringify(currentCorners)) : null,
        currentShed: currentShed ? JSON.parse(JSON.stringify(currentShed)) : null,
        structures: JSON.parse(JSON.stringify(structures)),
        selectedStructureIndex: selectedStructureIndex,
        currentHouse: currentHouse ? JSON.parse(JSON.stringify(currentHouse)) : null,
        customReferenceLine: customReferenceLine ? JSON.parse(JSON.stringify(customReferenceLine)) : null,
        customLabeledLines: JSON.parse(JSON.stringify(customLabeledLines)),
        shadowLabels: JSON.parse(JSON.stringify(shadowLabels)),
        whiteoutRegions: JSON.parse(JSON.stringify(whiteoutRegions))
    };
    undoStack.push(currentState);

    // Restore next state
    const nextState = redoStack.pop();
    isUndoRedoAction = true;

    currentCorners = nextState.currentCorners;
    structures = nextState.structures || [];
    selectedStructureIndex = nextState.selectedStructureIndex ?? -1;
    currentShed = nextState.currentShed;
    syncCurrentShed();
    currentHouse = nextState.currentHouse;
    customReferenceLine = nextState.customReferenceLine;
    customLabeledLines = nextState.customLabeledLines;
    shadowLabels = nextState.shadowLabels;
    whiteoutRegions = nextState.whiteoutRegions;

    updateStructuresListUI();
    updateShedPopupState();
    if (currentCorners) drawBoundary(currentCorners);
    isUndoRedoAction = false;

    return true;
}

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
    }
});


// Helper: Set reference line mode
// Helper: Set reference line mode
function setReferenceLineMode(enabled) {
    isDrawingReferenceLine = Boolean(enabled);
    referenceLineStartPoint = null;
    isDraggingReferenceEndpoint = false;
    draggedReferenceEndpoint = null;

    if (isDrawingReferenceLine) {
        overlayCanvas.style.cursor = 'crosshair';
    } else if (!isDraggingReferenceEndpoint) {
        overlayCanvas.style.cursor = 'grab';
    }
}

// Find the closest points between a polygon and a line segment
// Returns { polyPoint, segPoint, distance } or null if poly is empty
function getClosestPointsBetweenPolygonAndSegment(poly, a, b) {
    if (!poly || poly.length < 2) return null;

    let bestDist = Infinity;
    let bestPolyPoint = null;
    let bestSegPoint = null;

    // Check each edge of the polygon
    for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];

        // Check all 4 combinations of endpoints and closest points
        // 1. Poly vertex to closest point on segment
        const seg1 = closestPointOnSegment(p1, a, b);
        const d1 = Math.hypot(p1.x - seg1.x, p1.y - seg1.y);
        if (d1 < bestDist) {
            bestDist = d1;
            bestPolyPoint = p1;
            bestSegPoint = seg1;
        }

        // 2. Segment endpoint to closest point on poly edge
        const poly1 = closestPointOnSegment(a, p1, p2);
        const d2 = Math.hypot(a.x - poly1.x, a.y - poly1.y);
        if (d2 < bestDist) {
            bestDist = d2;
            bestPolyPoint = poly1;
            bestSegPoint = a;
        }

        const poly2 = closestPointOnSegment(b, p1, p2);
        const d3 = Math.hypot(b.x - poly2.x, b.y - poly2.y);
        if (d3 < bestDist) {
            bestDist = d3;
            bestPolyPoint = poly2;
            bestSegPoint = b;
        }
    }

    return bestPolyPoint && bestSegPoint
        ? { polyPoint: bestPolyPoint, segPoint: bestSegPoint, distance: bestDist }
        : null;
}

// Find closest points between two polygons
// Returns { pointA, pointB, distance } or null
function getClosestPointsBetweenPolygons(polyA, polyB) {
    if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return null;

    let bestDist = Infinity;
    let bestA = null;
    let bestB = null;

    for (let i = 0; i < polyA.length; i++) {
        const a1 = polyA[i];
        const a2 = polyA[(i + 1) % polyA.length];

        for (let j = 0; j < polyB.length; j++) {
            const b1 = polyB[j];
            const b2 = polyB[(j + 1) % polyB.length];

            // Check segments crossing
            if (segmentsIntersect(a1, a2, b1, b2)) {
                return { pointA: a1, pointB: b1, distance: 0 };
            }

            // Check all point-to-segment combinations
            const tests = [
                { poly: closestPointOnSegment(a1, b1, b2), other: a1, isA: false },
                { poly: closestPointOnSegment(a2, b1, b2), other: a2, isA: false },
                { poly: closestPointOnSegment(b1, a1, a2), other: b1, isA: true },
                { poly: closestPointOnSegment(b2, a1, a2), other: b2, isA: true },
            ];

            for (const t of tests) {
                const d = Math.hypot(t.poly.x - t.other.x, t.poly.y - t.other.y);
                if (d < bestDist) {
                    bestDist = d;
                    if (t.isA) {
                        bestA = t.poly;
                        bestB = t.other;
                    } else {
                        bestA = t.other;
                        bestB = t.poly;
                    }
                }
            }
        }
    }

    return bestA && bestB ? { pointA: bestA, pointB: bestB, distance: bestDist } : null;
}

// Create default rectangle in center of image (150ft x 150ft x 150ft x 150ft)
function createDefaultRectangle(latitude) {
    // Use provided latitude or default to a mid-US latitude for calculation
    const lat = latitude || currentLatitude || 39.0;
    const feetPerPixel = getFeetPerPixel(lat);

    // Default to 150ft per side
    const defaultFeet = 150;
    const sidePixels = defaultFeet / feetPerPixel;

    // Center the rectangle in the image
    const centerX = IMAGE_SIZE / 2;
    const centerY = IMAGE_SIZE / 2;
    const halfSide = sidePixels / 2;

    return [
        { x: centerX - halfSide, y: centerY + halfSide },  // Front Left (bottom-left)
        { x: centerX + halfSide, y: centerY + halfSide },  // Front Right (bottom-right)
        { x: centerX + halfSide, y: centerY - halfSide },  // Back Right (top-right)
        { x: centerX - halfSide, y: centerY - halfSide }   // Back Left (top-left)
    ];
}

// Get interaction position relative to image (internal IMAGE_SIZE coords).
// We invert the map wrapper's CSS transform so clicks/touches stay accurate under pan/zoom/rotation.
function getInteractionPos(clientX, clientY) {
    const container = mapWrapper?.parentElement;
    const containerRect = container?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };

    // mapWrapper is positioned at (0,0) within the container's padding box.
    const originX = containerRect.left + (container?.clientLeft || 0);
    const originY = containerRect.top + (container?.clientTop || 0);

    const px = clientX - originX;
    const py = clientY - originY;

    let localX = px;
    let localY = py;

    const transform = mapWrapper ? getComputedStyle(mapWrapper).transform : 'none';
    if (transform && transform !== 'none') {
        const MatrixCtor = window.DOMMatrixReadOnly || window.DOMMatrix;
        if (MatrixCtor) {
            const matrix = new MatrixCtor(transform);
            const inv = (typeof matrix.inverse === 'function')
                ? matrix.inverse()
                : (typeof matrix.invertSelf === 'function' ? matrix.invertSelf() : null);

            if (inv) {
                if (typeof inv.transformPoint === 'function') {
                    const p = inv.transformPoint({ x: px, y: py });
                    localX = p.x;
                    localY = p.y;
                } else if (window.DOMPoint) {
                    const p = new DOMPoint(px, py).matrixTransform(inv);
                    localX = p.x;
                    localY = p.y;
                } else {
                    // Fallback for very old browsers (2D only).
                    const a = (inv.a ?? inv.m11 ?? 1);
                    const b = (inv.b ?? inv.m12 ?? 0);
                    const c = (inv.c ?? inv.m21 ?? 0);
                    const d = (inv.d ?? inv.m22 ?? 1);
                    const e = (inv.e ?? inv.m41 ?? 0);
                    const f = (inv.f ?? inv.m42 ?? 0);
                    localX = a * px + c * py + e;
                    localY = b * px + d * py + f;
                }
            }
        }
    }

    // Layout size (ignores transforms); used to convert from CSS pixels -> IMAGE_SIZE coords.
    const w = overlayCanvas?.offsetWidth || overlayCanvas?.clientWidth || mapWrapper?.offsetWidth || mapWrapper?.clientWidth || 0;
    const h = overlayCanvas?.offsetHeight || overlayCanvas?.clientHeight || mapWrapper?.offsetHeight || mapWrapper?.clientHeight || 0;
    if (!w || !h) return { x: 0, y: 0 };

    return {
        x: (localX / w) * IMAGE_SIZE,
        y: (localY / h) * IMAGE_SIZE
    };
}

// Get mouse position relative to image
function getMousePos(e) {
    return getInteractionPos(e.clientX, e.clientY);
}

// Add a default shed (10x12 ft approx) - Legacy function, now uses popup values
function addShed() {
    // This function is kept for compatibility but now uses popup values
    addShedFromPopup();
}

// Add a default house (approx 40x30 ft) - Legacy function
function addHouse() {
    if (!currentLatitude) return;
    const feetPerPixel = getFeetPerPixel(currentLatitude);

    const wFeet = popupHouseW || 40;
    const hFeet = popupHouseH || 30;

    const widthPixels = wFeet / feetPerPixel;
    const heightPixels = hFeet / feetPerPixel;

    // Place near center (offset slightly if a shed exists so they don't overlap)
    let x = IMAGE_SIZE / 2;
    let y = IMAGE_SIZE / 2;
    if (currentShed) {
        y = Math.max(0, y - (currentShed.height / 2) - (heightPixels / 2) - 20);
    }

    currentHouse = {
        x,
        y,
        width: widthPixels,
        height: heightPixels,
        rotation: 0
    };
    syncHousePopupInputsFromCurrentHouse();
    updateHouseButtons();
    drawBoundary(currentCorners);
}

// Update Shed Button States - Now uses popup state
function updateShedButtons() {
    updateShedPopupState();
}

// Update House Button States - Now uses popup state
let isSyncingHouseInputs = false;

function updateHouseButtons() {
    updateHousePopupState();
}

function syncHousePopupInputsFromCurrentHouse() {
    if (!currentHouse || !currentLatitude) return;
    const feetPerPixel = getFeetPerPixel(currentLatitude);
    const wFeet = currentHouse.width * feetPerPixel;
    const hFeet = currentHouse.height * feetPerPixel;

    const wEl = document.getElementById('popup-house-w');
    const hEl = document.getElementById('popup-house-h');

    isSyncingHouseInputs = true;
    if (wEl) wEl.value = wFeet.toFixed(1);
    if (hEl) hEl.value = hFeet.toFixed(1);
    popupHouseW = wFeet;
    popupHouseH = hFeet;
    isSyncingHouseInputs = false;
}

function applyHouseSizeFromPopupInputs() {
    if (isSyncingHouseInputs) return;

    const wEl = document.getElementById('popup-house-w');
    const hEl = document.getElementById('popup-house-h');
    const wFeet = Number.parseFloat(wEl?.value);
    const hFeet = Number.parseFloat(hEl?.value);
    if (!Number.isFinite(wFeet) || wFeet <= 0 || !Number.isFinite(hFeet) || hFeet <= 0) return;

    popupHouseW = wFeet;
    popupHouseH = hFeet;

    if (!currentHouse || !currentLatitude) return;
    const feetPerPixel = getFeetPerPixel(currentLatitude);
    currentHouse.width = wFeet / feetPerPixel;
    currentHouse.height = hFeet / feetPerPixel;
    queueShedClearancesUpdate();
    if (currentCorners) drawBoundary(currentCorners);
}

function setHouseSelectMode(enabled) {
    isHouseSelectMode = Boolean(enabled);
    if (!isHouseSelectMode) {
        isSelectingHouse = false;
        houseSelectStart = null;
        houseSelectEnd = null;
    }
    updateHouseButtons();
}

function commitHouseSelection() {
    if (!houseSelectStart || !houseSelectEnd) return;
    const x1 = Math.min(houseSelectStart.x, houseSelectEnd.x);
    const y1 = Math.min(houseSelectStart.y, houseSelectEnd.y);
    const x2 = Math.max(houseSelectStart.x, houseSelectEnd.x);
    const y2 = Math.max(houseSelectStart.y, houseSelectEnd.y);

    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    if (w < 8 || h < 8) return;

    currentHouse = {
        x: x1 + w / 2,
        y: y1 + h / 2,
        width: w,
        height: h,
        rotation: 0
    };
}

function finishHouseSelection(commit) {
    if (!isSelectingHouse) return;
    if (commit) commitHouseSelection();
    isSelectingHouse = false;
    houseSelectStart = null;
    houseSelectEnd = null;
    setHouseSelectMode(false);
    if (commit) syncHousePopupInputsFromCurrentHouse();
    queueShedClearancesUpdate();
    if (currentCorners) drawBoundary(currentCorners);
}

// Whiteout tool functions
function setWhiteoutMode(enabled) {
    isWhiteoutMode = Boolean(enabled);
    if (!isWhiteoutMode) {
        isSelectingWhiteout = false;
        whiteoutSelectStart = null;
        whiteoutSelectEnd = null;
        isRotatingWhiteout = false;
        isDraggingWhiteout = false;
        selectedWhiteoutIndex = -1;
        isPickingWhiteoutColor = false;
        // Reset pick color button
        const pickBtn = document.getElementById('popup-pick-color');
        if (pickBtn) {
            pickBtn.textContent = '🎨 Pick Color';
            pickBtn.classList.remove('active');
        }
    }
    // Update button state
    const btn = document.getElementById('btn-whiteout-tool');
    if (btn) {
        btn.classList.toggle('active', isWhiteoutMode);
        btn.setAttribute('aria-pressed', String(isWhiteoutMode));
    }
    if (currentCorners) drawBoundary(currentCorners);
}

function commitWhiteoutSelection() {
    if (!whiteoutSelectStart || !whiteoutSelectEnd) return;
    const x1 = Math.min(whiteoutSelectStart.x, whiteoutSelectEnd.x);
    const y1 = Math.min(whiteoutSelectStart.y, whiteoutSelectEnd.y);
    const x2 = Math.max(whiteoutSelectStart.x, whiteoutSelectEnd.x);
    const y2 = Math.max(whiteoutSelectStart.y, whiteoutSelectEnd.y);

    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    if (w < 5 || h < 5) return; // Minimum size

    // Store center position and rotation (like house/shed)
    const newIndex = whiteoutRegions.length;
    whiteoutRegions.push({
        x: x1 + w / 2, // Center X
        y: y1 + h / 2, // Center Y
        width: w,
        height: h,
        rotation: 0,
        fillColor: currentWhiteoutColor
    });
    selectedWhiteoutIndex = newIndex; // Select the newly created region
}

function finishWhiteoutSelection(commit) {
    if (!isSelectingWhiteout) return;
    if (commit) commitWhiteoutSelection();
    isSelectingWhiteout = false;
    whiteoutSelectStart = null;
    whiteoutSelectEnd = null;
    // Stay in whiteout mode so user can add more regions
    if (currentCorners) drawBoundary(currentCorners);
}

function clearWhiteoutRegions() {
    whiteoutRegions = [];
    selectedWhiteoutIndex = -1;
    currentWhiteoutColor = 'white';
    // Reset color preview to white
    const preview = document.getElementById('whiteout-color-preview');
    if (preview) {
        preview.style.background = 'white';
    }
    if (currentCorners) drawBoundary(currentCorners);
}

// Sample color from satellite image at given position (in IMAGE_SIZE coordinates)
function sampleColorFromImage(pos) {
    if (!satelliteImg || !satelliteImg.complete) return null;

    // Create a temporary canvas to draw the image and sample color
    const tempCanvas = document.createElement('canvas');
    const imgW = satelliteImg.naturalWidth || IMAGE_SIZE;
    const imgH = satelliteImg.naturalHeight || IMAGE_SIZE;
    tempCanvas.width = imgW;
    tempCanvas.height = imgH;
    const ctx = tempCanvas.getContext('2d');

    try {
        ctx.drawImage(satelliteImg, 0, 0);

        // Convert IMAGE_SIZE coordinates to actual image coordinates
        const imgX = Math.floor((pos.x / IMAGE_SIZE) * imgW);
        const imgY = Math.floor((pos.y / IMAGE_SIZE) * imgH);

        // Clamp to image bounds
        const clampedX = Math.max(0, Math.min(imgW - 1, imgX));
        const clampedY = Math.max(0, Math.min(imgH - 1, imgY));

        const pixel = ctx.getImageData(clampedX, clampedY, 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];
        return `rgb(${r}, ${g}, ${b})`;
    } catch (e) {
        console.warn('Failed to sample color (CORS?):', e);
        return null;
    }
}

// Apply picked color to selected whiteout or update current color
function applyPickedColor(color) {
    currentWhiteoutColor = color;

    // Update color preview
    const preview = document.getElementById('whiteout-color-preview');
    if (preview) {
        preview.style.background = color;
    }

    // If a whiteout is selected, update its color
    if (selectedWhiteoutIndex !== -1 && whiteoutRegions[selectedWhiteoutIndex]) {
        whiteoutRegions[selectedWhiteoutIndex].fillColor = color;
    }

    // Reset pick mode
    isPickingWhiteoutColor = false;
    const btn = document.getElementById('popup-pick-color');
    if (btn) {
        btn.textContent = '🎨 Pick Color';
        btn.classList.remove('active');
    }

    if (currentCorners) drawBoundary(currentCorners);
}

// Check if point is inside shed
function isPointInRotatedRect(pos, rect) {
    if (!rect) return false;
    const angle = rect.rotation || 0;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const dx = pos.x - rect.x;
    const dy = pos.y - rect.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    return localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH;
}

function isPointInShed(pos) {
    return isPointInRotatedRect(pos, currentShed);
}

// Find which structure (if any) contains the given point
// Returns index of the structure or -1 if none
function findStructureAtPoint(pos) {
    // Check in reverse order so topmost (most recently added) is selected first
    for (let i = structures.length - 1; i >= 0; i--) {
        if (isPointInRotatedRect(pos, structures[i])) {
            return i;
        }
    }
    return -1;
}

function isPointInHouse(pos) {
    return isPointInRotatedRect(pos, currentHouse);
}

// Find if mouse is near a corner
function findNearCorner(pos, corners, threshold = 20) {
    for (let i = 0; i < corners.length; i++) {
        const dx = pos.x - corners[i].x;
        const dy = pos.y - corners[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
            return i;
        }
    }
    return -1;
}

// Update measurements after drag
function updateMeasurementsFromCorners() {
    if (currentCorners && currentLatitude) {
        const feetPerPixel = getFeetPerPixel(currentLatitude);
        displayMeasurements(currentCorners, feetPerPixel);
    }
}

let shedClearancesRaf = 0;
let lastShedClearancesKey = '';

const SHED_CLEARANCE_PROMPT_STORAGE_KEY = 'shedClearancePromptIncludeV1';
let shedClearancePromptInclude = {};
try {
    const raw = localStorage.getItem(SHED_CLEARANCE_PROMPT_STORAGE_KEY);
    if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') shedClearancePromptInclude = parsed;
    }
} catch (e) { }

function getDefaultShedClearanceInclude(label) {
    const norm = String(label || '').toLowerCase();
    // Line 1, Line 2, etc. - all default to true
    if (norm.startsWith('line ')) return true;
    if (norm === 'house') return true;
    return true;
}

function isShedClearanceIncluded(label) {
    const key = String(label || '');
    const v = shedClearancePromptInclude[key];
    if (typeof v === 'boolean') return v;
    return getDefaultShedClearanceInclude(key);
}

function setShedClearanceIncluded(label, value) {
    const key = String(label || '');
    shedClearancePromptInclude[key] = Boolean(value);
    try {
        localStorage.setItem(SHED_CLEARANCE_PROMPT_STORAGE_KEY, JSON.stringify(shedClearancePromptInclude));
    } catch (e) { }
}

async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', 'true');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            return true;
        } catch (e2) {
            return false;
        }
    }
}

function buildShedClearancePrompt({ shed, fences, houseFeet, feetPerPixel }) {
    if (!shed || !Number.isFinite(feetPerPixel) || feetPerPixel <= 0) return '';

    const entries = [];
    for (const fence of fences || []) {
        if (!fence) continue;
        if (!Number.isFinite(fence.feet)) continue;
        if (!isShedClearanceIncluded(fence.label)) continue;
        entries.push({ label: fence.label, feet: fence.feet });
    }

    if (Number.isFinite(houseFeet) && isShedClearanceIncluded('House')) {
        entries.push({ label: 'House', feet: houseFeet });
    }

    if (entries.length === 0) return '';

    const wFt = shed.width * feetPerPixel;
    const hFt = shed.height * feetPerPixel;
    const sizeText = (Number.isFinite(wFt) && Number.isFinite(hFt))
        ? `${wFt.toFixed(1)} ft x ${hFt.toFixed(1)} ft`
        : 'the shed';

    const lines = entries.map((e) => `- ${e.label}: ${e.feet.toFixed(1)} ft (${formatFeetInches(e.feet)})`);

    return [
        `On the existing site plan image, add clearance dimension callouts from the PROPOSED SHED (${sizeText}) to the following:`,
        ...lines,
        '',
        'Use thin dimension lines that are perpendicular to the referenced fence/house edge.',
        'Place the text labels in the white margin outside the property boundary with short leader lines.',
        'Only add these clearance measurements; do not add any others. Do not change the drawing style.'
    ].join('\n');
}

function queueShedClearancesUpdate() {
    if (!shedClearancesPanel || !shedClearanceGrid) return;
    if (!currentShed && shedClearancesPanel.style.display === 'none' && lastShedClearancesKey === '') return;
    if (shedClearancesRaf) return;
    shedClearancesRaf = requestAnimationFrame(() => {
        shedClearancesRaf = 0;
        updateShedClearancesUI();
    });
}

function formatFeet(feet) {
    if (!Number.isFinite(feet)) return '--';
    return `${feet.toFixed(1)} ft`;
}

function formatFeetInches(feet) {
    if (!Number.isFinite(feet)) return '--';
    const sign = feet < 0 ? '-' : '';
    const absFeet = Math.abs(feet);
    const totalInches = Math.round(absFeet * 12);
    const ft = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${sign}${ft}' ${inches}"`;
}

function formatFeetCompactNumber(feet, decimals = 1) {
    if (!Number.isFinite(feet)) return '--';
    const factor = 10 ** decimals;
    const rounded = Math.round(feet * factor) / factor;
    const asInt = Math.round(rounded);
    if (Math.abs(rounded - asInt) < 1e-9) return String(asInt);
    return rounded.toFixed(decimals);
}

function formatDimensionArrowText(value, axis) {
    if (!Number.isFinite(value)) return '';
    const n = Math.round(value);
    if (!Number.isFinite(n)) return '';
    const ax = axis?.x ?? 1;
    const ay = axis?.y ?? 0;
    const isVertical = Math.abs(ay) > Math.abs(ax);
    return isVertical ? `↑\n${n}\n↓` : `←${n}→`;
}

function updateShedClearancesUI() {
    if (!shedClearancesPanel || !shedClearanceGrid) return;

    if (!currentShed || !currentCorners || !currentLatitude) {
        if (shedClearancesPanel.style.display === 'none' && lastShedClearancesKey === '') return;
        shedClearancesPanel.style.display = 'none';
        shedClearanceGrid.innerHTML = '';
        shedClearancesPanel.querySelector('.clearance-prompt-actions')?.remove();
        if (shedClearanceWarning) {
            shedClearanceWarning.style.display = 'none';
            shedClearanceWarning.textContent = '';
        }
        lastShedClearancesKey = '';
        return;
    }

    const feetPerPixel = getFeetPerPixel(currentLatitude);
    const shedPoly = getRotatedRectCorners(currentShed);

    const fenceLabels = currentCorners.map((_, i) => `Line ${i + 1}`);

    const fences = fenceLabels.map((label, i) => {
        const j = (i + 1) % currentCorners.length;
        const distPx = polygonToSegmentDistance(shedPoly, currentCorners[i], currentCorners[j]);
        return { label, feet: distPx * feetPerPixel };
    });

    // Calculate house/reference line distance
    let houseFeet = null;
    if (currentHouse) {
        houseFeet = polygonToPolygonDistance(shedPoly, getRotatedRectCorners(currentHouse)) * feetPerPixel;
    } else if (customReferenceLine) {
        // Use reference line distance if no house but reference line exists
        const closest = getClosestPointsBetweenPolygonAndSegment(shedPoly, customReferenceLine.p1, customReferenceLine.p2);
        if (closest && closest.distance > 0) {
            houseFeet = closest.distance * feetPerPixel;
        }
    }

    const shedInside = shedPoly.length >= 3 && shedPoly.every((p) => isPointInPolygon(p, currentCorners));

    const keyParts = fences.map((c) => `${c.label}:${Number.isFinite(c.feet) ? c.feet.toFixed(2) : 'na'}`);
    keyParts.push(`house:${houseFeet === null ? 'none' : (Number.isFinite(houseFeet) ? houseFeet.toFixed(2) : 'na')}`);
    keyParts.push(`inside:${shedInside ? '1' : '0'}`);
    const key = keyParts.join('|');

    if (key === lastShedClearancesKey) {
        shedClearancesPanel.style.display = 'block';
        return;
    }
    lastShedClearancesKey = key;

    shedClearanceGrid.innerHTML = '';

    const existingActions = shedClearancesPanel.querySelector('.clearance-prompt-actions');
    if (existingActions) existingActions.remove();

    const promptActions = document.createElement('div');
    promptActions.className = 'clearance-prompt-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-secondary';
    copyBtn.textContent = 'Copy clearance prompt';

    const statusEl = document.createElement('div');
    statusEl.className = 'clearance-prompt-status';
    statusEl.textContent = '';

    const refreshPromptState = () => {
        const prompt = buildShedClearancePrompt({
            shed: currentShed,
            fences,
            houseFeet,
            feetPerPixel
        });
        copyBtn.disabled = !prompt;
        copyBtn.dataset.prompt = prompt || '';
        if (!prompt) statusEl.textContent = 'Select one or more clearances to include.';
        else if (statusEl.textContent.startsWith('Select')) statusEl.textContent = '';
    };

    copyBtn.addEventListener('click', async () => {
        const prompt = buildShedClearancePrompt({
            shed: currentShed,
            fences,
            houseFeet,
            feetPerPixel
        });
        if (!prompt) {
            statusEl.textContent = 'Select one or more clearances to include.';
            return;
        }
        const ok = await copyTextToClipboard(prompt);
        statusEl.textContent = ok ? 'Copied.' : 'Copy failed.';
    });

    const renderItem = (label, feet, { editable = true, onCommit = null } = {}) => {
        const item = document.createElement('div');
        item.className = 'clearance-item';

        const labelEl = document.createElement('div');
        labelEl.className = 'clearance-label';
        labelEl.textContent = label;

        const valueRow = document.createElement('div');
        valueRow.className = 'clearance-input-row';

        const inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.className = 'clearance-input';
        inputEl.min = '0';
        inputEl.step = '0.01';
        inputEl.inputMode = 'decimal';
        inputEl.autocomplete = 'off';
        inputEl.spellcheck = false;

        const unitEl = document.createElement('span');
        unitEl.className = 'measurement-unit';
        unitEl.textContent = 'ft';

        const subEl = document.createElement('div');
        subEl.className = 'clearance-subvalue';

        const hasValue = Number.isFinite(feet);
        if (hasValue) {
            inputEl.value = feet.toFixed(2);
            subEl.textContent = formatFeetInches(feet);
            if (feet <= 0.99) item.classList.add('is-danger');
        } else {
            inputEl.value = '';
            inputEl.placeholder = '--';
            subEl.textContent = '';
        }

        const canEdit = editable && hasValue && typeof onCommit === 'function';
        inputEl.disabled = !canEdit;
        if (canEdit) {
            inputEl.addEventListener('change', (e) => {
                const newFeet = parseFloat(e.target.value);
                if (!Number.isFinite(newFeet) || newFeet < 0) {
                    e.target.value = feet.toFixed(2);
                    return;
                }
                onCommit(newFeet);
            });
        }

        valueRow.appendChild(inputEl);
        valueRow.appendChild(unitEl);

        item.appendChild(labelEl);
        item.appendChild(valueRow);
        item.appendChild(subEl);

        const includeEl = document.createElement('label');
        includeEl.className = 'clearance-include';
        const includeCb = document.createElement('input');
        includeCb.type = 'checkbox';
        includeCb.checked = isShedClearanceIncluded(label);
        includeCb.disabled = !hasValue;
        includeCb.addEventListener('change', () => {
            setShedClearanceIncluded(label, includeCb.checked);
            refreshPromptState();
        });
        includeEl.appendChild(includeCb);
        includeEl.appendChild(document.createTextNode('Include in prompt'));
        item.appendChild(includeEl);

        shedClearanceGrid.appendChild(item);
    };

    fences.forEach((fence, i) => {
        renderItem(fence.label, fence.feet, {
            editable: true,
            onCommit: (newFeet) => setShedClearanceToFence(i, newFeet)
        });
    });

    renderItem('House', houseFeet, {
        editable: Boolean(currentHouse || customReferenceLine),
        onCommit: (newFeet) => setShedClearanceToHouse(newFeet)
    });

    if (shedClearanceWarning) {
        if (!shedInside) {
            shedClearanceWarning.textContent = 'Shed is outside the property boundary.';
            shedClearanceWarning.style.display = 'block';
        } else {
            shedClearanceWarning.textContent = '';
            shedClearanceWarning.style.display = 'none';
        }
    }

    promptActions.appendChild(copyBtn);
    promptActions.appendChild(statusEl);
    if (shedClearanceWarning) shedClearanceWarning.insertAdjacentElement('afterend', promptActions);
    else shedClearancesPanel.appendChild(promptActions);
    refreshPromptState();

    shedClearancesPanel.style.display = 'block';
}

function setShedClearanceToFence(edgeIndex, targetFeet) {
    if (!currentShed || !currentCorners || !currentLatitude) return;
    if (!Number.isFinite(targetFeet) || targetFeet < 0) return;
    if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= currentCorners.length) return;

    const feetPerPixel = getFeetPerPixel(currentLatitude);
    if (!Number.isFinite(feetPerPixel) || feetPerPixel <= 0) return;

    const normal = getEdgeNormal(currentCorners, edgeIndex);
    const nLen = Math.hypot(normal.x, normal.y);
    if (!Number.isFinite(nLen) || nLen === 0) return;

    const j = (edgeIndex + 1) % currentCorners.length;
    const maxIterations = 12;
    const toleranceFeet = 0.02; // ~1/4 inch

    for (let iter = 0; iter < maxIterations; iter++) {
        const shedPoly = getRotatedRectCorners(currentShed);
        const currentFeet = polygonToSegmentDistance(shedPoly, currentCorners[edgeIndex], currentCorners[j]) * feetPerPixel;
        if (!Number.isFinite(currentFeet)) break;

        const errorFeet = targetFeet - currentFeet;
        if (Math.abs(errorFeet) <= toleranceFeet) break;

        const deltaPx = errorFeet / feetPerPixel;
        if (!Number.isFinite(deltaPx)) break;

        currentShed.x += normal.x * deltaPx;
        currentShed.y += normal.y * deltaPx;
    }

    drawBoundary(currentCorners);
    queueShedClearancesUpdate();
}

function setShedClearanceToHouse(targetFeet) {
    if (!currentShed || !currentLatitude) return;
    if (!Number.isFinite(targetFeet) || targetFeet < 0) return;

    const feetPerPixel = getFeetPerPixel(currentLatitude);
    if (!Number.isFinite(feetPerPixel) || feetPerPixel <= 0) return;

    const maxIterations = 12;
    const toleranceFeet = 0.02; // ~1/4 inch

    // Handle reference line if no house
    if (!currentHouse && customReferenceLine) {
        for (let iter = 0; iter < maxIterations; iter++) {
            const shedPoly = getRotatedRectCorners(currentShed);
            const closest = getClosestPointsBetweenPolygonAndSegment(shedPoly, customReferenceLine.p1, customReferenceLine.p2);
            if (!closest) break;

            const currentFeet = closest.distance * feetPerPixel;
            if (!Number.isFinite(currentFeet)) break;

            const errorFeet = targetFeet - currentFeet;
            if (Math.abs(errorFeet) <= toleranceFeet) break;

            // Direction from reference line to shed
            const dirX = closest.polyPoint.x - closest.segPoint.x;
            const dirY = closest.polyPoint.y - closest.segPoint.y;
            const dirLen = Math.hypot(dirX, dirY) || 1;
            const ux = dirX / dirLen;
            const uy = dirY / dirLen;

            const deltaPx = errorFeet / feetPerPixel;
            if (!Number.isFinite(deltaPx)) break;

            currentShed.x += ux * deltaPx;
            currentShed.y += uy * deltaPx;
        }
    } else if (currentHouse) {
        for (let iter = 0; iter < maxIterations; iter++) {
            const shedPoly = getRotatedRectCorners(currentShed);
            const housePoly = getRotatedRectCorners(currentHouse);

            const currentFeet = polygonToPolygonDistance(shedPoly, housePoly) * feetPerPixel;
            if (!Number.isFinite(currentFeet)) break;

            const errorFeet = targetFeet - currentFeet;
            if (Math.abs(errorFeet) <= toleranceFeet) break;

            const sep = getPolygonSeparationDirection(shedPoly, housePoly);
            const dirX = sep?.x ?? (currentShed.x - currentHouse.x);
            const dirY = sep?.y ?? (currentShed.y - currentHouse.y);
            const dirLen = Math.hypot(dirX, dirY) || 1;
            const ux = dirX / dirLen;
            const uy = dirY / dirLen;

            const deltaPx = errorFeet / feetPerPixel;
            if (!Number.isFinite(deltaPx)) break;

            currentShed.x += ux * deltaPx;
            currentShed.y += uy * deltaPx;
        }
    } else {
        return; // No house or reference line
    }

    drawBoundary(currentCorners);
    queueShedClearancesUpdate();
}

// Find if position is near an edge midpoint, returns edge index or -1
function findNearEdgeMidpoint(pos, corners, threshold = 15) {
    if (!corners || corners.length < 2) return -1;

    for (let i = 0; i < corners.length; i++) {
        const j = (i + 1) % corners.length;
        const midX = (corners[i].x + corners[j].x) / 2;
        const midY = (corners[i].y + corners[j].y) / 2;

        const dx = pos.x - midX;
        const dy = pos.y - midY;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
            return i;
        }
    }
    return -1;
}

// Get edge midpoint position
function getEdgeMidpoint(corners, edgeIndex) {
    const j = (edgeIndex + 1) % corners.length;
    return {
        x: (corners[edgeIndex].x + corners[j].x) / 2,
        y: (corners[edgeIndex].y + corners[j].y) / 2
    };
}

// Get edge normal (perpendicular direction, pointing inward)
function getEdgeNormal(corners, edgeIndex) {
    const j = (edgeIndex + 1) % corners.length;
    const dx = corners[j].x - corners[edgeIndex].x;
    const dy = corners[j].y - corners[edgeIndex].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 0 };

    // Perpendicular: rotate 90 degrees (swap and negate one)
    // We'll use (-dy, dx) which points "left" of the edge direction
    let nx = -dy / len;
    let ny = dx / len;

    // Check if this normal points inward (toward centroid)
    const mid = getEdgeMidpoint(corners, edgeIndex);
    const centroid = getBoundaryCentroid(corners);
    const toCentroidX = centroid.x - mid.x;
    const toCentroidY = centroid.y - mid.y;

    // If dot product is negative, flip the normal
    if (nx * toCentroidX + ny * toCentroidY < 0) {
        nx = -nx;
        ny = -ny;
    }

    return { x: nx, y: ny };
}

// Calculate centroid of boundary
function getBoundaryCentroid(corners) {
    if (!corners || corners.length === 0) return { x: IMAGE_SIZE / 2, y: IMAGE_SIZE / 2 };
    const sumX = corners.reduce((a, c) => a + c.x, 0);
    const sumY = corners.reduce((a, c) => a + c.y, 0);
    return { x: sumX / corners.length, y: sumY / corners.length };
}

// Check if near boundary rotation handle (at bottom-right corner, offset)
function isNearBoundaryRotateHandle(pos, threshold = 25) {
    if (!currentCorners || currentCorners.length === 0) return false;

    // Find bottom-right corner (max x+y)
    let brIndex = 0;
    let maxSum = -Infinity;
    for (let i = 0; i < currentCorners.length; i++) {
        const sum = currentCorners[i].x + currentCorners[i].y;
        if (sum > maxSum) {
            maxSum = sum;
            brIndex = i;
        }
    }

    const brCorner = currentCorners[brIndex];
    const handleOffset = 20;
    const handleX = brCorner.x + handleOffset;
    const handleY = brCorner.y + handleOffset;

    const dx = pos.x - handleX;
    const dy = pos.y - handleY;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
}

// Rotate all corners around centroid by delta angle
function rotateBoundaryByDelta(deltaAngle) {
    if (!currentCorners) return;
    const centroid = getBoundaryCentroid(currentCorners);
    const cos = Math.cos(deltaAngle);
    const sin = Math.sin(deltaAngle);

    for (let i = 0; i < currentCorners.length; i++) {
        const dx = currentCorners[i].x - centroid.x;
        const dy = currentCorners[i].y - centroid.y;
        currentCorners[i].x = centroid.x + dx * cos - dy * sin;
        currentCorners[i].y = centroid.y + dx * sin + dy * cos;
    }
}

// Helper to check if point is near bottom-right corner of shed
function isNearShedResizeHandle(pos) {
    if (!currentShed) return false;
    const halfW = currentShed.width / 2;
    const halfH = currentShed.height / 2;
    const handleX = currentShed.x + halfW;
    const handleY = currentShed.y + halfH;

    const dx = pos.x - handleX;
    const dy = pos.y - handleY;
    // 20px threshold for easier grabbing
    return (dx * dx + dy * dy) < 400;
}

// Helper to check if point is near rotation handle (top-center of shed)
function isNearShedRotateHandle(pos) {
    if (!currentShed) return false;
    const halfH = currentShed.height / 2;

    // Handle is at top-center, 15 pixels above the shed (in rotated coordinates)
    // Transform mouse position to shed-local coordinates
    const dx = pos.x - currentShed.x;
    const dy = pos.y - currentShed.y;
    const cos = Math.cos(-currentShed.rotation);
    const sin = Math.sin(-currentShed.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Check if near the rotation handle position
    const handleY = -halfH - 15;
    const distSq = localX * localX + (localY - handleY) * (localY - handleY);
    return distSq < 225; // ~15px threshold
}

function isNearHouseRotateHandle(pos) {
    if (!currentHouse) return false;
    const halfH = currentHouse.height / 2;
    const angle = currentHouse.rotation || 0;

    const dx = pos.x - currentHouse.x;
    const dy = pos.y - currentHouse.y;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const handleY = -halfH - 15;
    const distSq = localX * localX + (localY - handleY) * (localY - handleY);
    return distSq < 225;
}

// Check if point is near whiteout rotate handle (returns index or -1)
function getWhiteoutRotateHandleIndex(pos) {
    for (let i = whiteoutRegions.length - 1; i >= 0; i--) {
        const region = whiteoutRegions[i];
        const halfH = region.height / 2;
        const angle = region.rotation || 0;

        const dx = pos.x - region.x;
        const dy = pos.y - region.y;
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        const handleY = -halfH - 15;
        const distSq = localX * localX + (localY - handleY) * (localY - handleY);
        if (distSq < 225) return i;
    }
    return -1;
}

// Check if point is inside any whiteout region (returns index or -1)
function getWhiteoutAtPoint(pos) {
    for (let i = whiteoutRegions.length - 1; i >= 0; i--) {
        const region = whiteoutRegions[i];
        const angle = region.rotation || 0;

        // Transform point to region's local coordinates
        const dx = pos.x - region.x;
        const dy = pos.y - region.y;
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        // Check if within bounds
        if (Math.abs(localX) <= region.width / 2 && Math.abs(localY) <= region.height / 2) {
            return i;
        }
    }
    return -1;
}

function setShadowLabelMode(nextMode) {
    isShadowLabelMode = Boolean(nextMode);
    if (!btnShadowLabel) return;
    btnShadowLabel.classList.toggle('active', isShadowLabelMode);
    btnShadowLabel.setAttribute('aria-pressed', String(isShadowLabelMode));
}

function addShadowLabelAt(pos) {
    const x = clamp(pos.x, 0, IMAGE_SIZE);
    const y = clamp(pos.y, 0, IMAGE_SIZE);
    shadowLabels.push({ x, y, text: SHADOW_LABEL_TEXT });
    return shadowLabels.length - 1;
}

function getShadowLabelHitIndex(pos) {
    if (!shadowLabels || shadowLabels.length === 0) return -1;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return -1;

    const naturalW = satelliteImg?.naturalWidth || IMAGE_SIZE;
    const naturalH = satelliteImg?.naturalHeight || IMAGE_SIZE;
    const scaleX = (naturalW / IMAGE_SIZE) || 1;
    const scaleY = (naturalH / IMAGE_SIZE) || 1;
    const safeScale = (Number.isFinite(scale) && scale > 0) ? scale : 1;

    const fontSize = 12 / safeScale;
    const padX = 8 / safeScale;
    const padY = 5 / safeScale;
    const lineGap = 2 / safeScale;

    ctx.save();
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;

    for (let i = shadowLabels.length - 1; i >= 0; i--) {
        const label = shadowLabels[i];
        if (!label) continue;
        const text = label.text || SHADOW_LABEL_TEXT;
        const lines = String(text).split('\n');
        const textW = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * fontSize + (lines.length - 1) * lineGap;
        const boxW = (textW + padX * 2) / scaleX;
        const boxH = (textH + padY * 2) / scaleY;
        const left = label.x - boxW / 2;
        const top = label.y - boxH / 2;

        if (pos.x >= left && pos.x <= left + boxW && pos.y >= top && pos.y <= top + boxH) {
            ctx.restore();
            return i;
        }
    }

    ctx.restore();
    return -1;
}

// Mouse event handlers
let isResizingShed = false;
let isRotatingShed = false;

overlayCanvas.addEventListener('mousedown', (e) => {
    if (!currentCorners) return;
    const pos = getMousePos(e);

    // Reference Line Drawing/Dragging
    if (isDrawingReferenceLine) {
        if (!referenceLineStartPoint) {
            referenceLineStartPoint = pos;
        } else {
            customReferenceLine = { p1: referenceLineStartPoint, p2: pos };
            setReferenceLineMode(false);
        }
        drawBoundary(currentCorners);
        e.preventDefault();
        return;
    }
    if (customReferenceLine) {
        const hitP1 = (Math.hypot(pos.x - customReferenceLine.p1.x, pos.y - customReferenceLine.p1.y) * scale) < 20;
        const hitP2 = (Math.hypot(pos.x - customReferenceLine.p2.x, pos.y - customReferenceLine.p2.y) * scale) < 20;
        if (hitP1) {
            isDraggingReferenceEndpoint = true;
            draggedReferenceEndpoint = 'p1';
            isPanning = false;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            e.preventDefault();
            return;
        } else if (hitP2) {
            isDraggingReferenceEndpoint = true;
            draggedReferenceEndpoint = 'p2';
            isPanning = false;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            e.preventDefault();
            return;
        }
    }

    // Labeled Line Drawing/Dragging
    if (isDrawingLabeledLine) {
        if (!labeledLineStartPoint) {
            labeledLineStartPoint = pos;
        } else {
            captureUndoState();
            const newLine = {
                id: Date.now(),
                p1: labeledLineStartPoint,
                p2: pos,
                label: pendingLabeledLineLabel || 'Line'
            };
            customLabeledLines.push(newLine);
            setLabeledLineMode(false);
            updateLabeledLinesListUI();
        }
        drawBoundary(currentCorners);
        e.preventDefault();
        return;
    }

    // Check for labeled line endpoint dragging
    for (const line of customLabeledLines) {
        const hitP1 = (Math.hypot(pos.x - line.p1.x, pos.y - line.p1.y) * scale) < 20;
        const hitP2 = (Math.hypot(pos.x - line.p2.x, pos.y - line.p2.y) * scale) < 20;
        if (hitP1) {
            isDraggingLabeledLineEndpoint = true;
            draggedLabeledLine = { line, endpoint: 'p1' };
            isPanning = false;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            e.preventDefault();
            return;
        } else if (hitP2) {
            isDraggingLabeledLineEndpoint = true;
            draggedLabeledLine = { line, endpoint: 'p2' };
            isPanning = false;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            e.preventDefault();
            return;
        }
    }

    if (isHouseSelectMode) {
        isSelectingHouse = true;
        houseSelectStart = pos;
        houseSelectEnd = pos;
        isPanning = false;
        overlayCanvas.classList.remove('cursor-pan-grabbing');
        overlayCanvas.style.cursor = 'crosshair';
        drawBoundary(currentCorners);
        return;
    }

    // Whiteout mode - check for color picking, rotation/drag/new selection
    if (isWhiteoutMode) {
        // Check if in color picking mode
        if (isPickingWhiteoutColor) {
            const color = sampleColorFromImage(pos);
            if (color) {
                applyPickedColor(color);
            } else {
                // Reset picker if sampling failed
                isPickingWhiteoutColor = false;
                const btn = document.getElementById('popup-pick-color');
                if (btn) {
                    btn.textContent = '🎨 Pick Color';
                    btn.classList.remove('active');
                }
            }
            return;
        }

        // Check if clicking on rotate handle of selected whiteout
        if (selectedWhiteoutIndex !== -1) {
            const rotateIdx = getWhiteoutRotateHandleIndex(pos);
            if (rotateIdx === selectedWhiteoutIndex) {
                isRotatingWhiteout = true;
                isPanning = false;
                overlayCanvas.classList.remove('cursor-pan-grabbing');
                overlayCanvas.style.cursor = 'grabbing';
                drawBoundary(currentCorners);
                return;
            }
        }

        // Check if clicking on an existing whiteout region
        const hitIdx = getWhiteoutAtPoint(pos);
        if (hitIdx !== -1) {
            selectedWhiteoutIndex = hitIdx;
            isDraggingWhiteout = true;
            const region = whiteoutRegions[hitIdx];
            whiteoutDragOffset = { x: pos.x - region.x, y: pos.y - region.y };
            isPanning = false;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            overlayCanvas.style.cursor = 'move';
            drawBoundary(currentCorners);
            return;
        }

        // Start new whiteout selection
        selectedWhiteoutIndex = -1; // Deselect
        isSelectingWhiteout = true;
        whiteoutSelectStart = pos;
        whiteoutSelectEnd = pos;
        isPanning = false;
        overlayCanvas.classList.remove('cursor-pan-grabbing');
        overlayCanvas.style.cursor = 'crosshair';
        drawBoundary(currentCorners);
        return;
    }

    // Shadow labels (add/drag)
    if (isShadowLabelMode) {
        const idx = addShadowLabelAt(pos);
        isDraggingShadowLabel = true;
        dragShadowLabelIndex = idx;
        shadowLabelDragOffset = { x: 0, y: 0 };
        setShadowLabelMode(false);
        overlayCanvas.style.cursor = 'move';
        drawBoundary(currentCorners);
        return;
    }

    const hitShadowIdx = getShadowLabelHitIndex(pos);
    if (hitShadowIdx !== -1) {
        isDraggingShadowLabel = true;
        dragShadowLabelIndex = hitShadowIdx;
        shadowLabelDragOffset = {
            x: shadowLabels[hitShadowIdx].x - pos.x,
            y: shadowLabels[hitShadowIdx].y - pos.y
        };
        overlayCanvas.style.cursor = 'move';
        return;
    }

    // 0. Check boundary rotation handle (center)
    if (isNearBoundaryRotateHandle(pos)) {
        isRotatingBoundary = true;
        const centroid = getBoundaryCentroid(currentCorners);
        boundaryRotationStart = Math.atan2(pos.y - centroid.y, pos.x - centroid.x);
        overlayCanvas.style.cursor = 'grab';
        return;
    }

    // 1. Check shed rotation handle (only for selected structure)
    if (isNearShedRotateHandle(pos)) {
        isRotatingShed = true;
        overlayCanvas.style.cursor = 'grab';
        return;
    }

    // 1.5 Check house rotation handle
    if (isNearHouseRotateHandle(pos)) {
        isRotatingHouse = true;
        overlayCanvas.style.cursor = 'grab';
        return;
    }

    // 2. Check if clicking on any structure (selects it and starts drag)
    const clickedStructIdx = findStructureAtPoint(pos);
    if (clickedStructIdx >= 0) {
        // Select this structure
        if (selectedStructureIndex !== clickedStructIdx) {
            selectedStructureIndex = clickedStructIdx;
            syncCurrentShed();
            updateStructuresListUI();
            updateShedPopupState();
            drawBoundary(currentCorners);
        }
        isDraggingShed = true;
        dragStartPos = pos;
        overlayCanvas.style.cursor = 'move';
        return;
    }

    // 2.5 Check house body
    if (currentHouse && isPointInHouse(pos)) {
        isDraggingHouse = true;
        dragStartPos = pos;
        overlayCanvas.style.cursor = 'move';
        return;
    }

    // 3. Check corners
    dragIndex = findNearCorner(pos, currentCorners);
    if (dragIndex !== -1) {
        isDragging = true;
        overlayCanvas.style.cursor = 'grabbing';
        return;
    }

    // 3.5. Check edge midpoints - drag entire edge
    const edgeIdx = findNearEdgeMidpoint(pos, currentCorners);
    if (edgeIdx !== -1) {
        isDraggingEdge = true;
        dragEdgeIndex = edgeIdx;
        edgeDragStart = pos;
        overlayCanvas.style.cursor = 'move';
        return;
    }

    // 4. Check if inside boundary polygon - drag entire boundary
    if (isPointInPolygon(pos, currentCorners)) {
        isDraggingBoundary = true;
        dragStartPos = pos;
        overlayCanvas.style.cursor = 'move';
        return;
    }

    // 5. Clicking on blank area (outside all interactive elements)
    // Close popups when clicking on truly blank area
    closeAllPopups();

    // Pan the map (only when Pan Mode is active)
    if (isPanMode) {
        isPanning = true;
        panStart = { x: e.clientX - panX, y: e.clientY - panY };
        overlayCanvas.classList.add('cursor-pan-grabbing');
    }
});

overlayCanvas.addEventListener('mousemove', (e) => {
    if (!currentCorners) return;

    if (isPanning) {
        panX = e.clientX - panStart.x;
        panY = e.clientY - panStart.y;
        updateScaleTransform();
        return;
    }

    const pos = getMousePos(e);

    // Reference Line Preview/Drag
    if (isDrawingReferenceLine) {
        referenceLineCurrentPoint = pos;
        drawBoundary(currentCorners);
        // Don't change cursor here, logic in btn click sets it to crosshair
        // e.preventDefault(); // Don't block entirely, maybe we want hover effects? But drawing...
        return;
    }
    if (isDraggingReferenceEndpoint && customReferenceLine) {
        if (draggedReferenceEndpoint === 'p1') customReferenceLine.p1 = pos;
        else customReferenceLine.p2 = pos;
        drawBoundary(currentCorners);
        e.preventDefault();
        return;
    }

    // Cursor hover for Reference Line endpoints
    if (customReferenceLine && !isDragging && !isPanning) {
        const hitP1 = (Math.hypot(pos.x - customReferenceLine.p1.x, pos.y - customReferenceLine.p1.y) * scale) < 20;
        const hitP2 = (Math.hypot(pos.x - customReferenceLine.p2.x, pos.y - customReferenceLine.p2.y) * scale) < 20;
        if (hitP1 || hitP2) {
            overlayCanvas.style.cursor = 'move';
        }
    }

    // Labeled Line preview while drawing
    if (isDrawingLabeledLine && labeledLineStartPoint) {
        labeledLineCurrentPoint = pos;
        drawBoundary(currentCorners);
        return;
    }

    // Labeled Line endpoint dragging
    if (isDraggingLabeledLineEndpoint && draggedLabeledLine) {
        if (draggedLabeledLine.endpoint === 'p1') draggedLabeledLine.line.p1 = pos;
        else draggedLabeledLine.line.p2 = pos;
        drawBoundary(currentCorners);
        e.preventDefault();
        return;
    }

    // Cursor hover for Labeled Line endpoints
    if (customLabeledLines.length > 0 && !isDragging && !isPanning) {
        for (const line of customLabeledLines) {
            const hitP1 = (Math.hypot(pos.x - line.p1.x, pos.y - line.p1.y) * scale) < 20;
            const hitP2 = (Math.hypot(pos.x - line.p2.x, pos.y - line.p2.y) * scale) < 20;
            if (hitP1 || hitP2) {
                overlayCanvas.style.cursor = 'move';
                break;
            }
        }
    }

    if (isDraggingShadowLabel && dragShadowLabelIndex !== -1) {
        const label = shadowLabels[dragShadowLabelIndex];
        if (label) {
            label.x = clamp(pos.x + shadowLabelDragOffset.x, 0, IMAGE_SIZE);
            label.y = clamp(pos.y + shadowLabelDragOffset.y, 0, IMAGE_SIZE);
            drawBoundary(currentCorners);
        }
        return;
    }

    if (isSelectingHouse) {
        houseSelectEnd = pos;
        drawBoundary(currentCorners);
        return;
    }

    if (isSelectingWhiteout) {
        whiteoutSelectEnd = pos;
        drawBoundary(currentCorners);
        return;
    }

    // Whiteout rotation
    if (isRotatingWhiteout && selectedWhiteoutIndex !== -1) {
        const region = whiteoutRegions[selectedWhiteoutIndex];
        const dx = pos.x - region.x;
        const dy = pos.y - region.y;
        const rotation = Math.atan2(dy, dx) + Math.PI / 2;
        region.rotation = rotation;
        drawBoundary(currentCorners);
        return;
    }

    // Whiteout dragging
    if (isDraggingWhiteout && selectedWhiteoutIndex !== -1) {
        const region = whiteoutRegions[selectedWhiteoutIndex];
        region.x = pos.x - whiteoutDragOffset.x;
        region.y = pos.y - whiteoutDragOffset.y;
        drawBoundary(currentCorners);
        return;
    }

    // Boundary rotation
    if (isRotatingBoundary) {
        const centroid = getBoundaryCentroid(currentCorners);
        const currentAngle = Math.atan2(pos.y - centroid.y, pos.x - centroid.x);
        const deltaAngle = currentAngle - boundaryRotationStart;
        rotateBoundaryByDelta(deltaAngle);
        boundaryRotationStart = currentAngle;
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        return;
    }

    if (isRotatingShed) {
        // Calculate angle from shed center to mouse
        const dx = pos.x - currentShed.x;
        const dy = pos.y - currentShed.y;
        // Add PI/2 offset because handle is at top (negative Y in local coords)
        const rawRotation = Math.atan2(dy, dx) + Math.PI / 2;
        let rotation = rawRotation;
        if (isSnapMode && currentCorners) {
            const fenceAngle = getNearestBoundaryEdgeAngle({ x: currentShed.x, y: currentShed.y }, currentCorners);
            const snapped = snapAngleToFenceLines(rawRotation, fenceAngle);
            const diff = Math.abs(normalizeAngleRad(rawRotation - snapped));
            const snapThreshold = 8 * Math.PI / 180;
            if (diff < snapThreshold) rotation = snapped;
        }
        currentShed.rotation = rotation;
        drawBoundary(currentCorners);
        return;
    }

    if (isRotatingHouse && currentHouse) {
        const dx = pos.x - currentHouse.x;
        const dy = pos.y - currentHouse.y;
        const rawRotation = Math.atan2(dy, dx) + Math.PI / 2;
        let rotation = rawRotation;
        if (isSnapMode && currentCorners) {
            const fenceAngle = getNearestBoundaryEdgeAngle({ x: currentHouse.x, y: currentHouse.y }, currentCorners);
            const snapped = snapAngleToFenceLines(rawRotation, fenceAngle);
            const diff = Math.abs(normalizeAngleRad(rawRotation - snapped));
            const snapThreshold = 8 * Math.PI / 180;
            if (diff < snapThreshold) rotation = snapped;
        }
        currentHouse.rotation = rotation;
        drawBoundary(currentCorners);
        return;
    }

    if (isDraggingShed) {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        currentShed.x += dx;
        currentShed.y += dy;
        dragStartPos = pos;
        drawBoundary(currentCorners);
        return;
    }

    if (isDraggingHouse && currentHouse) {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        currentHouse.x += dx;
        currentHouse.y += dy;
        dragStartPos = pos;
        drawBoundary(currentCorners);
        return;
    }

    // Edge dragging - move both corners of the edge
    if (isDraggingEdge && dragEdgeIndex !== -1) {
        const dx = pos.x - edgeDragStart.x;
        const dy = pos.y - edgeDragStart.y;

        // Move both corners of this edge by the delta
        const j = (dragEdgeIndex + 1) % currentCorners.length;
        currentCorners[dragEdgeIndex].x += dx;
        currentCorners[dragEdgeIndex].y += dy;
        currentCorners[j].x += dx;
        currentCorners[j].y += dy;

        edgeDragStart = pos;
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        return;
    }

    // Boundary dragging - shift all corners by the same amount
    if (isDraggingBoundary) {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        for (let i = 0; i < currentCorners.length; i++) {
            currentCorners[i].x += dx;
            currentCorners[i].y += dy;
        }
        dragStartPos = pos;
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        return;
    }

    if (isDragging && dragIndex !== -1) {
        // Update corner position
        let newPos = { x: pos.x, y: pos.y };
        if (isSnapMode) {
            newPos = applySnap(pos, currentCorners, dragIndex);
        }
        currentCorners[dragIndex] = newPos;
        drawBoundary(currentCorners, dragIndex);
        updateMeasurementsFromCorners();
    } else {
        // Cursors
        if (isHouseSelectMode) {
            overlayCanvas.style.cursor = 'crosshair';
        } else if (isWhiteoutMode) {
            // Check for whiteout rotate handle or region
            const rotateIdx = getWhiteoutRotateHandleIndex(pos);
            const hitIdx = getWhiteoutAtPoint(pos);
            if (rotateIdx !== -1 && rotateIdx === selectedWhiteoutIndex) {
                overlayCanvas.style.cursor = 'grab';
            } else if (hitIdx !== -1) {
                overlayCanvas.style.cursor = 'move';
            } else {
                overlayCanvas.style.cursor = 'crosshair';
            }
        } else if (isShadowLabelMode) {
            overlayCanvas.style.cursor = 'crosshair';
        } else if (getShadowLabelHitIndex(pos) !== -1) {
            overlayCanvas.style.cursor = 'move';
        } else if (isNearShedRotateHandle(pos) || isNearHouseRotateHandle(pos)) {
            overlayCanvas.style.cursor = 'grab';
        } else if (currentShed && isPointInShed(pos)) {
            overlayCanvas.style.cursor = 'move';
        } else if (currentHouse && isPointInHouse(pos)) {
            overlayCanvas.style.cursor = 'move';
        } else {
            const nearIdx = findNearCorner(pos, currentCorners);
            if (nearIdx !== -1) {
                overlayCanvas.style.cursor = 'grab';
            } else if (isPointInPolygon(pos, currentCorners)) {
                overlayCanvas.style.cursor = 'move'; // Inside boundary = can drag whole thing
            } else {
                overlayCanvas.style.cursor = 'default';
            }
        }

        if (!isDraggingShed && !isDraggingHouse && !isDraggingBoundary && !isRotatingShed && !isRotatingHouse) {
            const nearIdx = findNearCorner(pos, currentCorners);
            drawBoundary(currentCorners, nearIdx);
        }
    }
});

overlayCanvas.addEventListener('mouseup', () => {
    // Capture undo state if something was being modified
    const wasModifying = isDragging || isDraggingShed || isDraggingHouse || isDraggingBoundary ||
        isDraggingEdge || isRotatingShed || isRotatingHouse || isRotatingBoundary ||
        isDraggingReferenceEndpoint || isDraggingLabeledLineEndpoint ||
        isDraggingShadowLabel || isDraggingWhiteout || isRotatingWhiteout;
    if (wasModifying) {
        captureUndoState();
    }

    isDraggingReferenceEndpoint = false;
    draggedReferenceEndpoint = null;
    isDraggingLabeledLineEndpoint = false;
    draggedLabeledLine = null;
    finishHouseSelection(true);
    finishWhiteoutSelection(true);
    isDragging = false;
    isDraggingShed = false;
    isDraggingHouse = false;
    isDraggingShadowLabel = false;
    dragShadowLabelIndex = -1;
    isDraggingBoundary = false;
    isDraggingEdge = false;
    dragEdgeIndex = -1;
    isRotatingShed = false;
    isRotatingHouse = false;
    isRotatingBoundary = false;
    isRotatingWhiteout = false;
    isDraggingWhiteout = false;
    dragIndex = -1;

    // Stop Panning
    isPanning = false;
    overlayCanvas.classList.remove('cursor-pan-grabbing');

    overlayCanvas.style.cursor = 'grab';
});

overlayCanvas.addEventListener('mouseleave', () => {
    finishHouseSelection(false);
    finishWhiteoutSelection(false);
    isDraggingLabeledLineEndpoint = false;
    draggedLabeledLine = null;
    if (isDragging || isDraggingShed || isDraggingHouse || isDraggingShadowLabel || isResizingShed || isRotatingShed || isRotatingHouse) {
        isDragging = false;
        isDraggingShed = false;
        isDraggingHouse = false;
        isDraggingShadowLabel = false;
        dragShadowLabelIndex = -1;
        isResizingShed = false;
        isRotatingShed = false;
        isRotatingHouse = false;
        isRotatingWhiteout = false;
        isDraggingWhiteout = false;
        dragIndex = -1;
    }
    if (currentCorners) {
        drawBoundary(currentCorners, -1);
    }
});

// Touch event handlers for mobile
function getTouchPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    return getInteractionPos(touch.clientX, touch.clientY);
}

// Helper to find if a point is close to a line segment
function isPointOnLine(pos, p1, p2, threshold = 20) {
    const dist = Math.abs((p2.y - p1.y) * pos.x - (p2.x - p1.x) * pos.y + p2.x * p1.y - p2.y * p1.x) /
        Math.sqrt(Math.pow(p2.y - p1.y, 2) + Math.pow(p2.x - p1.x, 2));

    if (dist > threshold) return false;

    // Check if point is within the segment bounds
    const minX = Math.min(p1.x, p2.x) - threshold;
    const maxX = Math.max(p1.x, p2.x) + threshold;
    const minY = Math.min(p1.y, p2.y) - threshold;
    const maxY = Math.max(p1.y, p2.y) + threshold;

    return pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
}

// Double click to remove shed/house or corners
overlayCanvas.addEventListener('dblclick', (e) => {
    if (!currentCorners) return;
    const pos = getMousePos(e);

    const shadowIdx = getShadowLabelHitIndex(pos);
    if (shadowIdx !== -1) {
        shadowLabels.splice(shadowIdx, 1);
        drawBoundary(currentCorners);
        return;
    }

    // 0. Remove shed if clicked
    if (currentShed && isPointInShed(pos)) {
        currentShed = null;
        updateShedButtons();
        drawBoundary(currentCorners);
        return;
    }

    // 0.5 Remove house if clicked
    if (currentHouse && isPointInHouse(pos)) {
        currentHouse = null;
        updateHouseButtons();
        drawBoundary(currentCorners);
        return;
    }

    // 1. Try to remove a corner
    const cornerIndex = findNearCorner(pos, currentCorners);
    if (cornerIndex !== -1) {
        if (currentCorners.length > 3) {
            currentCorners.splice(cornerIndex, 1);
            drawBoundary(currentCorners);
            updateMeasurementsFromCorners();
        }
        return;
    }

    // 2. Try to add a corner on a line
    for (let i = 0; i < currentCorners.length; i++) {
        const j = (i + 1) % currentCorners.length;
        if (isPointOnLine(pos, currentCorners[i], currentCorners[j])) {
            currentCorners.splice(j, 0, { x: pos.x, y: pos.y });
            drawBoundary(currentCorners);
            updateMeasurementsFromCorners();
            return;
        }
    }
});

// Mobile Double-Tap Detection
let lastTapTime = 0;
overlayCanvas.addEventListener('touchstart', (e) => {
    if (!currentCorners) return;

    // PINCH ZOOM START
    if (e.touches.length === 2) {
        isPanning = false; // Cancel pan if converting to pinch
        initialPinchDistance = getPinchDistance(e);
        lastScale = scale;
        e.preventDefault();
        return;
    }

    // Get position for corner/shed checks (needed before pan decision)
    const pos = getTouchPos(e);

    if (isHouseSelectMode) {
        isSelectingHouse = true;
        houseSelectStart = pos;
        houseSelectEnd = pos;
        isPanning = false;
        overlayCanvas.classList.remove('cursor-pan-grabbing');
        e.preventDefault();
        drawBoundary(currentCorners);
        return;
    }

    if (isWhiteoutMode) {
        // Check if in color picking mode
        if (isPickingWhiteoutColor) {
            const color = sampleColorFromImage(pos);
            if (color) {
                applyPickedColor(color);
            } else {
                // Reset picker if sampling failed
                isPickingWhiteoutColor = false;
                const btn = document.getElementById('popup-pick-color');
                if (btn) {
                    btn.textContent = '🎨 Pick Color';
                    btn.classList.remove('active');
                }
            }
            e.preventDefault();
            return;
        }

        // Check if touching rotate handle of selected whiteout
        if (selectedWhiteoutIndex !== -1) {
            const rotateIdx = getWhiteoutRotateHandleIndex(pos);
            if (rotateIdx === selectedWhiteoutIndex) {
                isRotatingWhiteout = true;
                isPanning = false;
                overlayCanvas.classList.remove('cursor-pan-grabbing');
                e.preventDefault();
                drawBoundary(currentCorners);
                return;
            }
        }

        // Check if touching an existing whiteout region
        const hitIdx = getWhiteoutAtPoint(pos);
        if (hitIdx !== -1) {
            selectedWhiteoutIndex = hitIdx;
            isDraggingWhiteout = true;
            const region = whiteoutRegions[hitIdx];
            whiteoutDragOffset = { x: pos.x - region.x, y: pos.y - region.y };
            isPanning = false;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            e.preventDefault();
            drawBoundary(currentCorners);
            return;
        }

        // Start new whiteout selection
        selectedWhiteoutIndex = -1; // Deselect
        isSelectingWhiteout = true;
        whiteoutSelectStart = pos;
        whiteoutSelectEnd = pos;
        isPanning = false;
        overlayCanvas.classList.remove('cursor-pan-grabbing');
        e.preventDefault();
        drawBoundary(currentCorners);
        return;
    }

    // Shadow labels (add/drag)
    if (isShadowLabelMode) {
        const idx = addShadowLabelAt(pos);
        isDraggingShadowLabel = true;
        dragShadowLabelIndex = idx;
        shadowLabelDragOffset = { x: 0, y: 0 };
        setShadowLabelMode(false);
        e.preventDefault();
        drawBoundary(currentCorners);
        return;
    }

    const hitShadowIdx = getShadowLabelHitIndex(pos);
    if (hitShadowIdx !== -1) {
        isDraggingShadowLabel = true;
        dragShadowLabelIndex = hitShadowIdx;
        shadowLabelDragOffset = {
            x: shadowLabels[hitShadowIdx].x - pos.x,
            y: shadowLabels[hitShadowIdx].y - pos.y
        };
        e.preventDefault();
        return;
    }

    const insideBoundary = isPointInPolygon(pos, currentCorners);

    // Dynamic threshold for corner detection
    // Dynamic threshold for corner detection - INCREASED for better mobile touch accuracy
    const screenThreshold = insideBoundary ? 38 : 60; // Smaller when inside so dragging moves the whole shape
    const wrapperRatio = (mapWrapper.offsetWidth > 0) ? (IMAGE_SIZE / mapWrapper.offsetWidth) : 1;
    const hitThreshold = (screenThreshold / scale) * wrapperRatio;
    const edgeScreenThreshold = 24; // Smaller so mid-edge resize doesn't "steal" inside-drags
    const edgeHitThreshold = (edgeScreenThreshold / scale) * wrapperRatio;

    // PRIORITY: Corners + rotation handle (disambiguate so the rotate handle is usable on touch).
    const rotateScreenThreshold = 45;
    const rotateHitThreshold = (rotateScreenThreshold / scale) * wrapperRatio;

    // Check corners first, but don't return yet (rotate handle can be closer).
    const nearCorner = findNearCorner(pos, currentCorners, hitThreshold);

    // If touch is closer to the rotate handle than the bottom-right corner, rotate.
    let brIndex = 0;
    let maxSum = -Infinity;
    for (let i = 0; i < currentCorners.length; i++) {
        const sum = currentCorners[i].x + currentCorners[i].y;
        if (sum > maxSum) {
            maxSum = sum;
            brIndex = i;
        }
    }

    const brCorner = currentCorners[brIndex];
    const handleOffset = 20;
    const handleX = brCorner.x + handleOffset;
    const handleY = brCorner.y + handleOffset;

    const dxHandle = pos.x - handleX;
    const dyHandle = pos.y - handleY;
    const rotateHit = (dxHandle * dxHandle + dyHandle * dyHandle) < (rotateHitThreshold * rotateHitThreshold);

    if (rotateHit && (nearCorner === -1 || nearCorner === brIndex)) {
        if (nearCorner === brIndex) {
            const dxCorner = pos.x - brCorner.x;
            const dyCorner = pos.y - brCorner.y;
            const cornerDistSq = dxCorner * dxCorner + dyCorner * dyCorner;
            const handleDistSq = dxHandle * dxHandle + dyHandle * dyHandle;

            if (handleDistSq < cornerDistSq) {
                isRotatingBoundary = true;
                const centroid = getBoundaryCentroid(currentCorners);
                boundaryRotationStart = Math.atan2(pos.y - centroid.y, pos.x - centroid.x);
                e.preventDefault();
                return;
            }
        } else {
            isRotatingBoundary = true;
            const centroid = getBoundaryCentroid(currentCorners);
            boundaryRotationStart = Math.atan2(pos.y - centroid.y, pos.x - centroid.x);
            e.preventDefault();
            return;
        }
    }

    // Corner drag (even in Pan Mode, corners can be dragged!)
    if (nearCorner !== -1) {
        dragIndex = nearCorner;
        isDragging = true;
        // CRITICAL FIX: explicitly dragging corner, ensure no ghost mouse events
        e.preventDefault();
        return;
    }

    // Check edge midpoints
    const edgeIdx = findNearEdgeMidpoint(pos, currentCorners, edgeHitThreshold);
    if (edgeIdx !== -1) {
        isDraggingEdge = true;
        dragEdgeIndex = edgeIdx;
        edgeDragStart = pos;
        e.preventDefault();
        return;
    }

    // Checking drag shed/house/boundary here to prevent pan if hitting them
    if (isNearShedRotateHandle(pos) ||
        (currentShed && isPointInShed(pos)) ||
        isNearHouseRotateHandle(pos) ||
        (currentHouse && isPointInHouse(pos)) ||
        insideBoundary) {
        // Let the standard logic fall through or handle here, but definitely prevent PAN
        // Double-tap logic below handles the actual action trigger, but we prevent PAN here
        // Actually, wait. Double tap logic needs to run. 
        // If we return here, double tap won't fire.
    }

    // Pan Mode - drag to pan (only if NOT on a corner, edge, or rotation handle)
    // AND NOT inside the polygon if dragging boundary is allowed?
    // Mobile UX: If you touch inside the polygon, do you drag it or pan?
    // Current Desktop behavior: Inside polygon = Move Cursor.
    // So on mobile, touching inside should probably Drag Polygon, NOT Pan.

    // Explicitly check if we are hitting distinct interactive elements.
    const isHittingInteractive =
        nearCorner !== -1 ||
        edgeIdx !== -1 ||
        rotateHit ||
        isNearShedRotateHandle(pos) ||
        (currentShed && isPointInShed(pos)) ||
        isNearHouseRotateHandle(pos) ||
        (currentHouse && isPointInHouse(pos)) ||
        insideBoundary;

    if (isPanMode && !isHittingInteractive) {
        const touch = e.touches[0];
        isPanning = true;
        panStart = { x: touch.clientX - panX, y: touch.clientY - panY };
        overlayCanvas.classList.add('cursor-pan-grabbing');
        e.preventDefault(); // Prevent page scroll and ghost mouse events while panning.
        return;
    }

    // If we are hitting something interactive, we fall through to the double-tap and drag logic below.
    // BUT we must ensure we don't accidentally start panning in the fallthrough?
    // Panning is only set above. So we are safe.

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    // pos already declared above

    // Double tap detected (< 300ms)
    if (tapLength < 300 && tapLength > 0) {
        e.preventDefault();

        // 0. Remove shed if double-tapped
        if (currentShed && isPointInShed(pos)) {
            currentShed = null;
            updateShedButtons();
            drawBoundary(currentCorners);
            return;
        }

        // 0.5 Remove house if double-tapped
        if (currentHouse && isPointInHouse(pos)) {
            currentHouse = null;
            updateHouseButtons();
            drawBoundary(currentCorners);
            return;
        }

        // Calculate dynamic threshold
        const screenThreshold = 40;
        const wrapperRatio = (mapWrapper.offsetWidth > 0) ? (IMAGE_SIZE / mapWrapper.offsetWidth) : 1;
        const hitThreshold = (screenThreshold / scale) * wrapperRatio;

        // 1. Try to remove a corner
        const cornerIndex = findNearCorner(pos, currentCorners, hitThreshold);
        if (cornerIndex !== -1) {
            if (currentCorners.length > 3) {
                currentCorners.splice(cornerIndex, 1);
                drawBoundary(currentCorners);
                updateMeasurementsFromCorners();
            }
            return;
        }

        // 2. Try to add a corner on a line
        for (let i = 0; i < currentCorners.length; i++) {
            const j = (i + 1) % currentCorners.length;
            if (isPointOnLine(pos, currentCorners[i], currentCorners[j], 40)) {
                currentCorners.splice(j, 0, { x: pos.x, y: pos.y });
                drawBoundary(currentCorners);
                updateMeasurementsFromCorners();
                return;
            }
        }
    }

    lastTapTime = currentTime;

    // Start Drag/Resize Actions (Single Tap)

    // Check rotation handle first (only for selected structure)
    if (isNearShedRotateHandle(pos)) {
        isRotatingShed = true;
        e.preventDefault();
        return;
    }

    if (isNearHouseRotateHandle(pos)) {
        isRotatingHouse = true;
        e.preventDefault();
        return;
    }

    // Check if tapping on any structure (selects it and starts drag)
    const clickedStructIdx = findStructureAtPoint(pos);
    if (clickedStructIdx >= 0) {
        // Select this structure
        if (selectedStructureIndex !== clickedStructIdx) {
            selectedStructureIndex = clickedStructIdx;
            syncCurrentShed();
            updateStructuresListUI();
            updateShedPopupState();
            drawBoundary(currentCorners);
        }
        isDraggingShed = true;
        dragStartPos = pos;
        e.preventDefault();
        return;
    }

    if (currentHouse && isPointInHouse(pos)) {
        isDraggingHouse = true;
        dragStartPos = pos;
        e.preventDefault();
        return;
    }

    // Corner check already done above - this is now only for boundary/shed/house checks
    // (using the pos variable declared earlier)

    // Check if inside boundary polygon - drag entire boundary
    if (insideBoundary) {
        isDraggingBoundary = true;
        dragStartPos = pos;
        e.preventDefault();
    }
}, { passive: false });

overlayCanvas.addEventListener('touchmove', (e) => {
    if (!currentCorners) return;
    e.preventDefault();

    // PINCH ZOOM MOVE
    if (e.touches.length === 2 && initialPinchDistance) {
        const dist = getPinchDistance(e);
        if (dist > 0) {
            const zoomFactor = dist / initialPinchDistance;
            scale = lastScale * zoomFactor;
            // Clamp scale
            if (scale < 0.1) scale = 0.1; // Lowered to support large properties
            if (scale > 5) scale = 5;
            updateScaleTransform();
        }
        return;
    }

    if (isPanning) {
        const touch = e.touches[0];
        panX = touch.clientX - panStart.x;
        panY = touch.clientY - panStart.y;
        updateScaleTransform();
        return;
    }

    const pos = getTouchPos(e);

    if (isDraggingShadowLabel && dragShadowLabelIndex !== -1) {
        const label = shadowLabels[dragShadowLabelIndex];
        if (label) {
            label.x = clamp(pos.x + shadowLabelDragOffset.x, 0, IMAGE_SIZE);
            label.y = clamp(pos.y + shadowLabelDragOffset.y, 0, IMAGE_SIZE);
            drawBoundary(currentCorners);
        }
        return;
    }

    if (isSelectingHouse) {
        houseSelectEnd = pos;
        drawBoundary(currentCorners);
        return;
    }

    if (isSelectingWhiteout) {
        whiteoutSelectEnd = pos;
        drawBoundary(currentCorners);
        return;
    }

    // Whiteout rotation
    if (isRotatingWhiteout && selectedWhiteoutIndex !== -1) {
        const region = whiteoutRegions[selectedWhiteoutIndex];
        const dx = pos.x - region.x;
        const dy = pos.y - region.y;
        const rotation = Math.atan2(dy, dx) + Math.PI / 2;
        region.rotation = rotation;
        drawBoundary(currentCorners);
        return;
    }

    // Whiteout dragging
    if (isDraggingWhiteout && selectedWhiteoutIndex !== -1) {
        const region = whiteoutRegions[selectedWhiteoutIndex];
        region.x = pos.x - whiteoutDragOffset.x;
        region.y = pos.y - whiteoutDragOffset.y;
        drawBoundary(currentCorners);
        return;
    }

    // Boundary rotation
    if (isRotatingBoundary) {
        const centroid = getBoundaryCentroid(currentCorners);
        const currentAngle = Math.atan2(pos.y - centroid.y, pos.x - centroid.x);
        const deltaAngle = currentAngle - boundaryRotationStart;
        rotateBoundaryByDelta(deltaAngle);
        boundaryRotationStart = currentAngle;
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        return;
    }

    if (isRotatingShed && currentShed) {
        // Calculate angle from shed center to touch
        const dx = pos.x - currentShed.x;
        const dy = pos.y - currentShed.y;
        const rawRotation = Math.atan2(dy, dx) + Math.PI / 2;
        let rotation = rawRotation;
        if (isSnapMode && currentCorners) {
            const fenceAngle = getNearestBoundaryEdgeAngle({ x: currentShed.x, y: currentShed.y }, currentCorners);
            const snapped = snapAngleToFenceLines(rawRotation, fenceAngle);
            const diff = Math.abs(normalizeAngleRad(rawRotation - snapped));
            const snapThreshold = 8 * Math.PI / 180;
            if (diff < snapThreshold) rotation = snapped;
        }
        currentShed.rotation = rotation;
        drawBoundary(currentCorners);
        return;
    }

    if (isRotatingHouse && currentHouse) {
        const dx = pos.x - currentHouse.x;
        const dy = pos.y - currentHouse.y;
        const rawRotation = Math.atan2(dy, dx) + Math.PI / 2;
        let rotation = rawRotation;
        if (isSnapMode && currentCorners) {
            const fenceAngle = getNearestBoundaryEdgeAngle({ x: currentHouse.x, y: currentHouse.y }, currentCorners);
            const snapped = snapAngleToFenceLines(rawRotation, fenceAngle);
            const diff = Math.abs(normalizeAngleRad(rawRotation - snapped));
            const snapThreshold = 8 * Math.PI / 180;
            if (diff < snapThreshold) rotation = snapped;
        }
        currentHouse.rotation = rotation;
        drawBoundary(currentCorners);
        return;
    }

    if (isDraggingShed && currentShed) {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        currentShed.x += dx;
        currentShed.y += dy;
        dragStartPos = pos;
        drawBoundary(currentCorners);
        return;
    }

    if (isDraggingHouse && currentHouse) {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        currentHouse.x += dx;
        currentHouse.y += dy;
        dragStartPos = pos;
        drawBoundary(currentCorners);
        return;
    }

    // Edge dragging - move both corners of the edge
    if (isDraggingEdge && dragEdgeIndex !== -1) {
        const dx = pos.x - edgeDragStart.x;
        const dy = pos.y - edgeDragStart.y;

        const j = (dragEdgeIndex + 1) % currentCorners.length;
        currentCorners[dragEdgeIndex].x += dx;
        currentCorners[dragEdgeIndex].y += dy;
        currentCorners[j].x += dx;
        currentCorners[j].y += dy;

        edgeDragStart = pos;
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        return;
    }

    // Boundary dragging - shift all corners
    if (isDraggingBoundary) {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        for (let i = 0; i < currentCorners.length; i++) {
            currentCorners[i].x += dx;
            currentCorners[i].y += dy;
        }
        dragStartPos = pos;
        drawBoundary(currentCorners);
        updateMeasurementsFromCorners();
        return;
    }

    if (!isDragging || dragIndex === -1) return;

    let newPos = { x: pos.x, y: pos.y };
    if (isSnapMode) {
        newPos = applySnap(pos, currentCorners, dragIndex);
    }
    currentCorners[dragIndex] = newPos;
    drawBoundary(currentCorners, dragIndex);
    updateMeasurementsFromCorners();
}, { passive: false });

overlayCanvas.addEventListener('mouseup', () => {
    finishHouseSelection(true);
    finishWhiteoutSelection(true);
    isDragging = false;
    isDraggingShed = false;
    isDraggingHouse = false;
    isDraggingShadowLabel = false;
    dragShadowLabelIndex = -1;
    isResizingShed = false;
    isRotatingShed = false;
    isRotatingHouse = false;
    isRotatingWhiteout = false;
    isDraggingWhiteout = false;
    dragIndex = -1;

    // Stop Panning
    isPanning = false;
    if (isPanMode) {
        overlayCanvas.classList.remove('cursor-pan-grabbing');
    }

    overlayCanvas.style.cursor = 'default';
});

overlayCanvas.addEventListener('mouseleave', () => {
    finishHouseSelection(false);
    finishWhiteoutSelection(false);
    isDragging = false;
    isDraggingShed = false;
    isDraggingHouse = false;
    isDraggingShadowLabel = false;
    dragShadowLabelIndex = -1;
    isDraggingBoundary = false;
    isDraggingEdge = false;
    dragEdgeIndex = -1;
    isRotatingShed = false;
    isRotatingHouse = false;
    isRotatingBoundary = false;
    isRotatingWhiteout = false;
    isDraggingWhiteout = false;
    dragIndex = -1;
    isPanning = false; // Also stop panning on leave
    overlayCanvas.classList.remove('cursor-pan-grabbing');
});

overlayCanvas.addEventListener('touchend', (e) => {
    // Check if fingers lifted (end pinch)
    if (e.touches.length < 2) {
        initialPinchDistance = null;
    }

    if (isSelectingHouse) {
        houseSelectEnd = getTouchPos(e);
        finishHouseSelection(true);
    }

    if (isSelectingWhiteout) {
        whiteoutSelectEnd = getTouchPos(e);
        finishWhiteoutSelection(true);
    }

    isDragging = false;
    isDraggingShed = false;
    isDraggingHouse = false;
    isDraggingShadowLabel = false;
    dragShadowLabelIndex = -1;
    isDraggingBoundary = false;
    isDraggingEdge = false;
    dragEdgeIndex = -1;
    isRotatingShed = false;
    isRotatingHouse = false;
    isRotatingBoundary = false;
    isRotatingWhiteout = false;
    isDraggingWhiteout = false;
    dragIndex = -1;
    isPanning = false;
    overlayCanvas.classList.remove('cursor-pan-grabbing');
    if (currentCorners) drawBoundary(currentCorners, -1);
});

overlayCanvas.addEventListener('touchcancel', () => {
    finishHouseSelection(false);
    finishWhiteoutSelection(false);
    isDragging = false;
    isDraggingShed = false;
    isDraggingHouse = false;
    isDraggingShadowLabel = false;
    dragShadowLabelIndex = -1;
    isDraggingBoundary = false;
    isDraggingEdge = false;
    dragEdgeIndex = -1;
    isRotatingShed = false;
    isRotatingHouse = false;
    isRotatingBoundary = false;
    isRotatingWhiteout = false;
    isDraggingWhiteout = false;
    dragIndex = -1;
    isPanning = false;
    overlayCanvas.classList.remove('cursor-pan-grabbing');
});

// Old shed/house button event listeners removed - now handled by popup buttons

// Display measurements
function displayMeasurements(corners, feetPerPixel) {
    measurementGrid.innerHTML = '';

    // Calculate each side
    const sides = [];
    for (let i = 0; i < corners.length; i++) {
        const j = (i + 1) % corners.length;
        const distance = calculateDistance(corners[i], corners[j], feetPerPixel);
        sides.push(distance);
    }

    // Display each side with editable input
    sides.forEach((distance, index) => {
        const item = document.createElement('div');
        item.className = 'measurement-item';

        // Dynamic labeling
        const label = `Line ${index + 1}`;

        item.innerHTML = `
            <div class="measurement-label">${label}</div>
            <div class="measurement-value">
                <input type="number" 
                    class="measurement-input" 
                    data-side-index="${index}" 
                    value="${distance.toFixed(2)}" 
                    min="1" 
                    step="0.01"
                />
                <span class="measurement-unit">ft</span>
            </div>
            <div class="measurement-subvalue">
                ${formatFeetInches(distance)}
            </div>
        `;
        measurementGrid.appendChild(item);

        // Add event listener for manual length editing
        const input = item.querySelector('.measurement-input');
        input.addEventListener('change', (e) => {
            const newFeet = parseFloat(e.target.value);
            if (isNaN(newFeet) || newFeet <= 0) {
                e.target.value = distance.toFixed(2);
                return;
            }
            updateSideLength(index, newFeet, feetPerPixel);
        });
    });

    // Calculate and display area
    const area = calculatePolygonArea(corners, feetPerPixel);
    const acres = area / 43560;

    areaDisplay.innerHTML = `
        <div class="area-value">
            Estimated Area: ${Math.round(area).toLocaleString()} sq ft (${acres.toFixed(3)} acres)
        </div>
    `;
}

// Update a specific side's length by moving its second corner
function updateSideLength(sideIndex, newFeet, feetPerPixel) {
    if (!currentCorners || currentCorners.length < 2) return;

    // For orthogonal 4-corner boundaries, keep the rectangle "square" when editing lengths
    // by moving the whole opposing edge (so the shape stays a true rectangle).
    if (currentCorners.length === 4 && isOrthogonalQuad(currentCorners)) {
        updateOrthogonalQuadSideLength(sideIndex, newFeet, feetPerPixel);
        return;
    }

    const i = sideIndex;
    const j = (sideIndex + 1) % currentCorners.length;

    const p1 = currentCorners[i];
    const p2 = currentCorners[j];

    // Calculate current edge direction
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const currentLen = Math.sqrt(dx * dx + dy * dy);

    if (currentLen === 0) return;

    // Calculate new length in pixels
    const newPixels = newFeet / feetPerPixel;

    // Move p2 to the new position along the same direction
    const unitX = dx / currentLen;
    const unitY = dy / currentLen;

    currentCorners[j] = {
        x: p1.x + unitX * newPixels,
        y: p1.y + unitY * newPixels
    };

    // Redraw and update measurements
    drawBoundary(currentCorners);
    updateMeasurementsFromCorners();
    queueShedClearancesUpdate();
}

function isOrthogonalQuad(corners, toleranceDeg = 2) {
    if (!corners || corners.length !== 4) return false;
    const tol = Math.sin((toleranceDeg * Math.PI) / 180);

    const edges = [];
    const lens = [];
    for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len = Math.hypot(vx, vy);
        if (!Number.isFinite(len) || len < 1e-6) return false;
        edges.push({ x: vx, y: vy });
        lens.push(len);
    }

    // Adjacent edges ~ perpendicular (dot ~ 0)
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const dot = (edges[i].x * edges[j].x + edges[i].y * edges[j].y) / (lens[i] * lens[j]);
        if (Math.abs(dot) > tol) return false;
    }

    // Opposite edges ~ parallel (cross ~ 0)
    for (let i = 0; i < 2; i++) {
        const j = i + 2;
        const cross = (edges[i].x * edges[j].y - edges[i].y * edges[j].x) / (lens[i] * lens[j]);
        if (Math.abs(cross) > tol) return false;
    }

    return true;
}

function updateOrthogonalQuadSideLength(sideIndex, newFeet, feetPerPixel) {
    if (!currentCorners || currentCorners.length !== 4) return;

    const i = sideIndex;
    const j = (sideIndex + 1) % 4;
    const k = (j + 1) % 4;

    const p1 = currentCorners[i];
    const p2 = currentCorners[j];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const currentLen = Math.hypot(dx, dy);
    if (!Number.isFinite(currentLen) || currentLen === 0) return;

    const newPixels = newFeet / feetPerPixel;
    if (!Number.isFinite(newPixels) || newPixels <= 0) return;

    const unitX = dx / currentLen;
    const unitY = dy / currentLen;

    const delta = newPixels - currentLen;
    const deltaX = unitX * delta;
    const deltaY = unitY * delta;

    currentCorners[j] = { x: currentCorners[j].x + deltaX, y: currentCorners[j].y + deltaY };
    currentCorners[k] = { x: currentCorners[k].x + deltaX, y: currentCorners[k].y + deltaY };

    drawBoundary(currentCorners);
    updateMeasurementsFromCorners();
    queueShedClearancesUpdate();
}

// Main analysis function
async function analyzeProperty() {
    const address = addressInput.value.trim();

    // Validation
    if (!address) {
        showError('Please enter a property address.');
        return;
    }

    showError('');
    resultsSection.style.display = 'grid';
    // Show bottom action bar
    const bottomBar = document.getElementById('bottom-action-bar');
    if (bottomBar) bottomBar.style.display = 'flex';
    setLoading(true, 'Finding address...');

    try {
        // Step 1: Geocode address (via Netlify Function)
        const location = await geocodeAddress(address);
        const { lat, lng } = location;

        // Step 2: Get satellite image URL (via Netlify Function)
        setLoading(true, 'Fetching satellite image...');
        const imageUrl = await getSatelliteImageUrl(lat, lng);

        // Load image for display
        satelliteImg.src = imageUrl;
        await new Promise((resolve, reject) => {
            satelliteImg.onload = resolve;
            satelliteImg.onerror = () => reject(new Error('Failed to load satellite image.'));
        });

        // Reset planning objects when analyzing a new property
        currentShed = null;
        currentHouse = null;
        shadowLabels = [];
        whiteoutRegions = [];
        setWhiteoutMode(false);
        isShadowLabelMode = false;
        if (btnShadowLabel) {
            btnShadowLabel.classList.remove('active');
            btnShadowLabel.setAttribute('aria-pressed', 'false');
        }
        updateShedButtons();
        setHouseSelectMode(false);

        // Step 3: Create default rectangle
        currentCorners = createDefaultRectangle(lat);
        currentLatitude = lat;

        // Step 4: Draw overlay
        drawBoundary(currentCorners);

        // Step 5: Display initial measurements
        const feetPerPixel = getFeetPerPixel(lat);
        displayMeasurements(currentCorners, feetPerPixel);

        // Step 6: Initial view
        // Desktop behavior is kept intact; touch devices get a "fill the screen" view.
        const isTouchDevice = window.matchMedia
            ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
            : ('ontouchstart' in window);

        if (isTouchDevice) {
            // Wait a frame so the touch-only square layout is settled before measuring.
            await new Promise(requestAnimationFrame);

            // Mobile: start with the full image visible (no crop) so the boundary isn't off-screen.
            scale = 1;
            panX = 0;
            panY = 0;
            isPanning = false;

            // Pan is always enabled.
            isPanMode = true;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            overlayCanvas.style.cursor = 'grab';

            updateScaleTransform();
            drawBoundary(currentCorners);
        } else {
            scale = 1;
            panX = 0;
            panY = 0;
            isPanning = false;

            // Pan is always enabled.
            isPanMode = true;
            overlayCanvas.classList.remove('cursor-pan-grabbing');
            overlayCanvas.style.cursor = 'grab';
            updateScaleTransform();
            drawBoundary(currentCorners);
        }

        setLoading(false);

    } catch (error) {
        console.error('Analysis error:', error);
        setLoading(false);
        showError(error.message);
    }
}

// Get current measurements as text
function getMeasurementsText() {
    if (!currentCorners || !currentLatitude) return '';

    const feetPerPixel = getFeetPerPixel(currentLatitude);
    const sides = [];
    for (let i = 0; i < currentCorners.length; i++) {
        const j = (i + 1) % currentCorners.length;
        const distance = calculateDistance(currentCorners[i], currentCorners[j], feetPerPixel);
        sides.push(Math.round(distance));
    }

    const area = calculatePolygonArea(currentCorners, feetPerPixel);
    const acres = area / 43560;

    let text = 'Property Measurements:\n';
    sides.forEach((dist, i) => {
        const label = `Line ${i + 1}`;
        text += `- ${label}: ${dist} ft\n`;
    });
    text += `- Total Area: ${Math.round(area).toLocaleString()} sq ft (${acres.toFixed(3)} acres)`;

    return text;
}

// Capture screenshot of satellite image with overlay
async function captureScreenshot() {
    // Create a temporary canvas to combine image and overlay
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = IMAGE_SIZE;
    tempCanvas.height = IMAGE_SIZE;
    const ctx = tempCanvas.getContext('2d');

    // Draw the satellite image
    ctx.drawImage(satelliteImg, 0, 0, IMAGE_SIZE, IMAGE_SIZE);

    // Draw the overlay on top
    ctx.drawImage(overlayCanvas, 0, 0, IMAGE_SIZE, IMAGE_SIZE);

    // Convert to blob
    return new Promise((resolve) => {
        tempCanvas.toBlob(resolve, 'image/png');
    });
}

// Initial max zoom fits the boundary
function zoomToFit(outsideBufferFeet = 0) {
    if (!currentCorners || currentCorners.length === 0) return;

    const bufferFeet = Number(outsideBufferFeet) || 0;
    let bufferPx = 0;
    if (bufferFeet > 0 && Number.isFinite(currentLatitude)) {
        const feetPerPixel = getFeetPerPixel(currentLatitude);
        if (Number.isFinite(feetPerPixel) && feetPerPixel > 0) bufferPx = bufferFeet / feetPerPixel;
    }

    // 1. Calculate bounding box of boundary
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    currentCorners.forEach(c => {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
    });

    // 2. Include planning objects in bounding box if they exist
    const planningObjects = [currentShed].filter(Boolean);
    for (const obj of planningObjects) {
        const points = getRotatedRectCorners(obj);
        for (const p of points) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        }
    }

    if (bufferPx > 0) {
        minX -= bufferPx;
        maxX += bufferPx;
        minY -= bufferPx;
        maxY += bufferPx;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    // Prevent division by zero
    if (contentW <= 0 || contentH <= 0) return;

    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    const isTouchDevice = window.matchMedia
        ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
        : ('ontouchstart' in window);

    // Mobile: fit logic must account for the fact the image is already CSS-scaled to the container width.
    if (isTouchDevice) {
        const viewport = document.querySelector('.image-container') || mapWrapper.parentElement || mapWrapper;
        const viewportW = (viewport && (viewport.clientWidth || viewport.offsetWidth)) || 0;
        const viewportH = (viewport && (viewport.clientHeight || viewport.offsetHeight)) || 0;
        if (viewportW === 0 || viewportH === 0) return;

        const layoutW = mapWrapper.clientWidth || mapWrapper.offsetWidth || viewportW;
        if (layoutW === 0) return;
        const baseScale = layoutW / IMAGE_SIZE; // CSS px per 1 image pixel (640-space) before transform.

        const padding = Math.round(Math.min(60, Math.max(16, Math.min(viewportW, viewportH) * 0.08)));

        const scaleX = (viewportW - padding * 2) / (contentW * baseScale);
        const scaleY = (viewportH - padding * 2) / (contentH * baseScale);
        let targetScale = Math.min(scaleX, scaleY);
        targetScale = Math.min(Math.max(targetScale, 0.1), 5); // Max zoom 5x, min 0.1x (supports very large properties)

        const targetPanX = (viewportW / 2) - (contentCenterX * baseScale * targetScale);
        const targetPanY = (viewportH / 2) - (contentCenterY * baseScale * targetScale);

        scale = targetScale;
        panX = targetPanX;
        panY = targetPanY;

        updateScaleTransform();
        return;
    }

    // Desktop: fit-to-view while accounting for the base CSS scale (map may be wider than 640px now).
    const viewport = document.querySelector('.image-container') || mapWrapper.parentElement || mapWrapper;
    const viewportW = (viewport && (viewport.clientWidth || viewport.offsetWidth)) || 0;
    const viewportH = (viewport && (viewport.clientHeight || viewport.offsetHeight)) || 0;
    if (viewportW === 0 || viewportH === 0) return;

    const layoutW = mapWrapper.clientWidth || mapWrapper.offsetWidth || viewportW;
    if (layoutW === 0) return;
    const baseScale = layoutW / IMAGE_SIZE; // CSS px per 1 image pixel (640-space) before transform.

    const padding = 80;
    const scaleX = (viewportW - padding * 2) / (contentW * baseScale);
    const scaleY = (viewportH - padding * 2) / (contentH * baseScale);
    let targetScale = Math.min(scaleX, scaleY);
    targetScale = Math.min(Math.max(targetScale, 0.1), 5); // Supports very large properties

    const targetPanX = (viewportW / 2) - (contentCenterX * baseScale * targetScale);
    const targetPanY = (viewportH / 2) - (contentCenterY * baseScale * targetScale);

    scale = targetScale;
    panX = targetPanX;
    panY = targetPanY;

    updateScaleTransform();
}

// 2D affine matrix helpers (Canvas-style: a,b,c,d,e,f).
function matMul(m1, m2) {
    return {
        a: m1.a * m2.a + m1.c * m2.b,
        b: m1.b * m2.a + m1.d * m2.b,
        c: m1.a * m2.c + m1.c * m2.d,
        d: m1.b * m2.c + m1.d * m2.d,
        e: m1.a * m2.e + m1.c * m2.f + m1.e,
        f: m1.b * m2.e + m1.d * m2.f + m1.f
    };
}

function matTranslate(tx, ty) {
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

function matScale(sx, sy) {
    return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

function matRotate(rad) {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

function matApply(m, x, y) {
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function matApplyVec(m, x, y) {
    return { x: m.a * x + m.c * y, y: m.b * x + m.d * y };
}

function getTransformScale(m) {
    const sx = Math.hypot(m?.a ?? 0, m?.b ?? 0);
    const sy = Math.hypot(m?.c ?? 0, m?.d ?? 0);
    const v = (sx + sy) / 2;
    return Number.isFinite(v) && v > 0 ? v : 1;
}

function getMapWrapperTransformMatrix(viewportW, viewportH) {
    const w = Number(viewportW) || 0;
    const h = Number(viewportH) || 0;
    const cx = w / 2;
    const cy = h / 2;

    const zoom = Number(scale);
    const theta = Number(mapRotation);
    const tx = Number(panX);
    const ty = Number(panY);

    // CSS: translate(pan) translate(center) rotate(theta) translate(-center) scale(zoom)
    // Matrix application order (right-to-left): scale -> -center -> rotate -> center -> pan.
    return matMul(
        matTranslate(tx, ty),
        matMul(
            matTranslate(cx, cy),
            matMul(
                matRotate(theta),
                matMul(matTranslate(-cx, -cy), matScale(zoom, zoom))
            )
        )
    );
}

async function captureCurrentMapViewport(options = {}) {
    const src = satelliteImg.currentSrc || satelliteImg.src;
    if (!src) return null;
    const {
        maskOutside = false,
        corners = currentCorners,
        includeOverlay = true,
        output = 'square' // 'square' | 'viewport'
    } = options;

    // Use a CORS-enabled image element for canvas drawing (prevents tainted canvases on mobile).
    let corsImg = null;
    try {
        corsImg = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image for capture'));
            img.src = src;
        });
    } catch (e) {
        console.warn('Viewport capture image load failed:', e);
        return null;
    }

    const sourceW = corsImg.naturalWidth || IMAGE_SIZE;
    const sourceH = corsImg.naturalHeight || IMAGE_SIZE;

    const viewport = document.querySelector('.image-container') || mapWrapper.parentElement || mapWrapper;
    const viewportW = (viewport && (viewport.clientWidth || viewport.offsetWidth)) || 0;
    const viewportH = (viewport && (viewport.clientHeight || viewport.offsetHeight)) || 0;
    if (viewportW === 0 || viewportH === 0) return null;

    const layoutW = satelliteImg?.offsetWidth || mapWrapper?.clientWidth || mapWrapper?.offsetWidth || viewportW;
    const layoutH = satelliteImg?.offsetHeight || mapWrapper?.clientHeight || mapWrapper?.offsetHeight || viewportH;
    if (layoutW === 0 || layoutH === 0) return null;

    // Render at either square source resolution (static map) or viewport aspect ratio (desktop-friendly).
    const out = document.createElement('canvas');
    if (output === 'viewport') {
        const aspect = viewportW / viewportH;
        if (Number.isFinite(aspect) && aspect > 0) {
            if (aspect >= 1) {
                out.width = sourceW;
                out.height = Math.max(1, Math.round(sourceW / aspect));
            } else {
                out.height = sourceH;
                out.width = Math.max(1, Math.round(sourceH * aspect));
            }
        } else {
            out.width = sourceW;
            out.height = sourceH;
        }
    } else {
        out.width = sourceW;
        out.height = sourceH;
    }
    const ctx = out.getContext('2d');

    if (!ctx) return null;

    // Draw the current viewport exactly as displayed (pan/zoom/rotation), but without UI chrome.
    const viewportToOut = matScale(out.width / viewportW, out.height / viewportH);
    const wrapperToViewport = getMapWrapperTransformMatrix(viewportW, viewportH);
    const imageToLocal = matScale(layoutW / IMAGE_SIZE, layoutH / IMAGE_SIZE);
    const imageToOut = matMul(viewportToOut, matMul(wrapperToViewport, imageToLocal)); // IMAGE_SIZE -> out px

    const sourceToImage = matScale(IMAGE_SIZE / sourceW, IMAGE_SIZE / sourceH);
    const sourceToOut = matMul(imageToOut, sourceToImage); // source px -> out px

    // Default background is white for clean exports (and to avoid transparent edges when panned/rotated).
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(sourceToOut.a, sourceToOut.b, sourceToOut.c, sourceToOut.d, sourceToOut.e, sourceToOut.f);
    ctx.drawImage(corsImg, 0, 0);
    ctx.restore();

    // Draw whiteout regions on the export canvas (in IMAGE_SIZE coords, then transformed).
    if (whiteoutRegions && whiteoutRegions.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        if (ctx.resetTransform) ctx.resetTransform();
        else ctx.setTransform(1, 0, 0, 1, 0, 0);

        for (const region of whiteoutRegions) {
            if (!region) continue;
            const poly = getRotatedRectCorners(region);
            if (!poly || poly.length < 3) continue;
            const pts = poly.map((p) => matApply(imageToOut, p.x, p.y));
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fillStyle = region.fillColor || 'white';
            ctx.fill();
        }
        ctx.restore();
    }

    // Compute the polygon in output coordinates (used for masking and export layout).
    let polygon = null;
    if (corners && corners.length >= 3) {
        polygon = corners.map((c) => matApply(imageToOut, c.x, c.y));
    }

    // Optionally apply a white mask outside the selected boundary.
    // Note: For export we can draw labels/boundary AFTER masking so they don't get clipped.
    if (maskOutside && polygon && polygon.length >= 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        if (ctx.resetTransform) ctx.resetTransform();
        else ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.beginPath();
        ctx.rect(0, 0, out.width, out.height);
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(polygon[i].x, polygon[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = 'white';
        try {
            ctx.fill('evenodd');
        } catch {
            ctx.fill();
        }
        ctx.restore();
    }

    if (includeOverlay) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.setTransform(sourceToOut.a, sourceToOut.b, sourceToOut.c, sourceToOut.d, sourceToOut.e, sourceToOut.f);
        ctx.drawImage(overlayCanvas, 0, 0);
        ctx.restore();
    }

    return { canvas: out, polygon, transform: imageToOut };
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectIntersectionArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
}

function unionRect(a, b) {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function expandRect(r, pad) {
    return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

function getRectFromPoints(points) {
    if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getCentroid(points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

function computeExportMeasurementLabels({ corners, polygon, feetPerPixel, ctx }) {
    if (!corners || corners.length < 2) return [];
    if (!polygon || polygon.length < 2) return [];
    if (!ctx) return [];

    const n = Math.min(corners.length, polygon.length);
    const centroid = getCentroid(polygon);

    const font = 'bold 14px Inter, Arial, sans-serif';
    const padding = 6;
    const height = 22;
    const gap = 10;

    ctx.save();
    ctx.font = font;

    const labels = [];
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const distanceFt = calculateDistance(corners[i], corners[j], feetPerPixel);
        const text = `${distanceFt.toFixed(1)} ft`;

        const p1 = polygon[i];
        const p2 = polygon[j];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        let nx = -dy;
        let ny = dx;
        const nLen = Math.hypot(nx, ny) || 1;
        nx /= nLen;
        ny /= nLen;

        // Flip normal so it points outward (away from centroid).
        const toMidX = midX - centroid.x;
        const toMidY = midY - centroid.y;
        if (nx * toMidX + ny * toMidY < 0) {
            nx = -nx;
            ny = -ny;
        }

        const textW = ctx.measureText(text).width;
        const width = Math.max(44, Math.ceil(textW + padding * 2));

        // For an axis-aligned rectangle, the extent along the outward normal is:
        // |nx|*(w/2) + |ny|*(h/2). Offset by that + a small gap so the full label sits outside the edge.
        const extent = Math.abs(nx) * (width / 2) + Math.abs(ny) * (height / 2);
        const cx = midX + nx * (extent + gap);
        const cy = midY + ny * (extent + gap);
        const rect = { x: cx - width / 2, y: cy - height / 2, w: width, h: height };

        labels.push({ text, midX, midY, cx, cy, rect });
    }

    ctx.restore();
    return labels;
}

function drawExportBoundary(ctx, polygon, offsetX, offsetY) {
    if (!ctx || !polygon || polygon.length < 2) return;

    const labels = polygon.length === 4
        ? ['FL', 'FR', 'BR', 'BL']
        : polygon.map((_, i) => String(i + 1));

    ctx.save();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Boundary stroke
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(offsetX + polygon[0].x, offsetY + polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(offsetX + polygon[i].x, offsetY + polygon[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Corner points + labels
    ctx.font = 'bold 12px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < polygon.length; i++) {
        const x = offsetX + polygon[i].x;
        const y = offsetY + polygon[i].y;

        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#6366f1';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.fillText(labels[i] || String(i + 1), x, y - 18);
    }

    ctx.restore();
}

function drawExportMeasurementLabels(ctx, labels, offsetX, offsetY) {
    if (!ctx || !labels || labels.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Light leader lines so it's obvious which edge the label belongs to.
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 2;

    for (const label of labels) {
        ctx.beginPath();
        ctx.moveTo(offsetX + label.midX, offsetY + label.midY);
        ctx.lineTo(offsetX + label.cx, offsetY + label.cy);
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(offsetX + label.rect.x, offsetY + label.rect.y, label.rect.w, label.rect.h);

        ctx.fillStyle = '#10b981';
        ctx.fillText(label.text, offsetX + label.cx, offsetY + label.cy);
    }

    ctx.restore();
}

function computeExportShadowLabelBounds({ labels, transform, ctx }) {
    if (!labels || labels.length === 0) return null;
    if (!transform || !ctx) return null;

    const font = 'bold 12px Inter, Arial, sans-serif';
    const padX = 8;
    const padY = 5;
    const lineGap = 2;
    const fontPx = 12;

    ctx.save();
    ctx.font = font;

    let rect = null;
    for (const label of labels) {
        if (!label) continue;
        const text = label.text || SHADOW_LABEL_TEXT;
        const lines = String(text).split('\n');
        const textW = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * fontPx + (lines.length - 1) * lineGap;
        const boxW = Math.ceil(textW + padX * 2);
        const boxH = Math.ceil(textH + padY * 2);

        const p = matApply(transform, label.x, label.y);
        const r = { x: p.x - boxW / 2, y: p.y - boxH / 2, w: boxW, h: boxH };
        rect = rect ? unionRect(rect, r) : r;
    }

    ctx.restore();
    return rect;
}

function drawExportShadowLabels(ctx, labels, transform, offsetX, offsetY) {
    if (!ctx || !labels || labels.length === 0) return;
    if (!transform) return;

    const font = 'bold 12px Inter, Arial, sans-serif';
    const padX = 8;
    const padY = 5;
    const lineGap = 2;
    const fontPx = 12;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;

    for (const label of labels) {
        if (!label) continue;
        const text = label.text || SHADOW_LABEL_TEXT;
        const lines = String(text).split('\n');
        const textW = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * fontPx + (lines.length - 1) * lineGap;
        const boxW = Math.ceil(textW + padX * 2);
        const boxH = Math.ceil(textH + padY * 2);
        const r = Math.min(10, boxH / 2);

        const p = matApply(transform, label.x, label.y);
        const x = offsetX + p.x;
        const y = offsetY + p.y;

        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.roundRect
            ? ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, r)
            : ctx.rect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        let lineY = y - textH / 2 + fontPx / 2;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, lineY + i * (fontPx + lineGap));
        }
    }

    ctx.restore();
}

function computeExportShedBounds({ shed, transform, feetPerPixel, ctx }) {
    if (!shed || !transform || !ctx) return null;

    const center = matApply(transform, shed.x, shed.y);
    const cx = center.x;
    const cy = center.y;
    const angle = shed.rotation || 0;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const axisXImg = { x: cos, y: sin };
    const axisYImg = { x: -sin, y: cos };

    const axisXVec = matApplyVec(transform, axisXImg.x, axisXImg.y);
    const axisYVec = matApplyVec(transform, axisYImg.x, axisYImg.y);
    const axisXLen = Math.hypot(axisXVec.x, axisXVec.y) || 1;
    const axisYLen = Math.hypot(axisYVec.x, axisYVec.y) || 1;
    const axisX = { x: axisXVec.x / axisXLen, y: axisXVec.y / axisXLen };
    const axisY = { x: axisYVec.x / axisYLen, y: axisYVec.y / axisYLen };

    const halfW = (shed.width / 2) * axisXLen;
    const halfH = (shed.height / 2) * axisYLen;

    const shedPoly = getRotatedRectCorners(shed);
    const exportPoly = shedPoly.map((p) => matApply(transform, p.x, p.y));
    let rect = getRectFromPoints(exportPoly);

    const labelText = shed.label || 'STRUCTURE';
    const widthFt = Number.isFinite(feetPerPixel) ? Math.round(shed.width * feetPerPixel) : null;
    const heightFt = Number.isFinite(feetPerPixel) ? Math.round(shed.height * feetPerPixel) : null;
    // Arrow direction should follow the side direction (axisX = width, axisY = height).
    const widthText = Number.isFinite(widthFt) ? formatDimensionArrowText(widthFt, axisX) : '';
    const heightText = Number.isFinite(heightFt) ? formatDimensionArrowText(heightFt, axisY) : '';

    const padX = 8;
    const padY = 5;
    const dimFont = 'bold 14px Inter, Arial, sans-serif';
    const labelFont = 'bold 12px Inter, Arial, sans-serif';
    const gap = 10;

    ctx.save();

    const getBox = (text, font) => {
        ctx.font = font;
        const w = Math.ceil(ctx.measureText(text).width + padX * 2);
        const fontPx = parseInt(String(font).match(/(\d+)px/)?.[1] || '12', 10) || 12;
        const lineGap = 2;
        const lines = String(text).split('\n');
        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * fontPx + (lines.length - 1) * lineGap;
        return { w: Math.ceil(textW + padX * 2), h: Math.ceil(textH + padY * 2) };
    };

    const extentAlong = (box, ux, uy) => Math.abs(ux) * (box.w / 2) + Math.abs(uy) * (box.h / 2);

    let sizeDist = 0;
    let sizeExtent = 0;

    if (widthText) {
        const box = getBox(widthText, dimFont);
        sizeExtent = extentAlong(box, axisY.x, axisY.y);
        sizeDist = halfH + gap + sizeExtent;
        const px = cx + axisY.x * sizeDist;
        const py = cy + axisY.y * sizeDist;
        rect = unionRect(rect, { x: px - box.w / 2, y: py - box.h / 2, w: box.w, h: box.h });
    }

    if (heightText) {
        const box = getBox(heightText, dimFont);
        const extent = extentAlong(box, axisX.x, axisX.y);
        const dist = halfW + gap + extent;
        const px = cx + axisX.x * dist;
        const py = cy + axisX.y * dist;
        rect = unionRect(rect, { x: px - box.w / 2, y: py - box.h / 2, w: box.w, h: box.h });
    }

    if (labelText) {
        const box = getBox(labelText, labelFont);
        const labelExtent = extentAlong(box, axisY.x, axisY.y);
        const labelGap = 8;
        const dist = widthText ? (sizeDist + labelGap + sizeExtent + labelExtent) : (halfH + gap + labelExtent);
        const px = cx + axisY.x * dist;
        const py = cy + axisY.y * dist;
        rect = unionRect(rect, { x: px - box.w / 2, y: py - box.h / 2, w: box.w, h: box.h });
    }

    ctx.restore();
    return rect;
}

function drawExportShed(ctx, shed, transform, polygon, offsetX, offsetY, feetPerPixel) {
    if (!ctx || !shed || !transform) return;

    const center = matApply(transform, shed.x, shed.y);
    const cx = offsetX + center.x;
    const cy = offsetY + center.y;
    const angle = shed.rotation || 0;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const axisXImg = { x: cos, y: sin };
    const axisYImg = { x: -sin, y: cos };

    const axisXVec = matApplyVec(transform, axisXImg.x, axisXImg.y);
    const axisYVec = matApplyVec(transform, axisYImg.x, axisYImg.y);
    const axisXLen = Math.hypot(axisXVec.x, axisXVec.y) || 1;
    const axisYLen = Math.hypot(axisYVec.x, axisYVec.y) || 1;
    const axisX = { x: axisXVec.x / axisXLen, y: axisXVec.y / axisXLen };
    const axisY = { x: axisYVec.x / axisYLen, y: axisYVec.y / axisYLen };
    const halfW = (shed.width / 2) * axisXLen;
    const halfH = (shed.height / 2) * axisYLen;

    const shedPoly = getRotatedRectCorners(shed);
    const exportShedPoly = shedPoly.map((p) => {
        const q = matApply(transform, p.x, p.y);
        return { x: offsetX + q.x, y: offsetY + q.y };
    });
    if (exportShedPoly.length < 3) return;

    // Draw the shed footprint (clip to polygon so it doesn't spill outside the selected area).
    if (polygon && polygon.length >= 3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(offsetX + polygon[0].x, offsetY + polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(offsetX + polygon[i].x, offsetY + polygon[i].y);
        }
        ctx.closePath();
        ctx.clip();
    } else {
        ctx.save();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(exportShedPoly[0].x, exportShedPoly[0].y);
    for (let i = 1; i < exportShedPoly.length; i++) {
        ctx.lineTo(exportShedPoly[i].x, exportShedPoly[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore(); // clip restore

    // Text overlays (no clip) so they're always readable on the white area.
    const labelText = shed.label || 'STRUCTURE';
    const widthFt = Number.isFinite(feetPerPixel) ? Math.round(shed.width * feetPerPixel) : null;
    const heightFt = Number.isFinite(feetPerPixel) ? Math.round(shed.height * feetPerPixel) : null;
    // Arrow direction should follow the side direction (axisX = width, axisY = height).
    const widthText = Number.isFinite(widthFt) ? formatDimensionArrowText(widthFt, axisX) : '';
    const heightText = Number.isFinite(heightFt) ? formatDimensionArrowText(heightFt, axisY) : '';
    const gap = 10;

    const drawPill = (text, x, y, font, fg) => {
        if (!text) return;
        ctx.save();
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const padX = 8;
        const padY = 5;
        const fontPx = parseInt(String(font).match(/(\d+)px/)?.[1] || '12', 10) || 12;
        const lineGap = 2;
        const lines = String(text).split('\n');
        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * fontPx + (lines.length - 1) * lineGap;
        const boxW = Math.ceil(textW + padX * 2);
        const boxH = Math.ceil(textH + padY * 2);
        const r = Math.min(10, boxH / 2);

        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.roundRect
            ? ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, r)
            : ctx.rect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = fg;
        let lineY = y - textH / 2 + fontPx / 2;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, lineY + i * (fontPx + lineGap));
        }
        ctx.restore();
    };

    const getBox = (text, font) => {
        ctx.save();
        ctx.font = font;
        const padX = 8;
        const padY = 5;
        const fontPx = parseInt(String(font).match(/(\d+)px/)?.[1] || '12', 10) || 12;
        const lineGap = 2;
        const lines = String(text).split('\n');
        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const textH = lines.length * fontPx + (lines.length - 1) * lineGap;
        const w = Math.ceil(textW + padX * 2);
        const h = Math.ceil(textH + padY * 2);
        ctx.restore();
        return { w, h };
    };

    const extentAlong = (box, ux, uy) => Math.abs(ux) * (box.w / 2) + Math.abs(uy) * (box.h / 2);

    const labelFont = 'bold 12px Inter, Arial, sans-serif';
    const dimFont = 'bold 14px Inter, Arial, sans-serif';

    let widthDist = 0;
    let widthExtent = 0;

    if (widthText) {
        const box = getBox(widthText, dimFont);
        widthExtent = extentAlong(box, axisY.x, axisY.y);
        widthDist = halfH + gap + widthExtent;
        drawPill(widthText, cx + axisY.x * widthDist, cy + axisY.y * widthDist, dimFont, '#ffffff');
    }

    if (heightText) {
        const box = getBox(heightText, dimFont);
        const heightExtent = extentAlong(box, axisX.x, axisX.y);
        const heightDist = halfW + gap + heightExtent;
        drawPill(heightText, cx + axisX.x * heightDist, cy + axisX.y * heightDist, dimFont, '#ffffff');
    }

    if (labelText) {
        const box = getBox(labelText, labelFont);
        const labelExtent = extentAlong(box, axisY.x, axisY.y);
        const labelGap = 8;
        const dist = widthText ? (widthDist + labelGap + widthExtent + labelExtent) : (halfH + gap + labelExtent);
        drawPill(labelText, cx + axisY.x * dist, cy + axisY.y * dist, labelFont, '#ffffff');
    }
}

// Draw shed distance lines on export image
function drawExportShedDistanceLines(ctx, shed, corners, house, transform, offsetX, offsetY, feetPerPixel) {
    if (!ctx || !shed || !corners || corners.length < 2 || !showShedDistanceLines || !transform) return;

    // Transform shed to polygon in export space
    const shedPoly = getRotatedRectCorners(shed);

    // Transform corners to export space
    const exportCorners = corners.map((c) => {
        const p = matApply(transform, c.x, c.y);
        return { x: offsetX + p.x, y: offsetY + p.y };
    });

    // Transform shed polygon to export space
    const exportShedPoly = shedPoly.map((p) => {
        const q = matApply(transform, p.x, p.y);
        return { x: offsetX + q.x, y: offsetY + q.y };
    });

    // Fence labels
    const fenceLabels = corners.map((_, i) => `Line ${i + 1}`);

    // Draw lines to each fence
    for (let i = 0; i < corners.length; i++) {
        const label = fenceLabels[i];
        if (!isShedClearanceIncluded(label)) continue;

        const j = (i + 1) % corners.length;
        const p1 = exportCorners[i];
        const p2 = exportCorners[j];

        const closest = getClosestPointsBetweenPolygonAndSegment(exportShedPoly, p1, p2);
        if (!closest || closest.distance < 1) continue;

        // Calculate feet using original (non-transformed) coordinates for accuracy
        const origP1 = corners[i];
        const origP2 = corners[j];
        const origClosest = getClosestPointsBetweenPolygonAndSegment(shedPoly, origP1, origP2);
        const feet = origClosest ? origClosest.distance * feetPerPixel : 0;
        if (feet < 0.1) continue;

        // Draw dashed line from shed to fence
        ctx.beginPath();
        ctx.moveTo(closest.polyPoint.x, closest.polyPoint.y);
        ctx.lineTo(closest.segPoint.x, closest.segPoint.y);
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)'; // Orange
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw distance label at midpoint
        const midX = (closest.polyPoint.x + closest.segPoint.x) / 2;
        const midY = (closest.polyPoint.y + closest.segPoint.y) / 2;
        const distText = `${feet.toFixed(1)}'`;

        ctx.font = 'bold 14px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(distText);
        const padX = 6;
        const padY = 4;
        const boxW = metrics.width + padX * 2;
        const boxH = 14 + padY * 2;

        // Background pill
        ctx.fillStyle = 'rgba(251, 146, 60, 0.95)';
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, 4);
            ctx.fill();
        } else {
            ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
        }

        ctx.fillStyle = '#000000';
        ctx.fillText(distText, midX, midY);
    }

    // Draw line to house if present
    if (house && isShedClearanceIncluded('House')) {
        const housePoly = getRotatedRectCorners(house);

        // Transform house polygon to export space
        const exportHousePoly = housePoly.map((p) => {
            const q = matApply(transform, p.x, p.y);
            return { x: offsetX + q.x, y: offsetY + q.y };
        });

        const closest = getClosestPointsBetweenPolygons(exportShedPoly, exportHousePoly);

        if (closest && closest.distance >= 1) {
            // Calculate feet using original coordinates
            const origClosest = getClosestPointsBetweenPolygons(shedPoly, housePoly);
            const feet = origClosest ? origClosest.distance * feetPerPixel : 0;

            if (feet >= 0.1) {
                // Draw dashed line from shed to house
                ctx.beginPath();
                ctx.moveTo(closest.pointA.x, closest.pointA.y);
                ctx.lineTo(closest.pointB.x, closest.pointB.y);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.9)'; // Slate
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw distance label at midpoint
                const midX = (closest.pointA.x + closest.pointB.x) / 2;
                const midY = (closest.pointA.y + closest.pointB.y) / 2;
                const distText = `${feet.toFixed(1)}'`;

                ctx.font = 'bold 14px Inter, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const metrics = ctx.measureText(distText);
                const padX = 6;
                const padY = 4;
                const boxW = metrics.width + padX * 2;
                const boxH = 14 + padY * 2;

                // Background pill
                ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, 4);
                    ctx.fill();
                } else {
                    ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
                }

                ctx.fillStyle = '#000000';
                ctx.fillText(distText, midX, midY);
            }
        }
    }
}

// Draw setback lines on export image
function drawExportSetbackLines(ctx, corners, transform, offsetX, offsetY, feetPerPixel) {
    if (!ctx || !corners || corners.length < 2 || !showSetback || setbackDistance <= 0 || !transform) return;
    if (!Number.isFinite(feetPerPixel) || feetPerPixel <= 0) return;

    // Transform corners to export space
    const exportCorners = corners.map((c) => {
        const p = matApply(transform, c.x, c.y);
        return { x: offsetX + p.x, y: offsetY + p.y };
    });

    const pixelsSetback = setbackDistance / feetPerPixel;

    for (let i = 0; i < corners.length; i++) {
        const j = (i + 1) % corners.length;
        const origP1 = corners[i];
        const origP2 = corners[j];
        const p1 = exportCorners[i];
        const p2 = exportCorners[j];

        const dx0 = origP2.x - origP1.x;
        const dy0 = origP2.y - origP1.y;
        const len0 = Math.hypot(dx0, dy0);
        if (len0 <= 0) continue;

        // Two possible normal directions (in IMAGE_SIZE coords).
        const n1x = -dy0 / len0;
        const n1y = dx0 / len0;
        const n2x = dy0 / len0;
        const n2y = -dx0 / len0;

        // Test which one points inside (in IMAGE_SIZE coords).
        const origMid = { x: origP1.x + dx0 * 0.5, y: origP1.y + dy0 * 0.5 };
        const testPoint1 = { x: origMid.x + n1x * pixelsSetback, y: origMid.y + n1y * pixelsSetback };

        let finalNx, finalNy;
        if (isPointInPolygon(testPoint1, corners)) {
            finalNx = n1x; finalNy = n1y;
        } else {
            finalNx = n2x; finalNy = n2y;
        }

        // Offset vector in export pixels (transform a vector; ignore translation).
        const v = matApplyVec(transform, finalNx * pixelsSetback, finalNy * pixelsSetback);
        const offX = v.x;
        const offY = v.y;

        // Draw setback line (dashed)
        ctx.beginPath();
        ctx.moveTo(p1.x + offX, p1.y + offY);
        ctx.lineTo(p2.x + offX, p2.y + offY);
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw perpendicular arrow with distance label
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const quarterX = p1.x + dx * 0.25;
        const quarterY = p1.y + dy * 0.25;

        const arrowStartX = quarterX;
        const arrowStartY = quarterY;
        const arrowEndX = quarterX + offX;
        const arrowEndY = quarterY + offY;

        // Draw arrow line
        ctx.beginPath();
        ctx.moveTo(arrowStartX, arrowStartY);
        ctx.lineTo(arrowEndX, arrowEndY);
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();

        // Draw arrowhead
        const arrowSize = 6;
        const angle = Math.atan2(arrowEndY - arrowStartY, arrowEndX - arrowStartX);
        ctx.beginPath();
        ctx.moveTo(arrowEndX, arrowEndY);
        ctx.lineTo(arrowEndX - arrowSize * Math.cos(angle - Math.PI / 6), arrowEndY - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(arrowEndX, arrowEndY);
        ctx.lineTo(arrowEndX - arrowSize * Math.cos(angle + Math.PI / 6), arrowEndY - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.stroke();

        // Draw distance label
        const labelX = (arrowStartX + arrowEndX) / 2;
        const labelY = (arrowStartY + arrowEndY) / 2 - 10;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(labelX - 22, labelY - 10, 44, 18);
        ctx.fillStyle = 'rgba(255, 200, 100, 1)';
        ctx.font = 'bold 12px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${setbackDistance}ft`, labelX, labelY);

        ctx.lineWidth = 1;
    }
}

// Draw custom reference line on export image
function drawExportReferenceLine(ctx, shed, transform, offsetX, offsetY, feetPerPixel) {
    if (!ctx || !customReferenceLine || !transform) return;

    // Transform points to export space
    const p1Base = matApply(transform, customReferenceLine.p1.x, customReferenceLine.p1.y);
    const p2Base = matApply(transform, customReferenceLine.p2.x, customReferenceLine.p2.y);
    const p1 = { x: offsetX + p1Base.x, y: offsetY + p1Base.y };
    const p2 = { x: offsetX + p2Base.x, y: offsetY + p2Base.y };

    // Draw dashed line (Purple)
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Endpoints
    const endpointRadius = 6;
    ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    // P1
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, endpointRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // P2
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, endpointRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw "REF LINE" label
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;


    // Draw distance from shed if enabled
    if (shed && showReferenceLineDistance) {
        const shedPoly = getRotatedRectCorners(shed);
        const closest = getClosestPointsBetweenPolygonAndSegment(shedPoly, customReferenceLine.p1, customReferenceLine.p2);

        if (closest && closest.distance > 1) {
            const feet = closest.distance * feetPerPixel;

            // Transform closest points to export space
            const polyBase = matApply(transform, closest.polyPoint.x, closest.polyPoint.y);
            const segBase = matApply(transform, closest.segPoint.x, closest.segPoint.y);
            const polyP = { x: offsetX + polyBase.x, y: offsetY + polyBase.y };
            const segP = { x: offsetX + segBase.x, y: offsetY + segBase.y };

            // Draw distance line
            ctx.beginPath();
            ctx.moveTo(polyP.x, polyP.y);
            ctx.lineTo(segP.x, segP.y);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw label
            const distMidX = (polyP.x + segP.x) / 2;
            const distMidY = (polyP.y + segP.y) / 2;
            const distText = `${feet.toFixed(1)}'`;

            ctx.font = 'bold 12px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const m = ctx.measureText(distText);
            const bw = m.width + 10;
            const bh = 18;

            ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(distMidX - bw / 2, distMidY - bh / 2, bw, bh, 4);
                ctx.fill();
            } else {
                ctx.fillRect(distMidX - bw / 2, distMidY - bh / 2, bw, bh);
            }

            ctx.fillStyle = '#ffffff';
            ctx.fillText(distText, distMidX, distMidY);
        }
    }
}

// Draw custom labeled lines on export image
function drawExportLabeledLines(ctx, transform, offsetX, offsetY, feetPerPixel) {
    if (!ctx || !customLabeledLines.length || !transform) return;

    customLabeledLines.forEach((line) => {
        // Transform points to export space
        const p1Base = matApply(transform, line.p1.x, line.p1.y);
        const p2Base = matApply(transform, line.p2.x, line.p2.y);
        const p1 = { x: offsetX + p1Base.x, y: offsetY + p1Base.y };
        const p2 = { x: offsetX + p2Base.x, y: offsetY + p2Base.y };

        // Draw line (Cyan)
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.stroke();

        // Draw Endpoints
        const endpointRadius = 5;
        ctx.fillStyle = '#06b6d4';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;

        [p1, p2].forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, endpointRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        // Calculate line length and angle
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const origDx = line.p2.x - line.p1.x;
        const origDy = line.p2.y - line.p1.y;
        const lengthPx = Math.hypot(origDx, origDy);
        const lengthFeet = lengthPx * feetPerPixel;
        const angle = Math.atan2(dy, dx);

        // Midpoint for label
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Create label text with measurement
        const labelText = `${line.label} ${lengthFeet.toFixed(1)}'`;

        // Draw rotated label aligned with line
        ctx.save();
        ctx.translate(midX, midY);

        // Flip text if it would be upside down
        let textAngle = angle;
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
            textAngle += Math.PI;
        }
        ctx.rotate(textAngle);

        // Draw label background pill
        const fontSize = 14;
        ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(labelText);
        const padX = 12;
        const padY = 7;
        const boxW = metrics.width + padX * 2;
        const boxH = fontSize + padY * 2;

        // Offset above the line
        const labelOffsetY = -16;

        // Draw dark border/shadow for better visibility
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(-boxW / 2 - 1, labelOffsetY - boxH / 2 - 1, boxW + 2, boxH + 2, 5);
            ctx.fill();
        }

        // Draw main pill background with border
        ctx.fillStyle = '#06b6d4';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(-boxW / 2, labelOffsetY - boxH / 2, boxW, boxH, 4);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(-boxW / 2, labelOffsetY - boxH / 2, boxW, boxH);
        }

        // Draw text with shadow for extra readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillText(labelText, 1, labelOffsetY + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, 0, labelOffsetY);

        ctx.restore();
    });
}

function layoutPromptBox(ctx, prompt, boxW = 280) {
    const padding = 10;
    const title = 'RUN IMAGE GENERATION';
    const titleFont = 'bold 13px Inter, Arial, sans-serif';
    const bodyFont = '12px Inter, Arial, sans-serif';
    const titleHeight = 18;
    const lineHeight = 16;
    const textW = Math.max(1, boxW - padding * 2);

    const wrapLine = (text) => {
        const words = String(text || '').trim().split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > textW && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines;
    };

    ctx.save();
    ctx.font = bodyFont;

    const lines = [];
    const paragraphs = String(prompt || '')
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
    for (let i = 0; i < paragraphs.length; i++) {
        lines.push(...wrapLine(paragraphs[i]));
        if (i < paragraphs.length - 1) lines.push('');
    }

    ctx.restore();

    const boxH = padding + titleHeight + 6 + lines.length * lineHeight + padding;
    return { title, lines, boxW, boxH, padding, titleFont, bodyFont, titleHeight, lineHeight };
}

function choosePromptRect(polyRect, labelRects, promptBox, polygon, gap = 12, options = {}) {
    const bgCanvas = options?.backgroundCanvas || null;
    const bgW = Number(bgCanvas?.width) || 0;
    const bgH = Number(bgCanvas?.height) || 0;
    const bgCtx = (bgCanvas && bgW > 0 && bgH > 0)
        ? (bgCanvas.getContext('2d', { willReadFrequently: true }) || bgCanvas.getContext('2d'))
        : null;
    let canReadBgPixels = Boolean(bgCtx);

    const estimateBackgroundWhiteFraction = (rect) => {
        if (bgW <= 0 || bgH <= 0) return 0;
        const cols = 4;
        const rows = 4;
        let white = 0;
        let total = 0;
        const w = Number(rect?.w) || 0;
        const h = Number(rect?.h) || 0;
        if (w <= 0 || h <= 0) return 0;

        for (let xi = 0; xi < cols; xi++) {
            for (let yi = 0; yi < rows; yi++) {
                const sx = rect.x + ((xi + 0.5) * w) / cols;
                const sy = rect.y + ((yi + 0.5) * h) / rows;
                total++;

                // Samples outside the captured canvas are guaranteed white in the final export.
                if (sx < 0 || sy < 0 || sx >= bgW || sy >= bgH) {
                    white++;
                    continue;
                }

                if (!canReadBgPixels) continue;
                try {
                    const data = bgCtx.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
                    const r = data[0];
                    const g = data[1];
                    const b = data[2];
                    const a = data[3];
                    if (a >= 250 && r >= 252 && g >= 252 && b >= 252) white++;
                } catch (e) {
                    // Tainted canvas (CORS) or browser restriction; fall back to geometry-only placement.
                    canReadBgPixels = false;
                }
            }
        }
        return total > 0 ? (white / total) : 0;
    };

    const rectIsOutsidePolygon = (rect) => {
        if (!polygon || polygon.length < 3) return true;
        const samples = [];
        for (let xi = 0; xi < 3; xi++) {
            for (let yi = 0; yi < 3; yi++) {
                samples.push({
                    x: rect.x + ((xi + 0.5) * rect.w) / 3,
                    y: rect.y + ((yi + 0.5) * rect.h) / 3
                });
            }
        }
        return samples.every((p) => !isPointInPolygon(p, polygon));
    };

    const candidates = [];

    // Try placing the prompt inside the polygon's bounding box (in existing white space),
    // so the export doesn't need to grow.
    const inset = 12;
    const insideCandidates = [
        { x: polyRect.x + inset, y: polyRect.y + inset, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x + polyRect.w - inset - promptBox.boxW, y: polyRect.y + inset, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x + inset, y: polyRect.y + polyRect.h - inset - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x + polyRect.w - inset - promptBox.boxW, y: polyRect.y + polyRect.h - inset - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH }
    ].filter((r) =>
        r.w > 0 &&
        r.h > 0 &&
        r.x >= polyRect.x + inset &&
        r.y >= polyRect.y + inset &&
        r.x + r.w <= polyRect.x + polyRect.w - inset &&
        r.y + r.h <= polyRect.y + polyRect.h - inset
    );
    candidates.push(...insideCandidates);

    candidates.push(
        // Right side
        { x: polyRect.x + polyRect.w + gap, y: polyRect.y, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x + polyRect.w + gap, y: polyRect.y + polyRect.h - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
        // Left side
        { x: polyRect.x - gap - promptBox.boxW, y: polyRect.y, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x - gap - promptBox.boxW, y: polyRect.y + polyRect.h - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
        // Bottom
        { x: polyRect.x, y: polyRect.y + polyRect.h + gap, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x + polyRect.w - promptBox.boxW, y: polyRect.y + polyRect.h + gap, w: promptBox.boxW, h: promptBox.boxH },
        // Top
        { x: polyRect.x, y: polyRect.y - gap - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
        { x: polyRect.x + polyRect.w - promptBox.boxW, y: polyRect.y - gap - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH }
    );

    // If we have a captured canvas, add "dedicated whitespace" candidates that sit just outside it.
    // This guarantees the prompt box won't cover satellite imagery even when masking is disabled.
    if (bgW > 0 && bgH > 0) {
        candidates.push(
            // Below the captured canvas
            { x: polyRect.x, y: bgH + gap, w: promptBox.boxW, h: promptBox.boxH },
            { x: polyRect.x + polyRect.w - promptBox.boxW, y: bgH + gap, w: promptBox.boxW, h: promptBox.boxH },
            // Right of the captured canvas
            { x: bgW + gap, y: polyRect.y, w: promptBox.boxW, h: promptBox.boxH },
            { x: bgW + gap, y: polyRect.y + polyRect.h - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
            // Left of the captured canvas
            { x: -gap - promptBox.boxW, y: polyRect.y, w: promptBox.boxW, h: promptBox.boxH },
            { x: -gap - promptBox.boxW, y: polyRect.y + polyRect.h - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
            // Above the captured canvas
            { x: polyRect.x, y: -gap - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH },
            { x: polyRect.x + polyRect.w - promptBox.boxW, y: -gap - promptBox.boxH, w: promptBox.boxW, h: promptBox.boxH }
        );
    }

    let best = candidates[0] || { x: polyRect.x, y: polyRect.y, w: promptBox.boxW, h: promptBox.boxH };
    let bestWhite = -1;
    let bestOverlap = Infinity;
    let bestArea = Infinity;

    for (const candidate of candidates) {
        if (!candidate || candidate.w <= 0 || candidate.h <= 0) continue;
        if (!rectIsOutsidePolygon(candidate)) continue;

        const overlap = (labelRects || []).reduce((sum, r) => sum + rectIntersectionArea(candidate, r), 0);
        let u = unionRect(polyRect, candidate);
        for (const r of labelRects || []) u = unionRect(u, r);
        const area = Math.max(1, u.w) * Math.max(1, u.h);

        const whiteFrac = estimateBackgroundWhiteFraction(candidate);

        // Prefer to place the prompt on white/background-only space so it doesn't cover imagery.
        // Tie-breakers: avoid label overlap, then minimize total footprint.
        const eps = 1e-6;
        const isBetter =
            (whiteFrac > bestWhite + eps) ||
            (Math.abs(whiteFrac - bestWhite) <= eps && overlap < bestOverlap - eps) ||
            (Math.abs(whiteFrac - bestWhite) <= eps && Math.abs(overlap - bestOverlap) <= eps && area < bestArea - eps);

        if (isBetter) {
            best = candidate;
            bestWhite = whiteFrac;
            bestOverlap = overlap;
            bestArea = area;
        }
    }

    return best;
}

function drawPromptBox(ctx, promptBox, rect, offsetX, offsetY) {
    if (!ctx || !promptBox || !rect) return;

    const x = offsetX + rect.x;
    const y = offsetY + rect.y;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, rect.w, rect.h, 10);
    } else {
        ctx.rect(x, y, rect.w, rect.h);
    }
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    ctx.font = promptBox.titleFont;
    ctx.fillText(promptBox.title, x + promptBox.padding, y + promptBox.padding);

    // Body
    ctx.font = promptBox.bodyFont;
    ctx.fillStyle = '#334155';
    let textY = y + promptBox.padding + promptBox.titleHeight + 6;
    for (const line of promptBox.lines) {
        if (!line) {
            textY += promptBox.lineHeight;
            continue;
        }
        ctx.fillText(line, x + promptBox.padding, textY);
        textY += promptBox.lineHeight;
    }

    ctx.restore();
}

// Export to Gemini
async function exportToGemini() {
    if (!currentCorners) {
        showError('Please analyze a property first.');
        return;
    }

    if (!satelliteImg.src || !satelliteImg.complete) {
        showError('Please wait for the map image to finish loading.');
        return;
    }

    const isTouchDevice = window.matchMedia
        ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
        : ('ontouchstart' in window);
    const isMobileScreen = window.matchMedia
        ? window.matchMedia('(max-width: 900px)').matches
        : (window.innerWidth <= 900);
    const isMobileExport = isTouchDevice && isMobileScreen;

    // Read export options needed for the pre-capture auto-zoom.
    const optOutsideRaw = document.getElementById('opt-outside-ft')?.value;
    let optOutsideFeet = Number.parseFloat(optOutsideRaw);
    if (!Number.isFinite(optOutsideFeet) || optOutsideFeet < 0) optOutsideFeet = 0;

    // Auto-zoom to fit the property boundary before capturing
    zoomToFit(optOutsideFeet);

    // Small delay to ensure render update (mobile browsers need a beat longer after transforms)
    if (isTouchDevice) {
        await new Promise(requestAnimationFrame);
        await new Promise(r => setTimeout(r, 150));
    } else {
        await new Promise(r => setTimeout(r, 100));
    }

    const address = addressInput.value.trim();

    // Read export options
    const optStyle = document.getElementById('opt-style').value;
    const optColor = document.getElementById('opt-color').value;
    const optAspect = document.getElementById('opt-aspect')?.value || 'tall';
    const optShading = document.getElementById('opt-shading').checked;
    const optTrees = document.getElementById('opt-trees').checked;


    const optLabels = document.getElementById('opt-labels').checked;
    const optNorth = document.getElementById('opt-north')?.checked ?? true; // Default on
    const optSetback = document.getElementById('opt-setback').checked;
    const optNotes = document.getElementById('opt-notes').value.trim();

    // Build style description - just the name
    let styleDesc = '';
    switch (optStyle) {
        case 'technical': styleDesc = 'Technical CAD'; break;
        case 'architectural': styleDesc = 'Architectural'; break;
        case 'sketch': styleDesc = 'Hand sketch'; break;
        case 'blueprint': styleDesc = 'Blueprint'; break;
    }

    // Build color instructions - just the name
    let colorInst = '';
    switch (optColor) {
        case 'bw': colorInst = 'Black and white'; break;
        case 'color': colorInst = 'Full color'; break;
        case 'muted': colorInst = 'Muted colors'; break;
    }

    // Build elements to include
    const elements = [];
    if (optTrees) elements.push('trees');


    if (optSetback) elements.push('setback lines');

    // Create elements text if any are selected
    const elementsText = elements.length > 0 ? `Include ${elements.join(', ')}. ` : '';

    // Build aspect ratio instruction based on user selection
    let aspectInst = '';
    switch (optAspect) {
        case 'tall': aspectInst = 'Use a tall aspect ratio.'; break;
        case 'wide': aspectInst = 'Use a wide aspect ratio.'; break;
        case 'square': aspectInst = 'Use a square aspect ratio.'; break;
    }

    // Create a minimal prompt
    // Note: Use positive lighting terms instead of "remove shadows" - AI interprets hard shadow edges as structure
    // Use "hatching" instead of "shading" to avoid confusion with cast shadows
    const includesOutsideArea = optOutsideFeet > 0;
    const cropInstruction = includesOutsideArea
        ? 'Include the surrounding area shown in the image.'
        : 'Crop strictly to the property lines and fill the frame.';
    const prompt = `Rotate and align the property vertically so the side lot lines are parallel to the vertical edges of the canvas (rectilinear alignment). The house should face straight forward, not diagonally.
${cropInstruction} ${aspectInst}
${optLabels ? 'Label key features. ' : ''}${optNorth ? 'Include a north arrow/compass indicator. ' : ''}${elementsText}Only use measurements shown in reference image.
${optNotes ? optNotes + ' ' : ''}Generate a ${styleDesc.toLowerCase()} site plan of the property inside the blue outline. ${colorInst}${optShading ? ', with architectural hatching for depth' : ''}.
Use flat, uniform ambient lighting (no cast shadows). Areas marked "SHADOW" in the reference are shadows to ignore, not structures.
Do not include any surrounding white space, legends, or text boxes. Stretch image to fill entire canvas. Use image generation.`;

    // Check for Secure Context (required for navigator.share)
    const canShare = navigator.share && window.isSecureContext;

    try {
        setLoading(true, 'Generating image...');

        let baseCanvas = null;
        let polygon = null;
        let transform = null;
        const maskOutside = optOutsideFeet <= 0;

        // Preferred: programmatic capture (no UI chrome) + white-out outside boundary.
        const viewportCapture = await captureCurrentMapViewport({
            maskOutside,
            corners: currentCorners,
            includeOverlay: false,
            output: 'viewport'
        });

        if (viewportCapture?.canvas && viewportCapture?.polygon && viewportCapture.polygon.length >= 3 && viewportCapture?.transform) {
            baseCanvas = viewportCapture.canvas;
            polygon = viewportCapture.polygon;
            transform = viewportCapture.transform;
        } else {
            // Fallback: DOM capture via html2canvas (may include overlays/UI).
            const imageContainer = document.querySelector('.image-container');
            const capturedCanvas = await html2canvas(imageContainer, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                scale: 1,
                ignoreElements: (element) =>
                    element.id === 'loading' ||
                    element.id === 'overlay-canvas' ||
                    element.classList?.contains('map-controls')
            });
            if (!capturedCanvas) throw new Error('Failed to capture the map image.');

            // Build polygon coords in captured canvas pixels.
            if (currentCorners && currentCorners.length >= 3) {
                const containerRect = imageContainer.getBoundingClientRect();
                const canvasScaleX = containerRect.width ? (capturedCanvas.width / containerRect.width) : 1;
                const canvasScaleY = containerRect.height ? (capturedCanvas.height / containerRect.height) : 1;

                const viewportW = imageContainer.clientWidth || imageContainer.offsetWidth || 0;
                const viewportH = imageContainer.clientHeight || imageContainer.offsetHeight || 0;
                const layoutW = satelliteImg?.offsetWidth || mapWrapper?.clientWidth || mapWrapper?.offsetWidth || viewportW;
                const layoutH = satelliteImg?.offsetHeight || mapWrapper?.clientHeight || mapWrapper?.offsetHeight || viewportH;

                if (viewportW > 0 && viewportH > 0 && layoutW > 0 && layoutH > 0) {
                    const wrapperToViewport = getMapWrapperTransformMatrix(viewportW, viewportH);
                    const imageToLocal = matScale(layoutW / IMAGE_SIZE, layoutH / IMAGE_SIZE);
                    const imageToViewport = matMul(wrapperToViewport, imageToLocal); // IMAGE_SIZE -> padding coords

                    const paddingToBorder = matTranslate(imageContainer.clientLeft || 0, imageContainer.clientTop || 0);
                    const imageToBorder = matMul(paddingToBorder, imageToViewport); // IMAGE_SIZE -> border coords

                    const borderToCanvas = matScale(canvasScaleX, canvasScaleY);
                    transform = matMul(borderToCanvas, imageToBorder); // IMAGE_SIZE -> captured canvas px

                    polygon = currentCorners.map((c) => matApply(transform, c.x, c.y));
                }
            }

            if (maskOutside) {
                // Mask outside polygon on a fresh canvas.
                const masked = document.createElement('canvas');
                masked.width = capturedCanvas.width;
                masked.height = capturedCanvas.height;
                const mctx = masked.getContext('2d');
                mctx.fillStyle = 'white';
                mctx.fillRect(0, 0, masked.width, masked.height);
                mctx.drawImage(capturedCanvas, 0, 0);

                if (polygon && polygon.length >= 3) {
                    mctx.save();
                    mctx.globalCompositeOperation = 'source-over';
                    mctx.globalAlpha = 1;
                    if (mctx.resetTransform) mctx.resetTransform();
                    else mctx.setTransform(1, 0, 0, 1, 0, 0);

                    mctx.beginPath();
                    mctx.rect(0, 0, masked.width, masked.height);
                    mctx.moveTo(polygon[0].x, polygon[0].y);
                    for (let i = 1; i < polygon.length; i++) {
                        mctx.lineTo(polygon[i].x, polygon[i].y);
                    }
                    mctx.closePath();

                    mctx.fillStyle = 'white';
                    try {
                        mctx.fill('evenodd');
                    } catch {
                        mctx.fill();
                    }
                    mctx.restore();
                }

                baseCanvas = masked;
            } else {
                baseCanvas = capturedCanvas;
            }
        }

        if (!baseCanvas || !polygon || polygon.length < 3) throw new Error('Failed to capture the map image.');

        // Layout measurements (outside polygon) + prompt (in the white space).
        const scratch = document.createElement('canvas');
        scratch.width = 1;
        scratch.height = 1;
        const sctx = scratch.getContext('2d');
        if (!sctx) throw new Error('Failed to prepare export canvas.');

        const feetPerPixel = getFeetPerPixel(currentLatitude);
        const measurementLabels = computeExportMeasurementLabels({
            corners: currentCorners,
            polygon,
            feetPerPixel,
            ctx: sctx
        });

        const polyRect = getRectFromPoints(polygon);
        const labelRects = measurementLabels.map((l) => l.rect);
        const preferredPromptW = 280;
        const maxPromptWInside = Math.max(220, Math.floor(polyRect.w) - 24);
        const promptW = Math.min(preferredPromptW, maxPromptWInside);
        const promptBox = layoutPromptBox(sctx, prompt, promptW);
        const promptRect = choosePromptRect(polyRect, labelRects, promptBox, polygon, 12, { backgroundCanvas: baseCanvas });
        const shadowBounds = (shadowLabels && shadowLabels.length)
            ? computeExportShadowLabelBounds({ labels: shadowLabels, transform, ctx: sctx })
            : null;

        const outsideBufferPx = optOutsideFeet > 0
            ? (optOutsideFeet / feetPerPixel) * getTransformScale(transform)
            : 0;

        let contentRect = outsideBufferPx > 0 ? expandRect(polyRect, outsideBufferPx) : polyRect;
        for (const r of labelRects) contentRect = unionRect(contentRect, r);
        contentRect = unionRect(contentRect, promptRect);
        // Include bounds for all structures
        structures.forEach(structure => {
            const structBounds = computeExportShedBounds({ shed: structure, transform, feetPerPixel, ctx: sctx });
            if (structBounds) contentRect = unionRect(contentRect, structBounds);
        });
        if (shadowBounds) contentRect = unionRect(contentRect, shadowBounds);
        contentRect = expandRect(contentRect, 28); // room for corner labels + border

        const cropX1 = Math.floor(contentRect.x);
        const cropY1 = Math.floor(contentRect.y);
        const cropX2 = Math.ceil(contentRect.x + contentRect.w);
        const cropY2 = Math.ceil(contentRect.y + contentRect.h);

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = Math.max(1, cropX2 - cropX1);
        finalCanvas.height = Math.max(1, cropY2 - cropY1);
        const ctx = finalCanvas.getContext('2d');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        const srcX1 = Math.max(0, cropX1);
        const srcY1 = Math.max(0, cropY1);
        const srcX2 = Math.min(baseCanvas.width, cropX2);
        const srcY2 = Math.min(baseCanvas.height, cropY2);
        const srcW = Math.max(0, srcX2 - srcX1);
        const srcH = Math.max(0, srcY2 - srcY1);

        if (srcW > 0 && srcH > 0) {
            ctx.drawImage(baseCanvas, srcX1, srcY1, srcW, srcH, srcX1 - cropX1, srcY1 - cropY1, srcW, srcH);
        }

        const offsetX = -cropX1;
        const offsetY = -cropY1;

        // Draw all structures
        structures.forEach(structure => {
            drawExportShed(ctx, structure, transform, polygon, offsetX, offsetY, feetPerPixel);
        });
        // Draw distance lines only for the primary shed (first shed-type structure)
        const primaryShed = getPrimaryShed();
        if (primaryShed) {
            drawExportShedDistanceLines(ctx, primaryShed, currentCorners, currentHouse, transform, offsetX, offsetY, feetPerPixel);
        }
        drawExportSetbackLines(ctx, currentCorners, transform, offsetX, offsetY, feetPerPixel);
        drawExportReferenceLine(ctx, primaryShed, transform, offsetX, offsetY, feetPerPixel);
        drawExportLabeledLines(ctx, transform, offsetX, offsetY, feetPerPixel);
        drawExportBoundary(ctx, polygon, offsetX, offsetY);
        drawExportMeasurementLabels(ctx, measurementLabels, offsetX, offsetY);
        drawExportShadowLabels(ctx, shadowLabels, transform, offsetX, offsetY);
        drawPromptBox(ctx, promptBox, promptRect, offsetX, offsetY);

        // Convert to blob
        const blob = await new Promise(resolve => finalCanvas.toBlob(resolve, 'image/png'));
        setLoading(false);

        if (!blob) throw new Error('Failed to create image blob');

        // Copy image to clipboard automatically
        try {
            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                console.log('Image copied to clipboard');
            }
        } catch (clipErr) {
            console.log('Clipboard copy failed (expected on some browsers):', clipErr);
        }

        // Mobile: After async capture, user-gesture APIs (share/download/popup) can be blocked.
        // Show a modal with explicit actions so the final taps happen with a fresh user gesture.
        if (isMobileExport) {
            showMobileExportModal(prompt, blob);
            return;
        }

        // MODE 1: Web Share API (Mobile/Supported Browsers)
        if (canShare) {
            try {
                const file = new File([blob], 'property-site-plan-request.png', { type: 'image/png' });

                // Try sharing the file first
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Property Site Plan Request',
                        text: 'Site plan request for Gemini'
                    });
                    return; // Success
                }
            } catch (fileShareErr) {
                console.log('File share failed, trying text share:', fileShareErr);
            }

            // Fallback: Share just text if file sharing fails
            try {
                await navigator.share({
                    title: 'Property Site Plan Request',
                    text: prompt
                });
                return; // Success
            } catch (textShareErr) {
                console.log('Text share failed/cancelled:', textShareErr);
                // If cancelled or failed, fall through to desktop mode
            }
        }

        // MODE 2: Desktop / Fallback
        // Copy to Clipboard or Download
        let imageCopied = false;
        try {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            imageCopied = true;
        } catch (clipErr) {
            console.log('Clipboard write failed, downloading instead:', clipErr);
            // Fallback: download the image
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'property-site-plan-request.png';
            a.click();
            URL.revokeObjectURL(url);
        }

        // Note: Removed auto-open Gemini - user can share/open manually

        // Show simplified toast/alert
        if (imageCopied) {
            alert('✅ Copied to clipboard! Switch to Gemini and paste (Ctrl+V).');
        } else {
            alert('📥 Image downloaded! Switch to Gemini and upload it.');
        }

    } catch (error) {
        console.error('Export error:', error);
        setLoading(false);
        alert('Export failed. Please try again.');
    }
}

// Show export modal with instructions
function showExportModal(prompt) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
    `;

    modal.innerHTML = `
        <div style="
            background: #1a1a2e;
            border-radius: 12px;
            padding: 2rem;
            max-width: 600px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
            border: 1px solid rgba(255,255,255,0.1);
        ">
            <h2 style="margin: 0 0 1rem; color: #f1f1f7;">🎨 Export to Gemini</h2>
            
            <div style="background: #252542; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; color: #9898b0; font-size: 0.9rem;">Step 1: Take a screenshot of the satellite image above</p>
                <p style="margin: 0; color: #f1f1f7;">Press <kbd style="background: #6366f1; padding: 2px 8px; border-radius: 4px;">Win + Shift + S</kbd> and select the image</p>
            </div>
            
            <div style="background: #252542; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; color: #9898b0; font-size: 0.9rem;">Step 2: In Gemini, paste the screenshot (Ctrl+V)</p>
            </div>
            
            <div style="background: #252542; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; color: #9898b0; font-size: 0.9rem;">Step 3: Paste this prompt (already copied!) or copy it below:</p>
                <textarea id="prompt-text" readonly style="
                    width: 100%;
                    height: 150px;
                    background: #0f0f1a;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #f1f1f7;
                    padding: 0.75rem;
                    font-family: inherit;
                    font-size: 0.85rem;
                    resize: none;
                ">${prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                <button id="copy-prompt-btn" style="
                    margin-top: 0.5rem;
                    padding: 0.5rem 1rem;
                    background: #6366f1;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: inherit;
                ">📋 Copy Prompt</button>
            </div>
            
            <button id="close-modal-btn" style="
                width: 100%;
                padding: 1rem;
                background: #10b981;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                font-family: inherit;
            ">Got it!</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('copy-prompt-btn').addEventListener('click', async () => {
        const textarea = document.getElementById('prompt-text');
        textarea.select();
        try {
            await navigator.clipboard.writeText(prompt);
            document.getElementById('copy-prompt-btn').textContent = '✅ Copied!';
        } catch (e) {
            document.execCommand('copy');
            document.getElementById('copy-prompt-btn').textContent = '✅ Copied!';
        }
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Mobile export modal: provides explicit Share/Download/Open actions after async work completes.
function showMobileExportModal(prompt, blob) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.82);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
    `;

    const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const canShare = Boolean(blob && navigator.share && window.isSecureContext);
    const safePrompt = escapeHtml(prompt);

    let url = '';
    try {
        url = blob ? URL.createObjectURL(blob) : '';
    } catch (e) { }

    modal.innerHTML = `
        <div style="
            background: #1a1a2e;
            border-radius: 12px;
            padding: 1.25rem;
            max-width: 720px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            border: 1px solid rgba(255,255,255,0.1);
        ">
            <h2 style="margin: 0 0 0.25rem; color: #f1f1f7;">Export to Gemini</h2>
            <p style="margin: 0 0 1rem; color: #9898b0; font-size: 0.95rem; line-height: 1.4;">
                The generated image includes the prompt text. Use Share (pick Gemini) or Download, then upload it to Gemini.
            </p>

            <div style="background: #0f0f1a; border-radius: 10px; padding: 0.75rem; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 1rem;">
                ${url ? `<img id="mexport-preview" alt="Export preview" src="${url}" style="width: 100%; height: auto; display: block; border-radius: 8px;" />` : ''}
            </div>

            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
                <button id="mexport-share" ${canShare ? '' : 'disabled'} style="
                    flex: 1 1 140px;
                    padding: 0.8rem 1rem;
                    background: ${canShare ? '#6366f1' : 'rgba(99,102,241,0.35)'};
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: ${canShare ? 'pointer' : 'not-allowed'};
                    font-size: 0.95rem;
                    font-family: inherit;
                ">Share</button>

                <button id="mexport-download" style="
                    flex: 1 1 140px;
                    padding: 0.8rem 1rem;
                    background: #10b981;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 0.95rem;
                    font-family: inherit;
                ">Download</button>
            </div>

            <div id="mexport-status" style="min-height: 18px; color: #9898b0; font-size: 0.85rem; margin-bottom: 1rem;"></div>

            <div style="background: #252542; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem; color: #9898b0; font-size: 0.9rem;">Prompt text</p>
                <textarea id="mexport-prompt" readonly style="
                    width: 100%;
                    height: 160px;
                    background: #0f0f1a;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #f1f1f7;
                    padding: 0.75rem;
                    font-family: inherit;
                    font-size: 0.85rem;
                    resize: none;
                ">${safePrompt}</textarea>
                <button id="mexport-copy" style="
                    margin-top: 0.5rem;
                    padding: 0.6rem 1rem;
                    background: #6366f1;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: inherit;
                ">Copy Prompt</button>
            </div>

            <button id="mexport-close" style="
                width: 100%;
                padding: 0.9rem 1rem;
                background: rgba(255,255,255,0.1);
                color: #f1f1f7;
                border: 1px solid rgba(255,255,255,0.14);
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                font-family: inherit;
            ">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    const statusEl = modal.querySelector('#mexport-status');
    const setStatus = (msg) => {
        if (!statusEl) return;
        statusEl.textContent = msg || '';
    };

    const cleanup = () => {
        try {
            if (url) URL.revokeObjectURL(url);
        } catch (e) { }
        modal.remove();
    };

    modal.querySelector('#mexport-close')?.addEventListener('click', cleanup);

    modal.querySelector('#mexport-copy')?.addEventListener('click', async () => {
        const textarea = modal.querySelector('#mexport-prompt');
        textarea?.focus();
        textarea?.select();
        try {
            await navigator.clipboard.writeText(prompt);
            setStatus('Prompt copied to clipboard.');
        } catch (e) {
            document.execCommand('copy');
            setStatus('Prompt copied to clipboard.');
        }
    });

    modal.querySelector('#mexport-download')?.addEventListener('click', () => {
        if (!blob || !url) {
            setStatus('No image available to download.');
            return;
        }

        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'property-site-plan-request.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setStatus('Download started. If it did not, long-press the preview image and choose \"Save\".');
        } catch (e) {
            setStatus('Download failed. Long-press the preview image and choose \"Save\".');
            console.log('Download error:', e);
        }
    });

    modal.querySelector('#mexport-share')?.addEventListener('click', async () => {
        if (!(blob && navigator.share && window.isSecureContext)) {
            setStatus('Sharing is not available in this browser context.');
            return;
        }

        try {
            const file = new File([blob], 'property-site-plan-request.png', { type: 'image/png' });
            const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });

            if (canShareFile) {
                await navigator.share({
                    files: [file],
                    title: 'Property Site Plan Request',
                    text: 'Site plan request for Gemini'
                });
            } else {
                await navigator.share({
                    title: 'Property Site Plan Request',
                    text: prompt
                });
            }

            setStatus('Share sheet opened.');
        } catch (e) {
            setStatus('Share cancelled or failed.');
            console.log('Share error:', e);
        }
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cleanup();
    });
}

// Event listeners
analyzeBtn.addEventListener('click', analyzeProperty);
addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeProperty();
});

// Export button
const exportBtn = document.getElementById('export-btn');
exportBtn?.addEventListener('click', exportToGemini);

// Bottom action bar buttons
const optionsToggleBtn = document.getElementById('options-toggle-btn');
const optionsPopup = document.getElementById('options-popup');
const optionsPopupClose = document.getElementById('options-popup-close');

optionsToggleBtn?.addEventListener('click', () => {
    if (optionsPopup) {
        const isVisible = optionsPopup.classList.contains('visible');
        optionsPopup.classList.toggle('visible', !isVisible);
        optionsToggleBtn.classList.toggle('active', !isVisible);
    }
});

optionsPopupClose?.addEventListener('click', () => {
    optionsPopup?.classList.remove('visible');
    optionsToggleBtn?.classList.remove('active');
});

// ============ UNDO/REDO BUTTONS ============
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

undoBtn?.addEventListener('click', () => {
    if (undo()) {
        undoBtn.style.transform = 'scale(0.9)';
        setTimeout(() => undoBtn.style.transform = '', 100);
    }
});

redoBtn?.addEventListener('click', () => {
    if (redo()) {
        redoBtn.style.transform = 'scale(0.9)';
        setTimeout(() => redoBtn.style.transform = '', 100);
    }
});

// ============ SAVE/LOAD POPUP ============
const saveLoadBtn = document.getElementById('save-load-btn');
const saveLoadPopup = document.getElementById('save-load-popup');
const saveLoadPopupClose = document.getElementById('save-load-popup-close');
const projectNameInput = document.getElementById('project-name-input');
const saveProjectBtn = document.getElementById('save-project-btn');
const savedProjectsList = document.getElementById('saved-projects-list');
const exportProjectBtn = document.getElementById('export-project-btn');
const importProjectInput = document.getElementById('import-project-input');

function updateSavedProjectsList() {
    if (!savedProjectsList) return;
    const projects = getSavedProjects();
    const names = Object.keys(projects).sort((a, b) => (projects[b].timestamp || 0) - (projects[a].timestamp || 0));

    if (names.length === 0) {
        savedProjectsList.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem;">No saved projects</div>';
        return;
    }

    savedProjectsList.innerHTML = names.map(name => {
        const project = projects[name];
        const date = project.timestamp ? new Date(project.timestamp).toLocaleDateString() : '';
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid var(--border);">
                <div style="flex: 1; overflow: hidden;">
                    <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${date}</div>
                </div>
                <div style="display: flex; gap: 0.25rem;">
                    <button class="btn btn-secondary load-project-btn" data-name="${name}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Load</button>
                    <button class="btn btn-secondary delete-project-btn" data-name="${name}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; color: #ef4444;">✕</button>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners
    savedProjectsList.querySelectorAll('.load-project-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.dataset.name;
            const projects = getSavedProjects();
            const state = projects[name];

            if (!state) {
                alert('Project not found');
                return;
            }

            saveLoadPopup?.classList.remove('visible');
            saveLoadBtn?.classList.remove('active');

            // Load with satellite image (like import does)
            if (state.address) {
                try {
                    setLoading(true, 'Loading project...');
                    const coords = await geocodeAddress(state.address);
                    if (coords) {
                        currentLatitude = coords.lat;
                        state.currentLatitude = coords.lat;
                        const imageUrl = await getSatelliteImageUrl(coords.lat, coords.lng);

                        satelliteImg.onload = () => {
                            setLoading(false);
                            resultsSection.style.display = 'block';
                            document.getElementById('bottom-action-bar').style.display = 'flex';
                            loadProjectState(state);
                        };
                        satelliteImg.onerror = () => {
                            setLoading(false);
                            alert('Failed to load satellite image');
                        };
                        satelliteImg.src = imageUrl;
                    } else {
                        setLoading(false);
                        alert('Could not geocode address');
                    }
                } catch (err) {
                    setLoading(false);
                    alert('Failed to load project: ' + err.message);
                }
            } else {
                loadProjectState(state);
            }
        });
    });

    savedProjectsList.querySelectorAll('.delete-project-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.name;
            if (confirm(`Delete project "${name}"?`)) {
                deleteProject(name);
                updateSavedProjectsList();
            }
        });
    });
}

saveLoadBtn?.addEventListener('click', () => {
    if (saveLoadPopup) {
        const isVisible = saveLoadPopup.classList.contains('visible');
        saveLoadPopup.classList.toggle('visible', !isVisible);
        saveLoadBtn.classList.toggle('active', !isVisible);
        if (!isVisible) {
            updateSavedProjectsList();
            // Default project name from address
            if (projectNameInput && !projectNameInput.value && addressInput?.value) {
                projectNameInput.value = addressInput.value.split(',')[0].trim();
            }
        }
    }
});

saveLoadPopupClose?.addEventListener('click', () => {
    saveLoadPopup?.classList.remove('visible');
    saveLoadBtn?.classList.remove('active');
});

if (saveProjectBtn) {
    saveProjectBtn.onclick = function () {
        const name = projectNameInput?.value?.trim();
        if (!name) {
            alert('Please enter a project name');
            return;
        }
        if (saveProject(name)) {
            updateSavedProjectsList();
            saveProjectBtn.textContent = 'Saved!';
            setTimeout(() => saveProjectBtn.textContent = 'Save', 1500);
        } else {
            alert('Failed to save project');
        }
    };
}

exportProjectBtn?.addEventListener('click', () => {
    exportProjectToFile();
});

importProjectInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        await importProjectFromFile(file);
        saveLoadPopup?.classList.remove('visible');
        saveLoadBtn?.classList.remove('active');
    } catch (err) {
        alert('Failed to import project: ' + err.message);
    }
    e.target.value = '';
});

// Quick import from search section
const quickImportInput = document.getElementById('quick-import-input');
quickImportInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Close the quick load popup
    document.getElementById('quick-load-popup')?.classList.remove('visible');
    document.getElementById('quick-load-btn')?.classList.remove('active');
    try {
        await importProjectFromFile(file);
    } catch (err) {
        alert('Failed to import project: ' + err.message);
    }
    e.target.value = '';
});

// ============ QUICK LOAD POPUP (Search Section) ============
const quickLoadBtn = document.getElementById('quick-load-btn');
const quickLoadPopup = document.getElementById('quick-load-popup');
const quickLoadClose = document.getElementById('quick-load-close');
const quickLoadSavedList = document.getElementById('quick-load-saved-list');

function updateQuickLoadList() {
    if (!quickLoadSavedList) return;
    const projects = getSavedProjects();
    const names = Object.keys(projects).sort((a, b) => (projects[b].timestamp || 0) - (projects[a].timestamp || 0));

    if (names.length === 0) {
        quickLoadSavedList.innerHTML = '<div class="quick-load-empty">No saved projects</div>';
        return;
    }

    quickLoadSavedList.innerHTML = names.map(name => {
        const project = projects[name];
        const date = project.timestamp ? new Date(project.timestamp).toLocaleDateString() : '';
        return `
            <div class="quick-load-item" data-name="${name}">
                <span class="quick-load-item-name">${name}</span>
                <span class="quick-load-item-date">${date}</span>
            </div>
        `;
    }).join('');

    // Add click handlers
    quickLoadSavedList.querySelectorAll('.quick-load-item').forEach(item => {
        item.addEventListener('click', async () => {
            const name = item.dataset.name;
            const projects = getSavedProjects();
            const state = projects[name];
            if (state) {
                quickLoadPopup?.classList.remove('visible');
                quickLoadBtn?.classList.remove('active');

                // Use the same import logic to load with satellite image
                if (state.address) {
                    try {
                        setLoading(true, 'Loading saved project...');
                        const coords = await geocodeAddress(state.address);
                        if (coords) {
                            currentLatitude = coords.lat;
                            state.currentLatitude = coords.lat;
                            const imageUrl = await getSatelliteImageUrl(coords.lat, coords.lng);

                            satelliteImg.onload = () => {
                                setLoading(false);
                                resultsSection.style.display = 'block';
                                document.getElementById('bottom-action-bar').style.display = 'flex';
                                loadProjectState(state);
                            };
                            satelliteImg.onerror = () => {
                                setLoading(false);
                                alert('Failed to load satellite image');
                            };
                            satelliteImg.src = imageUrl;
                        } else {
                            setLoading(false);
                            alert('Could not geocode saved address');
                        }
                    } catch (err) {
                        setLoading(false);
                        alert('Failed to load project: ' + err.message);
                    }
                } else {
                    loadProjectState(state);
                }
            }
        });
    });
}

quickLoadBtn?.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from immediately closing it
    if (quickLoadPopup) {
        const isVisible = quickLoadPopup.classList.contains('visible');
        quickLoadPopup.classList.toggle('visible', !isVisible);
        quickLoadBtn.classList.toggle('active', !isVisible);
        if (!isVisible) {
            // Position the popup below the button
            const rect = quickLoadBtn.getBoundingClientRect();
            quickLoadPopup.style.top = (rect.bottom + 8) + 'px';
            quickLoadPopup.style.left = Math.max(10, rect.right - 300) + 'px'; // Align right edge, but keep on screen
            updateQuickLoadList();
        }
    }
});

quickLoadClose?.addEventListener('click', () => {
    quickLoadPopup?.classList.remove('visible');
    quickLoadBtn?.classList.remove('active');
});

// Close popup when clicking outside
document.addEventListener('click', (e) => {
    if (optionsPopup?.classList.contains('visible')) {
        const clickedInsidePopup = optionsPopup.contains(e.target);
        const clickedToggleBtn = optionsToggleBtn?.contains(e.target);
        if (!clickedInsidePopup && !clickedToggleBtn) {
            optionsPopup.classList.remove('visible');
            optionsToggleBtn?.classList.remove('active');
        }
    }
    if (saveLoadPopup?.classList.contains('visible')) {
        const clickedInsidePopup = saveLoadPopup.contains(e.target);
        const clickedToggleBtn = saveLoadBtn?.contains(e.target);
        if (!clickedInsidePopup && !clickedToggleBtn) {
            saveLoadPopup.classList.remove('visible');
            saveLoadBtn?.classList.remove('active');
        }
    }
    if (quickLoadPopup?.classList.contains('visible')) {
        const clickedInsidePopup = quickLoadPopup.contains(e.target);
        const clickedToggleBtn = quickLoadBtn?.contains(e.target);
        if (!clickedInsidePopup && !clickedToggleBtn) {
            quickLoadPopup.classList.remove('visible');
            quickLoadBtn?.classList.remove('active');
        }
    }
});

// Shed button
document.getElementById('add-shed-btn')?.addEventListener('click', () => {
    if (!currentCorners) {
        alert('Please analyze a property first!');
        return;
    }
    addShed();
});

// Setback controls
document.getElementById('setback-distance')?.addEventListener('change', (e) => {
    setbackDistance = parseFloat(e.target.value) || 5;
    if (currentCorners) drawBoundary(currentCorners);
});

document.getElementById('setback-toggle')?.addEventListener('change', (e) => {
    showSetback = e.target.checked;
    if (currentCorners) drawBoundary(currentCorners);
});

// Initialize (legacy no-op if API-key flow isn't present)
if (typeof loadKeys === 'function') {
    loadKeys();
}

/* Map Zoom Controls */

btnZoomIn?.addEventListener('click', () => {
    scale *= 1.2;
    updateScaleTransform();
});

btnZoomOut?.addEventListener('click', () => {
    scale /= 1.2;
    if (scale < 0.1) scale = 0.1; // Min zoom - lowered to support large properties
    updateScaleTransform();
});

// Rotate left (counterclockwise) by 5 degrees
btnRotateLeft?.addEventListener('click', () => {
    mapRotation -= (5 * Math.PI) / 180;
    updateScaleTransform();
});

// Rotate right (clockwise) by 5 degrees
btnRotateRight?.addEventListener('click', () => {
    mapRotation += (5 * Math.PI) / 180;
    updateScaleTransform();
});

btnReset?.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    mapRotation = 0;
    isPanning = false;
    updateScaleTransform();
    overlayCanvas.classList.remove('cursor-pan-grabbing');
    overlayCanvas.style.cursor = 'grab';
});

// Pan is always enabled (toggle removed).
isPanMode = true;
overlayCanvas.style.cursor = 'grab';
