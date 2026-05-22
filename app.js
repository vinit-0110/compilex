/**
 * CompileX Online Python IDE & Compiler Logic
 * Powered by Monaco Editor & Pyodide (Python WebAssembly)
 */

// Global State
let pyodideInstance = null;
let monacoEditor = null;
const loadedPackages = new Set();
let isRunning = false;
let isEngineLoaded = false;

// Default Python Code Template
const DEFAULT_CODE = `# CompileX Online Python Compiler
# Write your Python code here and click "Run Code"

import math

def calculate_circle_properties(radius):
    if radius < 0:
        raise ValueError("Radius cannot be negative!")
    
    area = math.pi * (radius ** 2)
    circumference = 2 * math.pi * radius
    return area, circumference

try:
    print("--- Running Python Calculations ---")
    r = 5
    area, circ = calculate_circle_properties(r)
    
    print(f"Radius: {r}")
    print(f"Circle Area: {area:.4f}")
    print(f"Circumference: {circ:.4f}")
    
    # Testing loops
    print("\\nIterating numbers:")
    for i in range(1, 4):
        print(f"  Step {i}: Value squared = {i**2}")
        
    print("\\n--- Execution Complete ---")
    
except Exception as e:
    print(f"An error occurred: {e}")
`;

// Known Pyodide CDN package mapping
const POPULAR_PACKAGES = {
  numpy: 'numpy',
  pandas: 'pandas',
  sympy: 'sympy',
  scipy: 'scipy'
};

// DOM Elements
const DOM = {
  workspace: document.getElementById('workspace'),
  editorContainer: document.getElementById('monaco-editor-container'),
  editorLoader: document.getElementById('editor-loader'),
  consolePane: document.getElementById('console-pane'),
  consoleWelcome: document.getElementById('console-welcome'),
  consoleLines: document.getElementById('console-lines'),
  consoleBody: document.getElementById('console-body'),
  
  // Buttons
  btnRun: document.getElementById('btn-run'),
  btnClear: document.getElementById('btn-clear'),
  btnReset: document.getElementById('btn-reset'),
  btnConsoleClear: document.getElementById('btn-console-clear'),
  btnConsoleCopy: document.getElementById('btn-console-copy'),
  btnConsoleClose: document.getElementById('btn-console-close'),
  btnEnvManager: document.getElementById('btn-env-manager'),
  
  // Status Elements
  engineStatus: document.getElementById('engine-status'),
  statusText: document.querySelector('#engine-status .status-text'),
  statusIcon: document.querySelector('#engine-status i'),
  
  // Modals & Packages
  packagesModal: document.getElementById('packages-modal'),
  modalClose: document.getElementById('modal-close'),
  btnModalCloseAction: document.getElementById('btn-modal-close-action'),
  pkgCheckboxes: document.querySelectorAll('.pkg-checkbox'),
  pypiPkgName: document.getElementById('pypi-pkg-name'),
  btnInstallPypi: document.getElementById('btn-install-pypi'),
  installStatusMsg: document.getElementById('install-status-msg'),
  installedList: document.getElementById('installed-list'),
  
  // Toasts
  toastContainer: document.getElementById('toast-container')
};

/* ==========================================================================
   Monaco Editor Setup
   ========================================================================== */
function initMonaco() {
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
  
  require(['vs/editor/editor.main'], function () {
    // Define custom theme overrides for a premium feel
    monaco.editor.defineTheme('compilex-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c084fc', fontStyle: 'bold' },
        { token: 'string', foreground: '34d399' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'operator', foreground: '38bdf8' },
        { token: 'function', foreground: '60a5fa', fontStyle: 'bold' }
      ],
      colors: {
        'editor.background': '#111625',
        'editor.foreground': '#f3f4f6',
        'editor.lineHighlightBackground': '#1b233a',
        'editorLineNumber.foreground': '#4b5563',
        'editorLineNumber.activeForeground': '#c084fc',
        'editor.selectionBackground': '#3b82f640',
        'editor.inactiveSelectionBackground': '#3b82f620',
        'scrollbarSlider.background': '#1e293b80',
        'scrollbarSlider.hoverBackground': '#33415580',
        'scrollbarSlider.activeBackground': '#47556980'
      }
    });

    monacoEditor = monaco.editor.create(DOM.editorContainer, {
      value: DEFAULT_CODE,
      language: 'python',
      theme: 'compilex-theme',
      automaticLayout: true,
      fontSize: 15,
      lineHeight: 24,
      fontFamily: "'Fira Code', 'JetBrains Mono', 'Courier New', Courier, monospace",
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 12, bottom: 12 },
      scrollbar: {
        vertical: 'visible',
        horizontal: 'visible',
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false
      }
    });

    // Hide loader overlay
    DOM.editorLoader.style.opacity = 0;
    setTimeout(() => {
      DOM.editorLoader.style.display = 'none';
    }, 500);

    // If Pyodide is also ready, enable Run
    checkEnableRun();
  });
}

