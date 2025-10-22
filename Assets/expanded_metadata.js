// Expanded Metadata Extension - Client Side

// Debug flag - set to 1 to enable debug logging
const EXPANDED_METADATA_DEBUG = 0;

// Debug logging function
function debugLog(...args) {
    if (EXPANDED_METADATA_DEBUG) {
        console.log('[ExpandedMetadata]', ...args);
    }
}

// Wait for the page to load
document.addEventListener('DOMContentLoaded', function() {
    debugLog('Extension loaded');
});

// Hook into the model browser to add our button
// This function gets called when model buttons are being generated
function expandedMetadata_addButton(model, buttonContainer) {
    if (!model.data.local) {
        return; // Only show for local models
    }

    // Create the "View Expanded Metadata" button
    let button = document.createElement('button');
    button.className = 'btn btn-primary basic-button translate';
    button.textContent = translate('View Expanded Metadata');
    button.onclick = () => viewExpandedMetadata(model.data.name);

    buttonContainer.push({
        label: 'View Expanded Metadata',
        onclick: () => viewExpandedMetadata(model.data.name)
    });
}

// Store current model info for refresh
let currentExpandedMetadataModel = null;
let currentExpandedMetadataSubtype = null;

// Main function to view expanded metadata
function viewExpandedMetadata(modelPath, subtype = 'Stable-Diffusion') {
    // Store for refresh
    currentExpandedMetadataModel = modelPath;
    currentExpandedMetadataSubtype = subtype;

    // Show loading modal
    showExpandedMetadataModal('Loading...', '<div class="spinner-border" role="status"><span class="sr-only">Loading...</span></div>');

    debugLog('Requesting metadata for', modelPath, 'subtype:', subtype);

    // Call API to get/create metadata (using callback style, not async/await)
    genericRequest('GetExpandedMetadata', { model_path: modelPath, subtype: subtype }, (result) => {
        debugLog('Received result', result);

        if (!result) {
            showExpandedMetadataModal('Error', `<p class="text-danger">Error: No response from server</p>`);
            return;
        }

        if (result.error) {
            showExpandedMetadataModal('Error', `<p class="text-danger">Error: ${escapeHtml(result.error)}</p>`);
            return;
        }

        // Build the display HTML
        let html = buildExpandedMetadataHTML(result);
        showExpandedMetadataModal('Expanded Metadata', html);
    }, null, (error) => {
        // Error handler
        debugLog('Failed to load expanded metadata:', error);
        showExpandedMetadataModal('Error', `<p class="text-danger">Failed to load metadata: ${escapeHtml(error?.message || String(error))}</p>`);
    });
}

