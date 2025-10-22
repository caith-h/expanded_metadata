# Expanded Metadata

View detailed model information and preview images from CivitAI directly in SwarmUI.

## Features

- **Model Information**: View comprehensive metadata for your Stable Diffusion models
- **CivitAI Integration**: Automatically fetches model details, descriptions, and preview images
- **Local Caching**: Downloads and stores images locally for offline access
- **Generation Parameters**: View prompts, settings, and parameters used for each preview image
- **Hash-Based**: Metadata persists even if you rename or move models
- **One-Click Import**: Send generation parameters directly to SwarmUI or your clipboard with a single click

## Installation

1. Clone this repository into your SwarmUI extensions folder:
   
   ```bash
   cd /path/to/SwarmUI/src/Extensions
   git clone https://github.com/caith-h/expanded_metadata.git
   ```

2. Restart SwarmUI

## Usage

1. Open the **Model Browser** in SwarmUI
2. Select any local safetensors model
3. Click **"View Expanded Metadata"**

### First Time

The first time you view a model's metadata, the extension will:

- Calculate model hashes
- Look up the model on CivitAI
- Download preview images
- Cache everything locally

This may take a few moments.

### Subsequent Views

All data is cached locally, so viewing the same model again is instant.

### Refresh Metadata

Click the **"Refresh Metadata"** button in the modal to re-download fresh data from CivitAI.

## What You'll See

- **File Information**: Name and path
- **Model Hashes**: AutoV2 and AutoV3 hashes (collapsible)
- **Embedded Metadata**: Model architecture, resolution, training info (collapsible)
- **CivitAI Information**:
  - Model name, version, creator, base model
  - Description
  - Download and like statistics
  - Trigger words
  - Tags
- **Preview Images**: Each image shows:
  - Thumbnail preview
  - Full prompt and negative prompt
  - Generation settings (steps, CFG, sampler, scheduler, etc.)
  - One-click parameter import buttons

## Data Storage

All metadata and images are stored in:

```
{SwarmUI_Root}/expanded_metadata/
metadata/     # JSON metadata files
images/       # Downloaded preview images
```

Files are organized by model hash, so they persist across model renames and moves.

## License

MIT