/* ==========================================================================
   Pyodide WASM Engine Setup
   ========================================================================== */
async function initPyodideEngine() {
  try {
    updateEngineStatus('loading', 'Loading Python WASM...', 'fa-circle-notch fa-spin');
    
    // Load WebAssembly runtime with explicit CDN indexURL
    pyodideInstance = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/",
      stdout: (text) => {
        appendToConsole(text, 'stdout');
      },
      stderr: (text) => {
        appendToConsole(text, 'stderr');
      }
    });

    // Initialize micropip for PyPI package installation
    await pyodideInstance.loadPackage('micropip');
    
    isEngineLoaded = true;
    updateEngineStatus('ready', 'Python Engine Ready', 'fa-check');
    checkEnableRun();
    
    showToast('Python WebAssembly engine ready!', 'success');
  } catch (error) {
    console.error('Pyodide Loading Failure:', error);
    updateEngineStatus('loading', 'Engine Offline', 'fa-circle-exclamation');
    showToast('Failed to load Python WebAssembly Engine.', 'error');
  }
}

function updateEngineStatus(state, text, iconClass) {
  DOM.engineStatus.className = `status-badge ${state}`;
  DOM.statusText.textContent = text;
  DOM.statusIcon.className = `fa-solid ${iconClass}`;
}

function checkEnableRun() {
  if (isEngineLoaded && monacoEditor) {
    DOM.btnRun.removeAttribute('disabled');
  }
}

/* ==========================================================================
   Code Running and Python Execution
   ========================================================================== */
async function runCode() {
  if (!isEngineLoaded || isRunning) return;
  
  const code = monacoEditor.getValue().trim();
  
  // Clear any existing error highlights/markers in the editor
  clearEditorMarkers();

  // Validate Code language and contents
  if (!code) {
    showToast('Cannot run empty code.', 'warning');
    return;
  }

  if (detectNonPythonLanguage(code)) {
    const errorMsg = 'Error: Detected syntax resembling HTML, Javascript, C++ or Java. CompileX is a dedicated Python IDE and only runs python code.\n';
    openConsole();
    clearConsole();
    appendToConsole(errorMsg, 'stderr');
    
    // Set a code marker on line 1 for visual feedback
    setEditorMarker(1, 'CompileX only compiles Python code.');
    showToast('Compilation error: Non-Python language detected.', 'error');
    return;
  }

  try {
    isRunning = true;
    DOM.btnRun.disabled = true;
    updateEngineStatus('running', 'Running Code...', 'fa-circle-notch fa-spin');
    
    openConsole();
    clearConsole();
    appendToConsole('>>> Executing script.py...\n', 'system');
    
    // Auto-detect imports and download libraries if needed
    await autoDetectAndLoadImports(code);

    const startTime = performance.now();
    
    // Run python code
    await pyodideInstance.runPythonAsync(code);
    
    const duration = ((performance.now() - startTime) / 1000).toFixed(3);
    appendToConsole(`\n>>> Execution finished in ${duration}s\n`, 'success-msg');
    
    updateEngineStatus('ready', 'Python Engine Ready', 'fa-check');
  } catch (error) {
    handlePythonError(error);
  } finally {
    isRunning = false;
    DOM.btnRun.disabled = false;
  }
}