// Build HTML for displaying expanded metadata
function buildExpandedMetadataHTML(metadata) {
    let html = '<div class="expanded-metadata-container">';

    // File info section (always visible)
    html += '<div class="metadata-section">';
    html += `<p><strong>File Name:</strong> ${escapeHtml(metadata.file_name || 'N/A')}</p>`;
    html += `<p><strong>File Path:</strong> <code>${escapeHtml(metadata.file_path || 'N/A')}</code></p>`;
    html += '</div>';

    // Hashes section (collapsible)
    if (metadata.hashes) {
        html += '<details class="metadata-collapsible">';
        html += '<summary><strong>Model Hashes</strong></summary>';
        html += '<div class="metadata-collapsible-content">';
        html += `<p><strong>AutoV2 (Full File):</strong> <code>${escapeHtml(metadata.hashes.sha256_autov2 || 'N/A')}</code></p>`;
        html += `<p><strong>AutoV2 Short:</strong> <code>${escapeHtml(metadata.hashes.autov2_short || 'N/A')}</code></p>`;
        html += `<p><strong>AutoV3 (Tensor):</strong> <code>${escapeHtml(metadata.hashes.sha256_autov3 || 'N/A')}</code></p>`;
        html += `<p><strong>AutoV3 Short:</strong> <code>${escapeHtml(metadata.hashes.autov3_short || 'N/A')}</code></p>`;
        html += '</div>';
        html += '</details>';
    }

    // File metadata section (collapsible)
    if (metadata.file_metadata) {
        html += '<details class="metadata-collapsible">';
        html += '<summary><strong>Embedded Metadata</strong></summary>';
        html += '<div class="metadata-collapsible-content">';

        // Key fields to display nicely
        const keyFields = [
            'modelspec.title', 'modelspec.architecture', 'modelspec.prediction_type',
            'modelspec.resolution', 'modelspec.date', 'ss_network_dim', 'ss_network_alpha',
            'ss_network_module', 'ss_base_model_version', 'ss_v2'
        ];

        html += '<div class="metadata-grid">';
        for (let field of keyFields) {
            if (metadata.file_metadata[field]) {
                let label = field.replace('modelspec.', '').replace('ss_', '').replace(/_/g, ' ');
                label = label.charAt(0).toUpperCase() + label.slice(1);
                html += `<div class="metadata-item"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(metadata.file_metadata[field]))}</div>`;
            }
        }
        html += '</div>';

        // Show full metadata as nested collapsible JSON
        html += '<details class="mt-3"><summary>Show All Embedded Metadata (JSON)</summary>';
        html += `<pre class="metadata-json">${escapeHtml(JSON.stringify(metadata.file_metadata, null, 2))}</pre>`;
        html += '</details>';
        html += '</div>';
        html += '</details>';
    }

    // CivitAI section
    if (metadata.civitai && metadata.civitai.data) {
        let civitai = metadata.civitai.data;
        html += '<div class="metadata-section civitai-section">';
        html += '<h4>CivitAI Information</h4>';

        if (civitai.model) {
            // Compact inline boxes for model, version, creator
            html += '<div class="civitai-info-boxes">';
            html += `<div class="info-box"><strong>Model:</strong> <a href="${escapeHtml(metadata.civitai.model_url)}" target="_blank">${escapeHtml(civitai.model.name)}</a></div>`;
            html += `<div class="info-box"><strong>Version:</strong> ${escapeHtml(civitai.name || 'N/A')}</div>`;
            if (civitai.model.creator) {
                html += `<div class="info-box"><strong>Creator:</strong> ${escapeHtml(civitai.model.creator.username || 'N/A')}</div>`;
            }
            html += `<div class="info-box"><strong>Base Model:</strong> ${escapeHtml(civitai.baseModel || 'N/A')}</div>`;
            html += '</div>';

            // Stats inline
            if (civitai.stats) {
                html += '<div class="civitai-stats">';
                html += `<span><strong>Downloads:</strong> ${(civitai.stats.downloadCount || 0).toLocaleString()}</span> | `;
                html += `<span><strong>Likes:</strong> ${(civitai.stats.thumbsUpCount || 0).toLocaleString()}</span>`;
                html += '</div>';
            }

            if (civitai.description) {
                html += `<div class="civitai-description"><strong>Description:</strong><br>${civitai.description}</div>`;
            }

            if (civitai.trainedWords && civitai.trainedWords.length > 0) {
                html += '<p><strong>Trigger Words:</strong> ';
                html += civitai.trainedWords.map(w => `<span class="badge badge-primary">${escapeHtml(w)}</span>`).join(' ');
                html += '</p>';
            }

            if (civitai.model.tags && civitai.model.tags.length > 0) {
                html += '<p><strong>Tags:</strong> ';
                html += civitai.model.tags.map(t => `<span class="badge badge-secondary">${escapeHtml(t)}</span>`).join(' ');
                html += '</p>';
            }
        }

        // Images gallery - now with generation parameters
        if (civitai.images && civitai.images.length > 0) {
            html += '<h5 style="margin-top: 20px;">Preview Images</h5>';

            for (let i = 0; i < civitai.images.length; i++) {
                let img = civitai.images[i];
                let imgPath = img.local_path;
                let meta = img.meta;

                debugLog(`Image ${i}: local_path=${imgPath}, url=${img.url}`);

                html += '<div class="image-row">';

                // Image on the left
                html += '<div class="image-row-image">';
                if (imgPath) {
                    let imgUrl = `/ExpandedMetadataImage/${escapeHtml(imgPath)}`;
                    let isVideo = imgPath.endsWith('.mp4') || imgPath.endsWith('.webm');
                    if (isVideo) {
                        let videoType = imgPath.endsWith('.mp4') ? 'mp4' : 'webm';
                        html += `<video controls class="preview-thumbnail"><source src="${imgUrl}" type="video/${videoType}"></video>`;
                    } else {
                        html += `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" class="preview-thumbnail" loading="lazy" alt="Preview" /></a>`;
                    }
                } else if (img.url) {
                    if (img.url.endsWith('.mp4') || img.url.endsWith('.webm')) {
                        html += `<video controls class="preview-thumbnail"><source src="${escapeHtml(img.url)}" type="video/${img.url.endsWith('.mp4') ? 'mp4' : 'webm'}"></video>`;
                    } else {
                        html += `<a href="${escapeHtml(img.url)}" target="_blank"><img src="${escapeHtml(img.url)}" class="preview-thumbnail" loading="lazy" /></a>`;
                    }
                }
                html += '</div>';

                // Generation parameters on the right
                html += '<div class="image-row-params">';
                if (meta) {
                    // Prompt and negative prompt (full width)
                    if (meta.prompt) {
                        html += `<div class="param-full param-with-actions">
                            <div class="param-actions">
                                <button class="param-action-btn" onclick="copyTextToClipboard(\`${meta.prompt.replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\\/g, '\\\\')}\`, this)" title="Copy to clipboard">📋</button>
                                <button class="param-action-btn" onclick="document.getElementById('alt_prompt_textbox').value=\`${meta.prompt.replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\\/g, '\\\\')}\`; this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to prompt">📤</button>
                            </div>
                            <strong>Prompt:</strong> ${escapeHtml(meta.prompt)}
                        </div>`;
                    }
                    if (meta.negativePrompt) {
                        html += `<div class="param-full param-with-actions">
                            <div class="param-actions">
                                <button class="param-action-btn" onclick="copyTextToClipboard(\`${meta.negativePrompt.replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\\/g, '\\\\')}\`, this)" title="Copy to clipboard">📋</button>
                                <button class="param-action-btn" onclick="document.getElementById('alt_negativeprompt_textbox').value=\`${meta.negativePrompt.replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\\/g, '\\\\')}\`; this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to negative prompt">📤</button>
                            </div>
                            <strong>Negative:</strong> ${escapeHtml(meta.negativePrompt)}
                        </div>`;
                    }

                    // Inline boxes for common parameters
                    html += '<div class="param-boxes">';
                    if (meta.seed !== undefined && meta.seed !== null) {
                        html += `<span class="param-box param-box-sendable">
                            Seed: ${escapeHtml(String(meta.seed))}
                            <button class="param-send-btn" onclick="sendParamToSwarmUI('seed', ${meta.seed}); this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to SwarmUI">📤</button>
                        </span>`;
                    }
                    if (meta.steps) {
                        html += `<span class="param-box param-box-sendable">
                            Steps: ${escapeHtml(String(meta.steps))}
                            <button class="param-send-btn" onclick="sendParamToSwarmUI('steps', ${meta.steps}); this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to SwarmUI">📤</button>
                        </span>`;
                    }
                    if (meta.cfgScale) {
                        html += `<span class="param-box param-box-sendable">
                            CFG: ${escapeHtml(String(meta.cfgScale))}
                            <button class="param-send-btn" onclick="sendParamToSwarmUI('cfgscale', ${meta.cfgScale}); this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to SwarmUI">📤</button>
                        </span>`;
                    }
                    if (meta.Size) html += `<span class="param-box">Size: ${escapeHtml(meta.Size)}</span>`;

                    // Parse sampler - need to extract base sampler and scheduler
                    if (meta.sampler) {
                        let samplerData = parseSamplerString(meta.sampler);
                        html += `<span class="param-box param-box-sendable">
                            Sampler: ${escapeHtml(meta.sampler)}
                            <button class="param-send-btn" onclick="sendParamToSwarmUI('sampler', '${samplerData.sampler.replace(/'/g, "\\'")}'); this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to SwarmUI">📤</button>
                        </span>`;
                    }
                    if (meta.scheduler) {
                        let schedulerValue = meta.scheduler.toLowerCase();
                        html += `<span class="param-box param-box-sendable">
                            Scheduler: ${escapeHtml(meta.scheduler)}
                            <button class="param-send-btn" onclick="sendParamToSwarmUI('scheduler', '${schedulerValue.replace(/'/g, "\\'")}'); this.innerHTML='✓'; setTimeout(() => this.innerHTML='📤', 1000)" title="Send to SwarmUI">📤</button>
                        </span>`;
                    }
                    html += '</div>';

                    // Horizontal rule
                    html += '<hr class="param-divider">';

                    // All other metadata (inline boxes)
                    html += '<div class="param-boxes-other">';
                    const commonKeys = ['prompt', 'negativePrompt', 'steps', 'cfgScale', 'Size', 'sampler', 'scheduler'];
                    for (let key in meta) {
                        if (!commonKeys.includes(key) && meta[key] !== null && meta[key] !== undefined) {
                            html += `<span class="param-box">${escapeHtml(key)}: ${escapeHtml(String(meta[key]))}</span>`;
                        }
                    }
                    html += '</div>';
                } else {
                    html += '<p class="text-muted">No generation parameters available</p>';
                }
                html += '</div>';

                html += '</div>'; // End image-row
            }
        }

        html += '</div>';
    }

    html += '</div>';

    // Add CSS for styling
    html += `
    <style>
        .expanded-metadata-container {
            max-height: 70vh;
            overflow-y: auto;
            padding: 10px;
        }
        .metadata-section {
            margin-bottom: 15px;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid rgba(128, 128, 128, 0.2);
        }
        .metadata-section h4, .metadata-section h5 {
            margin-top: 0;
            margin-bottom: 15px;
        }
        .metadata-collapsible {
            margin-bottom: 10px;
            padding: 10px;
            border: 1px solid rgba(128, 128, 128, 0.2);
            border-radius: 4px;
        }
        .metadata-collapsible summary {
            cursor: pointer;
            user-select: none;
            padding: 5px;
        }
        .metadata-collapsible summary:hover {
            opacity: 0.8;
        }
        .metadata-collapsible-content {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(128, 128, 128, 0.15);
        }
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 10px;
        }
        .metadata-item {
            padding: 8px;
            border-radius: 4px;
            border: 1px solid rgba(128, 128, 128, 0.15);
        }
        .metadata-json {
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            max-height: 400px;
            border: 1px solid rgba(128, 128, 128, 0.3);
            font-size: 0.85em;
        }
        .civitai-info-boxes {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 15px;
        }
        .info-box {
            padding: 8px 12px;
            border-radius: 4px;
            border: 1px solid rgba(128, 128, 128, 0.2);
            flex: 1 1 auto;
            min-width: 150px;
        }
        .civitai-description {
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid rgba(128, 128, 128, 0.15);
        }
        .civitai-stats {
            margin: 10px 0;
            padding: 8px;
        }
        .image-row {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid rgba(128, 128, 128, 0.2);
            border-radius: 8px;
        }
        .image-row-image {
            flex-shrink: 0;
            width: 300px;
        }
        .preview-thumbnail {
            width: 100%;
            height: auto;
            border-radius: 4px;
            cursor: pointer;
        }
        .image-row-params {
            flex: 1;
            min-width: 0;
        }
        .param-full {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 4px;
            border: 1px solid rgba(128, 128, 128, 0.15);
            word-wrap: break-word;
            position: relative;
        }
        .param-with-actions {
            padding-right: 60px;
        }
        .param-actions {
            position: absolute;
            right: 8px;
            top: 8px;
            display: flex;
            gap: 4px;
        }
        .param-action-btn {
            background: none;
            border: none;
            padding: 2px;
            cursor: pointer;
            font-size: 0.9em;
            opacity: 0.6;
            transition: all 0.2s;
        }
        .param-action-btn:hover {
            opacity: 1;
            transform: scale(1.2);
        }
        .param-action-btn:active {
            transform: scale(0.9);
        }
        .param-boxes, .param-boxes-other {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 10px;
        }
        .param-box {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid rgba(128, 128, 128, 0.2);
            font-size: 0.9em;
            white-space: nowrap;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .param-box-sendable {
            position: relative;
            padding-right: 28px;
        }
        .param-send-btn {
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            padding: 2px;
            cursor: pointer;
            font-size: 0.85em;
            opacity: 0.6;
            transition: all 0.2s;
        }
        .param-send-btn:hover {
            opacity: 1;
            transform: translateY(-50%) scale(1.2);
        }
        .param-send-btn:active {
            transform: translateY(-50%) scale(0.9);
        }
        .param-divider {
            margin: 10px 0;
            border: none;
            border-top: 1px solid rgba(128, 128, 128, 0.2);
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            margin: 2px;
            border-radius: 4px;
            font-size: 0.875em;
        }
        .badge-primary {
            background-color: #007bff;
            color: white;
        }
        .badge-secondary {
            background-color: #6c757d;
            color: white;
        }
        @media (max-width: 768px) {
            .image-row {
                flex-direction: column;
            }
            .image-row-image {
                width: 100%;
            }
            .civitai-info-boxes {
                flex-direction: column;
            }
            .info-box {
                width: 100%;
            }
        }
    </style>
    `;

    return html;
}

