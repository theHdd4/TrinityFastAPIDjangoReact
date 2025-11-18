# Exhibition Mode Operations Palette - Missing APIs Analysis

## Overview
This document identifies operations palette features in Exhibition Mode that currently don't have backend APIs.

## Existing APIs

### Exhibition APIs (FastAPI)
- ✅ `GET /exhibition/configuration` - Get exhibition configuration
- ✅ `POST /exhibition/configuration` - Save exhibition configuration
- ✅ `GET /exhibition/layout` - Get layout configuration
- ✅ `POST /exhibition/layout` - Save layout configuration
- ✅ `GET /exhibition/manifest` - Get manifest for component
- ✅ `GET /exhibition/shared/{token}` - Get shared exhibition layout
- ✅ `POST /exhibition/export/pptx` - Export to PowerPoint
- ✅ `POST /exhibition/export/pdf` - Export to PDF
- ✅ `POST /exhibition/export/screenshots` - Export slide screenshots
- ✅ `WebSocket /exhibition/sync/{client_name}/{app_name}/{project_name}` - Real-time sync

### Images API
- ✅ `GET /images` - Fetch stored images (with query params)
- ✅ `GET /images/content?object_name={name}` - Get image content
- ✅ `POST /images/upload` - Upload images

## Operations Palette Features

### Operations (Left Sidebar)

#### 1. **Trinity AI (AI Assistant)** ❌ NO API
- **Location**: `operations/ai-assistant/index.ts`
- **Status**: Button exists but no functionality implemented
- **Missing API**: 
  - No endpoint for AI assistant interactions
  - No endpoint for AI-generated content
  - No endpoint for AI suggestions

#### 2. **Text** ✅ NO API NEEDED
- **Location**: `operations/text/index.ts`
- **Status**: Creates text boxes locally
- **API Status**: Handled by `/exhibition/layout` POST endpoint (saves slide objects)

#### 3. **Images** ✅ HAS API
- **Location**: `operations/images/index.ts`
- **Status**: Uses `IMAGES_API` for fetching/uploading
- **APIs Used**: 
  - `GET /images` - Fetch stored images
  - `GET /images/content` - Get image content
  - `POST /images/upload` - Upload images
  - External: Pixabay API for stock images

#### 4. **Tables** ✅ NO API NEEDED
- **Location**: `operations/tables/index.ts`
- **Status**: Creates tables locally
- **API Status**: Handled by `/exhibition/layout` POST endpoint (saves slide objects)

#### 5. **Shapes** ✅ NO API NEEDED
- **Location**: `operations/shapes/index.ts`
- **Status**: Creates shapes locally
- **API Status**: Handled by `/exhibition/layout` POST endpoint (saves slide objects)

#### 6. **Charts** ✅ NO API NEEDED
- **Location**: `operations/charts/index.ts`
- **Status**: Creates charts locally
- **API Status**: Handled by `/exhibition/layout` POST endpoint (saves slide objects)

### Tools (Right Sidebar)

#### 7. **Templates** ❌ NO API
- **Location**: `tools/templates/index.ts`, `templates/TemplatesPanel.tsx`
- **Status**: Uses hardcoded `TEMPLATE_DEFINITIONS` constant
- **Missing API**:
  - `GET /exhibition/templates` - Fetch available templates
  - `GET /exhibition/templates/{template_id}` - Get template details
  - `POST /exhibition/templates` - Create custom template
  - `PUT /exhibition/templates/{template_id}` - Update template
  - `DELETE /exhibition/templates/{template_id}` - Delete template
  - `GET /exhibition/templates/search?q={query}` - Search templates

#### 8. **Themes** ❌ NO API
- **Location**: `tools/themes/index.ts`, `themes/ThemesPanel.tsx`
- **Status**: Uses hardcoded `EXHIBITION_THEME_PRESETS` from store
- **Missing API**:
  - `GET /exhibition/themes` - Fetch available themes
  - `GET /exhibition/themes/{theme_id}` - Get theme details
  - `POST /exhibition/themes` - Create custom theme
  - `PUT /exhibition/themes/{theme_id}` - Update theme
  - `DELETE /exhibition/themes/{theme_id}` - Delete theme
  - `GET /exhibition/themes/presets` - Get preset themes

#### 9. **Settings** ✅ NO API NEEDED
- **Location**: `tools/settings/SettingsPanel.tsx`
- **Status**: Manages presentation settings locally
- **API Status**: Handled by `/exhibition/configuration` POST endpoint

## Summary

### Features Requiring New APIs

1. **Trinity AI (AI Assistant)**
   - Priority: High (feature exists but non-functional)
   - Required Endpoints:
     - `POST /exhibition/ai/assist` - Get AI assistance
     - `POST /exhibition/ai/generate` - Generate content
     - `POST /exhibition/ai/suggest` - Get suggestions

2. **Templates**
   - Priority: Medium (currently hardcoded)
   - Required Endpoints:
     - `GET /exhibition/templates` - List templates
     - `GET /exhibition/templates/{id}` - Get template
     - `POST /exhibition/templates` - Create template
     - `PUT /exhibition/templates/{id}` - Update template
     - `DELETE /exhibition/templates/{id}` - Delete template
     - `GET /exhibition/templates/search` - Search templates

3. **Themes**
   - Priority: Medium (currently hardcoded)
   - Required Endpoints:
     - `GET /exhibition/themes` - List themes
     - `GET /exhibition/themes/{id}` - Get theme
     - `POST /exhibition/themes` - Create theme
     - `PUT /exhibition/themes/{id}` - Update theme
     - `DELETE /exhibition/themes/{id}` - Delete theme
     - `GET /exhibition/themes/presets` - Get preset themes

### Features That Don't Need APIs

- Text boxes (saved via layout API)
- Tables (saved via layout API)
- Shapes (saved via layout API)
- Charts (saved via layout API)
- Settings (saved via configuration API)
- Images (already has API)

## Recommendations

1. **High Priority**: Implement Trinity AI API endpoints
2. **Medium Priority**: Implement Templates API for dynamic template management
3. **Medium Priority**: Implement Themes API for dynamic theme management
4. **Low Priority**: Consider adding analytics/usage tracking APIs for templates and themes