// Check if the user is copying paste syntax from Javascript, HTML or C-style code.
function detectNonPythonLanguage(code) {
  const lowercaseCode = code.toLowerCase();
  
  // Check typical tags/structures of other environments
  const htmlIndicators = /^\s*<!doctype html>|^\s*<html|<\/html>|<\/script>/i;
  const jsIndicators = /(?:const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*(?:require|function|\(|\[|\{)/;
  const cppIndicators = /#include\s*<[a-z]+>|using namespace std;|int main\(\s*\)\s*\{/;
  const javaIndicators = /public\s+class\s+[A-Za-z0-9_]+\s*\{|public\s+static\s+void\s+main\s*\(/;
  
  return htmlIndicators.test(code) || 
         jsIndicators.test(code) || 
         cppIndicators.test(code) || 
         javaIndicators.test(code);
}

// Regex to capture imported packages in Python
async function autoDetectAndLoadImports(code) {
  const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_]+)/gm;
  let match;
  const detectedPackages = [];
  
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1];
    if (POPULAR_PACKAGES[pkg] && !loadedPackages.has(pkg)) {
      detectedPackages.push(pkg);
    }
  }

  if (detectedPackages.length > 0) {
    updateEngineStatus('installing', `Loading library [${detectedPackages.join(', ')}]...`, 'fa-cloud-arrow-down fa-bounce');
    appendToConsole(`>>> Installing imports: ${detectedPackages.join(', ')} ...`, 'system');
    
    for (const pkg of detectedPackages) {
      await loadPackage(pkg);
    }
  }
}

// Error Traceback Processing
function handlePythonError(error) {
  console.error("Execution error Details:", error);
  updateEngineStatus('ready', 'Python Engine Ready', 'fa-check');
  
  const errorMsg = error.message || error.toString();
  appendToConsole(errorMsg + '\n', 'stderr');
  
  // Parse traceback for line number and error detail
  const parsedError = parseTraceback(errorMsg);
  
  if (parsedError) {
    const { line, message, type } = parsedError;
    
    // Highlight inside Monaco
    setEditorMarker(line, message);
    
    // Output error card
    createErrorCard(line, type, message);
    
    showToast(`Error at Line ${line}: ${type}`, 'error');
  } else {
    showToast('Python execution failed.', 'error');
  }
}

function parseTraceback(traceback) {
  // Pyodide tracebacks typically look like:
  // File "<exec>", line 8, in <module>
  // ZeroDivisionError: division by zero
  const lines = traceback.split('\n');
  let errorLineNum = 1;
  let errorType = 'RuntimeError';
  let errorDesc = 'An error occurred during execution.';
  
  let lineFound = false;
  
  // Loop backwards to find the last line containing standard "<exec>" tracing
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineText = lines[i];
    
    if (lineText.includes('File "<exec>"') || lineText.includes('File "<string>"')) {
      const match = /line (\d+)/.exec(lineText);
      if (match) {
        errorLineNum = parseInt(match[1], 10);
        lineFound = true;
        
        // The error details are usually on the following lines
        // Check lines below this file frame
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && !lines[j].startsWith(' ')) {
            const errMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(lines[j]);
            if (errMatch) {
              errorType = errMatch[1];
              errorDesc = errMatch[2];
            } else {
              errorDesc = lines[j].trim();
            }
            break;
          }
        }
        break;
      }
    }
  }

  // If no File "<exec>" match was found, try scanning for any standard Exception declaration
  if (!lineFound) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const errMatch = /^([A-Za-z_][A-Za-z0-9_]*Exception|[A-Za-z_][A-Za-z0-9_]*Error):\s*(.*)$/.exec(lines[i]);
      if (errMatch) {
        errorType = errMatch[1];
        errorDesc = errMatch[2];
        break;
      }
    }
    return null; // Can't map line number
  }

  return {
    line: errorLineNum,
    type: errorType,
    message: errorDesc
  };
}

function setEditorMarker(line, message) {
  if (!monacoEditor) return;
  
  const model = monacoEditor.getModel();
  const maxColumn = model.getLineMaxColumn(line);
  
  const markers = [{
    severity: monaco.MarkerSeverity.Error,
    message: message,
    startLineNumber: line,
    startColumn: 1,
    endLineNumber: line,
    endColumn: maxColumn
  }];
  
  monaco.editor.setModelMarkers(model, 'compilex-error', markers);
}

function clearEditorMarkers() {
  if (!monacoEditor) return;
  const model = monacoEditor.getModel();
  monaco.editor.setModelMarkers(model, 'compilex-error', []);
}