// Show modal with expanded metadata
function showExpandedMetadataModal(title, content) {
    // Use SwarmUI's existing modal system
    let modalHtml = `
        <div class="modal fade show" id="expandedMetadataModal" tabindex="-1" style="display: block;">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${escapeHtml(title)}</h5>
                        <button type="button" class="close" onclick="closeExpandedMetadataModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" onclick="refreshExpandedMetadata()">Refresh Metadata</button>
                        <button type="button" class="btn btn-secondary" onclick="closeExpandedMetadataModal()">Close</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show"></div>
    `;

    // Remove existing modal if present
    closeExpandedMetadataModal();

    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Refresh the metadata (re-download from online sources)
function refreshExpandedMetadata() {
    if (!currentExpandedMetadataModel) {
        debugLog('No model selected for refresh');
        return;
    }

    // Show loading modal
    showExpandedMetadataModal('Refreshing...', '<div class="spinner-border" role="status"><span class="sr-only">Refreshing metadata...</span></div><p class="mt-3">This may take a moment as images are being downloaded...</p>');

    // Call refresh API
    genericRequest('RefreshExpandedMetadata', {
        model_path: currentExpandedMetadataModel,
        subtype: currentExpandedMetadataSubtype
    }, (result) => {
        debugLog('Refresh complete', result);

        if (!result || result.error) {
            showExpandedMetadataModal('Error', `<p class="text-danger">Error: ${escapeHtml(result?.error || 'Failed to refresh')}</p>`);
            return;
        }

        // Rebuild and show the updated metadata
        let html = buildExpandedMetadataHTML(result);
        showExpandedMetadataModal('Expanded Metadata', html);
    }, null, (error) => {
        debugLog('Failed to refresh metadata:', error);
        showExpandedMetadataModal('Error', `<p class="text-danger">Failed to refresh: ${escapeHtml(error?.message || String(error))}</p>`);
    });
}

// Close the modal
function closeExpandedMetadataModal() {
    let modal = document.getElementById('expandedMetadataModal');
    if (modal) {
        modal.remove();
    }
    let backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
        backdrop.remove();
    }
}