function createErrorCard(lineNumber, errorType, message) {
  const card = document.createElement('div');
  card.className = 'error-card-wrapper';
  
  const header = document.createElement('div');
  header.className = 'error-card-header';
  header.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${errorType}</span>`;
  
  const desc = document.createElement('div');
  desc.className = 'error-card-desc';
  desc.textContent = message;
  
  const location = document.createElement('div');
  location.className = 'error-card-line-highlight';
  location.innerHTML = `<i class="fa-solid fa-arrow-right"></i> Line ${lineNumber}: Click to jump to line`;
  
  location.addEventListener('click', () => {
    monacoEditor.focus();
    monacoEditor.setPosition({ lineNumber: lineNumber, column: 1 });
    monacoEditor.revealLineInCenter(lineNumber);
  });
  
  card.appendChild(header);
  card.appendChild(desc);
  card.appendChild(location);
  
  DOM.consoleLines.appendChild(card);
  scrollToBottom();
}

/* ==========================================================================
   Console IO Operations
   ========================================================================== */
function openConsole() {
  if (!DOM.workspace.classList.contains('split-active')) {
    DOM.workspace.classList.add('split-active');
    DOM.consolePane.style.display = 'flex';
    
    // Let Monaco recalculate layout inside its new flex item wrapper
    if (monacoEditor) {
      setTimeout(() => monacoEditor.layout(), 100);
    }
  }
}

function closeConsole() {
  DOM.workspace.classList.remove('split-active');
  DOM.consolePane.style.display = 'none';
  
  if (monacoEditor) {
    setTimeout(() => monacoEditor.layout(), 100);
  }
}

function clearConsole() {
  DOM.consoleWelcome.style.display = 'none';
  DOM.consoleLines.innerHTML = '';
}

function appendToConsole(text, type = 'stdout') {
  DOM.consoleWelcome.style.display = 'none';
  
  // Ensure every output chunk ends with a newline (Emscripten strips standard out newlines)
  let outputText = text;
  if (!outputText.endsWith('\n')) {
    outputText += '\n';
  }
  
  const span = document.createElement('span');
  span.className = `console-chunk ${type}`;
  span.textContent = outputText;
  
  DOM.consoleLines.appendChild(span);
  scrollToBottom();
}

function scrollToBottom() {
  DOM.consoleBody.scrollTop = DOM.consoleBody.scrollHeight;
}

function copyConsoleOutput() {
  const textContent = DOM.consoleLines.innerText.trim();
  if (!textContent) {
    showToast('Nothing to copy.', 'warning');
    return;
  }
  
  navigator.clipboard.writeText(textContent)
    .then(() => showToast('Console output copied!', 'success'))
    .catch(() => showToast('Failed to copy text.', 'error'));
}

/* ==========================================================================
   Package Manager / Library Loader
   ========================================================================== */
async function loadPackage(packageName) {
  if (!isEngineLoaded) return;
  
  try {
    const pkg = POPULAR_PACKAGES[packageName] || packageName;
    
    // Check if checkbox is valid and needs sync
    const chk = document.getElementById(`pkg-${pkg}`);
    if (chk) chk.checked = true;
    
    await pyodideInstance.loadPackage(pkg);
    loadedPackages.add(pkg);
    
    updateInstalledPackagesList();
    showToast(`Loaded Python library [${pkg}] successfully!`, 'success');
  } catch (error) {
    console.error(`Library [${packageName}] failed to load:`, error);
    showToast(`Failed to load library [${packageName}].`, 'error');
  }
}

async function installPypiPackage() {
  const pkgNameInput = DOM.pypiPkgName.value.trim();
  if (!pkgNameInput) {
    showPypiInstallStatus('Please enter a package name.', 'error');
    return;
  }
  
  if (loadedPackages.has(pkgNameInput)) {
    showPypiInstallStatus('Package is already installed.', 'success');
    return;
  }

  try {
    showPypiInstallStatus(`Installing ${pkgNameInput} from PyPI...`, 'loading');
    updateEngineStatus('installing', `Installing package [${pkgNameInput}]...`, 'fa-cloud-arrow-down fa-bounce');
    DOM.btnInstallPypi.disabled = true;
    
    // Load micropip wrapper
    const micropip = pyodideInstance.pyimport('micropip');
    
    // Download and install
    await micropip.install(pkgNameInput);
    
    loadedPackages.add(pkgNameInput);
    updateInstalledPackagesList();
    
    showPypiInstallStatus(`Success! Package "${pkgNameInput}" installed.`, 'success');
    showToast(`Successfully installed ${pkgNameInput} from PyPI!`, 'success');
    
    DOM.pypiPkgName.value = '';
  } catch (error) {
    console.error('PyPI installation error:', error);
    showPypiInstallStatus(`Installation failed. Note: Only pure Python libraries are supported.`, 'error');
    showToast(`Failed to install package ${pkgNameInput}.`, 'error');
  } finally {
    DOM.btnInstallPypi.disabled = false;
    updateEngineStatus('ready', 'Python Engine Ready', 'fa-check');
  }
}

function showPypiInstallStatus(text, type) {
  DOM.installStatusMsg.className = `install-status-msg ${type}`;
  if (type === 'loading') {
    DOM.installStatusMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`;
  } else {
    DOM.installStatusMsg.textContent = text;
  }
}