// Parse sampler string to extract sampler and scheduler
function parseSamplerString(samplerString) {
    // CivitAI format is often like "DPM++ 2M SDE Karras"
    // We need to map this to SwarmUI's format
    let sampler = samplerString.toLowerCase().trim();

    // Map common CivitAI sampler names to SwarmUI values
    const samplerMap = {
        'euler a': 'euler_ancestral',
        'euler': 'euler',
        'heun': 'heun',
        'dpm2': 'dpm_2',
        'dpm2 a': 'dpm_2_ancestral',
        'dpm++ 2s a': 'dpmpp_2s_ancestral',
        'dpm++ 2m': 'dpmpp_2m',
        'dpm++ sde': 'dpmpp_sde',
        'dpm++ 2m sde': 'dpmpp_2m_sde',
        'dpm++ 3m sde': 'dpmpp_3m_sde',
        'ddim': 'ddim',
        'plms': 'euler', // fallback
        'uni_pc': 'uni_pc'
    };

    // Try to match the sampler
    let matchedSampler = 'euler'; // default
    for (let key in samplerMap) {
        if (sampler.includes(key)) {
            matchedSampler = samplerMap[key];
            break;
        }
    }

    return { sampler: matchedSampler };
}

// Send parameter to SwarmUI
function sendParamToSwarmUI(paramName, value) {
    try {
        let input = document.getElementById(`input_${paramName}`);
        if (input) {
            input.value = value;
            // Trigger change events
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));

            // For sliders, also update the range slider
            let rangeSlider = document.getElementById(`input_${paramName}_rangeslider`);
            if (rangeSlider) {
                rangeSlider.value = value;
                rangeSlider.dispatchEvent(new Event('input', { bubbles: true }));
                rangeSlider.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            debugLog(`Parameter input not found: ${paramName}`);
        }
    } catch (err) {
        debugLog(`Failed to send parameter ${paramName}:`, err);
    }
}

// Copy text to clipboard with fallback
function copyTextToClipboard(text, button) {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            button.innerHTML = '✓';
            setTimeout(() => button.innerHTML = '📋', 1000);
        }).catch(() => {
            // Fallback to execCommand
            fallbackCopy(text, button);
        });
    } else {
        // Use fallback
        fallbackCopy(text, button);
    }
}

// Fallback copy method using textarea and execCommand
function fallbackCopy(text, button) {
    let textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        button.innerHTML = '✓';
        setTimeout(() => button.innerHTML = '📋', 1000);
    } catch (err) {
        debugLog('Copy failed:', err);
    }
    document.body.removeChild(textarea);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) {
        return '';
    }
    let div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Hook into the model browser system using the modelDescribeCallbacks
window.addEventListener('load', function() {
    debugLog('Registering model describe callback');

    // Wait a bit for the model browser to fully initialize
    setTimeout(function() {
        // Use allModelBrowsers array to register our callback
        if (typeof allModelBrowsers !== 'undefined') {
            for (let browser of allModelBrowsers) {
                if (browser && browser.modelDescribeCallbacks) {
                    // Register our callback
                    browser.modelDescribeCallbacks.push((result, model) => {
                        // Add our button for local safetensors models
                        if (model.data.local) {
                            result.buttons.push({
                                label: 'View Expanded Metadata',
                                onclick: () => viewExpandedMetadata(model.data.name, browser.subType)
                            });
                        }
                    });

                    debugLog(`Registered callback for ${browser.subType} model browser`);
                } else {
                    debugLog(`Warning: ${browser ? browser.subType : 'unknown'} browser has no modelDescribeCallbacks`);
                }
            }
        } else {
            debugLog('Error: allModelBrowsers not found!');
        }
    }, 1000);
});