function updateInstalledPackagesList() {
  // Clear the section, keep default list element
  DOM.installedList.innerHTML = `
    <li><i class="fa-solid fa-check text-green"></i> <span>Python Standard Library (sys, math, json, datetime, etc.)</span></li>
  `;
  
  loadedPackages.forEach(pkg => {
    const li = document.createElement('li');
    li.innerHTML = `<i class="fa-solid fa-check text-green"></i> <span style="font-weight: 600;">${pkg}</span>`;
    DOM.installedList.appendChild(li);
  });
}

function syncCheckboxState(checkbox) {
  const pkg = checkbox.value;
  if (checkbox.checked) {
    if (!loadedPackages.has(pkg)) {
      updateEngineStatus('installing', `Loading library [${pkg}]...`, 'fa-cloud-arrow-down fa-bounce');
      loadPackage(pkg).then(() => {
        updateEngineStatus('ready', 'Python Engine Ready', 'fa-check');
      });
    }
  } else {
    // Unchecking doesn't physically unload WASM cache files, but we can clear them from state if needed
    // However, in WASM it's safer to keep them loaded to avoid runtime exceptions. We just notify user.
    showToast(`Package [${pkg}] remains loaded in WASM session memory.`, 'info');
    checkbox.checked = true; // lock it as active in the environment UI
  }
}

/* ==========================================================================
   Toasts Notifications System
   ========================================================================== */
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;
  
  DOM.toastContainer.appendChild(toast);
  
  // Trigger animations
  setTimeout(() => toast.classList.add('show'), 50);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

/* ==========================================================================
   UI Event Bindings & Initializers
   ========================================================================== */
function bindEvents() {
  // Code editor execution
  DOM.btnRun.addEventListener('click', runCode);
  
  // Clear editor code
  DOM.btnClear.addEventListener('click', () => {
    if (monacoEditor) {
      monacoEditor.setValue('');
      clearEditorMarkers();
      showToast('Workspace cleared.', 'info');
    }
  });

  // Reset editor template
  DOM.btnReset.addEventListener('click', () => {
    if (monacoEditor) {
      monacoEditor.setValue(DEFAULT_CODE);
      clearEditorMarkers();
      showToast('Workspace reset to template.', 'info');
    }
  });

  // Keyboard shortcut Ctrl+Enter to Run Code
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
    }
  });

  // Console layout commands
  DOM.btnConsoleClear.addEventListener('click', () => {
    clearConsole();
    showToast('Terminal output cleared.', 'info');
  });
  DOM.btnConsoleCopy.addEventListener('click', copyConsoleOutput);
  DOM.btnConsoleClose.addEventListener('click', closeConsole);
  
  // Modal Package Actions
  DOM.btnEnvManager.addEventListener('click', () => {
    DOM.packagesModal.classList.add('active');
  });
  
  const closeModal = () => {
    DOM.packagesModal.classList.remove('active');
    DOM.installStatusMsg.className = 'install-status-msg';
    DOM.installStatusMsg.textContent = '';
  };
  
  DOM.modalClose.addEventListener('click', closeModal);
  DOM.btnModalCloseAction.addEventListener('click', closeModal);
  
  // Modal backdrop click closes modal
  DOM.packagesModal.addEventListener('click', (e) => {
    if (e.target === DOM.packagesModal) {
      closeModal();
    }
  });

  // Checkbox interactions
  DOM.pkgCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => syncCheckboxState(checkbox));
  });

  // PyPI installer trigger
  DOM.btnInstallPypi.addEventListener('click', installPypiPackage);
  DOM.pypiPkgName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      installPypiPackage();
    }
  });
}

// Initializing Web Application
function initializeApp() {
  bindEvents();
  initMonaco();
  initPyodideEngine();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
