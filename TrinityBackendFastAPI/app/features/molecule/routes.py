# routes.py - Molecule API Routes
from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from .database import (
    save_molecule_to_mongo,
    get_molecules_from_mongo,
    get_molecule_by_id,
    delete_molecule_from_mongo,
    test_mongodb_operations,
    check_mongodb_connection
)
from .config import settings

# Create router instance
router = APIRouter()

# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class MoleculeData(BaseModel):
    """Molecule data model"""
    id: str
    title: str
    type: str = ""
    subtitle: str = ""
    tag: str = ""
    atoms: List[str] = []
    atomOrder: List[str] = []
    selectedAtoms: Dict[str, bool] = {}
    connections: List[Dict[str, Any]] = []
    position: Dict[str, float] = {"x": 0, "y": 0}

class SaveMoleculeRequest(BaseModel):
    """Request model for saving a molecule"""
    molecule: MoleculeData
    user_id: str = ""
    client_id: str = ""
    app_id: str = ""
    project_id: Optional[int] = None

class GetMoleculesRequest(BaseModel):
    """Request model for getting molecules"""
    user_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[int] = None
    molecule_type: str = "client_molecule"

class SaveWorkflowRequest(BaseModel):
    """Request model for saving workflow mode configuration"""
    canvas_molecules: List[Dict[str, Any]]
    custom_molecules: List[Dict[str, Any]]
    user_id: str = ""
    client_name: str = ""
    app_name: str = ""
    project_name: str = ""

class GetWorkflowRequest(BaseModel):
    """Request model for getting workflow configuration"""
    user_id: Optional[str] = None
    client_name: Optional[str] = None
    app_name: Optional[str] = None
    project_name: Optional[str] = None

# =============================================================================
# HEALTH CHECK ENDPOINT
# =============================================================================
@router.get("/health")
async def health_check():
    """Health check endpoint for the molecule service"""
    return {
        "status": "healthy",
        "service": "Molecule API",
        "timestamp": datetime.now().isoformat(),
        "database": settings.molecule_database,
        "collection": settings.molecules_config_collection,
        "port": settings.api_port,
        "version": settings.app_version
    }

# =============================================================================
# DEBUG ENDPOINTS
# =============================================================================
@router.get("/debug/mongodb")
async def check_mongodb_collections():
    """Debug: Check MongoDB connection and collections"""
    try:
        # Test basic connection
        if not check_mongodb_connection():
            return {
                "status": "error",
                "message": "MongoDB connection failed",
                "database": settings.molecule_database,
                "collection": settings.molecules_config_collection,
                "connection": "failed"
            }
        
        # Get detailed MongoDB info
        mongo_result = test_mongodb_operations()
        
        return {
            "status": "success",
            "message": "MongoDB connection and collections verified",
            "database": settings.molecule_database,
            "collection": settings.molecules_config_collection,
            "mongodb_url": settings.mongo_uri,
            "connection": "healthy",
            "full_mongo_result": mongo_result
        }
        
    except Exception as e:
        return {
            "status": "error", 
            "message": f"MongoDB check failed: {str(e)}",
            "database": settings.molecule_database,
            "collection": settings.molecules_config_collection,
            "connection": "error",
            "error": str(e)
        }

# =============================================================================
# MOLECULE CRUD ENDPOINTS
# =============================================================================

@router.post("/save")
async def save_molecule(request: SaveMoleculeRequest):
    """Save a molecule to MongoDB"""
    try:
        # Convert Pydantic model to dict
        molecule_dict = request.molecule.dict()
        
        # Save to MongoDB
        result = save_molecule_to_mongo(
            molecule_dict,
            user_id=request.user_id,
            client_id=request.client_id,
            app_id=request.app_id,
            project_id=request.project_id
        )
        
        if result.get("status") != "success":
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to save molecule"))
        
        return {
            "status": "success",
            "message": "Molecule saved successfully",
            "molecule_id": result.get("molecule_id"),
            "operation": result.get("operation"),
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/get")
async def get_molecules(request: GetMoleculesRequest):
    """Get molecules from MongoDB with optional filtering"""
    try:
        molecules = get_molecules_from_mongo(
            user_id=request.user_id,
            client_id=request.client_id,
            project_id=request.project_id,
            molecule_type=request.molecule_type
        )
        
        return {
            "status": "success",
            "message": f"Retrieved {len(molecules)} molecules",
            "molecules": molecules,
            "count": len(molecules),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/get/{molecule_id}")
async def get_molecule(molecule_id: str):
    """Get a specific molecule by ID"""
    try:
        molecule = get_molecule_by_id(molecule_id)
        
        if not molecule:
            raise HTTPException(status_code=404, detail="Molecule not found")
        
        return {
            "status": "success",
            "message": "Molecule retrieved successfully",
            "molecule": molecule,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.delete("/delete/{molecule_id}")
async def delete_molecule(molecule_id: str):
    """Delete a molecule from MongoDB"""
    try:
        result = delete_molecule_from_mongo(molecule_id)
        
        if result.get("status") != "success":
            raise HTTPException(status_code=404, detail=result.get("error", "Molecule not found"))
        
        return {
            "status": "success",
            "message": "Molecule deleted successfully",
            "molecule_id": molecule_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# =============================================================================
# CONVENIENCE ENDPOINTS
# =============================================================================

@router.get("/client-molecules")
async def get_client_molecules(
    user_id: Optional[str] = None,
    client_id: Optional[str] = None,
    project_id: Optional[int] = None
):
    """Get client molecules (convenience endpoint)"""
    try:
        molecules = get_molecules_from_mongo(
            user_id=user_id,
            client_id=client_id,
            project_id=project_id,
            molecule_type="client_molecule"
        )
        
        return {
            "status": "success",
            "message": f"Retrieved {len(molecules)} client molecules",
            "molecules": molecules,
            "count": len(molecules),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/qm-molecules")
async def get_qm_molecules():
    """Get QM molecules (convenience endpoint for predefined molecules)"""
    try:
        molecules = get_molecules_from_mongo(molecule_type="qm_molecule")
        
        return {
            "status": "success",
            "message": f"Retrieved {len(molecules)} QM molecules",
            "molecules": molecules,
            "count": len(molecules),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# =============================================================================
# BULK OPERATIONS
# =============================================================================

@router.post("/save-multiple")
async def save_multiple_molecules(request: List[SaveMoleculeRequest]):
    """Save multiple molecules to MongoDB"""
    try:
        results = []
        errors = []
        
        for req in request:
            try:
                molecule_dict = req.molecule.dict()
                result = save_molecule_to_mongo(
                    molecule_dict,
                    user_id=req.user_id,
                    client_id=req.client_id,
                    project_id=req.project_id
                )
                
                if result.get("status") == "success":
                    results.append(result)
                else:
                    errors.append({
                        "molecule_id": req.molecule.id,
                        "error": result.get("error", "Unknown error")
                    })
                    
            except Exception as e:
                errors.append({
                    "molecule_id": req.molecule.id,
                    "error": str(e)
                })
        
        return {
            "status": "success",
            "message": f"Processed {len(request)} molecules",
            "saved": len(results),
            "errors": len(errors),
            "results": results,
            "errors": errors,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# =============================================================================
# WORKFLOW MODE ENDPOINTS
# =============================================================================

@router.post("/workflow/save")
async def save_workflow_configuration(request: SaveWorkflowRequest):
    """Save workflow mode configuration to MongoDB"""
    try:
        # Import the workflow save function
        from .database import save_workflow_to_mongo
        
        result = save_workflow_to_mongo(
            canvas_molecules=request.canvas_molecules,
            custom_molecules=request.custom_molecules,
            user_id=request.user_id,
            client_name=request.client_name,
            app_name=request.app_name,
            project_name=request.project_name
        )
        
        if result.get("status") != "success":
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to save workflow configuration"))
        
        return {
            "status": "success",
            "message": "Workflow configuration saved successfully",
            "workflow_id": result.get("workflow_id"),
            "operation": result.get("operation"),
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/workflow/get")
async def get_workflow_configuration(request: GetWorkflowRequest):
    """Get workflow mode configuration from MongoDB"""
    try:
        # Import the workflow get function
        from .database import get_workflow_from_mongo
        
        workflow_data = get_workflow_from_mongo(
            user_id=request.user_id,
            client_name=request.client_name,
            app_name=request.app_name,
            project_name=request.project_name
        )
        
        return {
            "status": "success",
            "message": "Workflow configuration retrieved successfully",
            "workflow_data": workflow_data,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/workflow/get/{workflow_id}")
async def get_workflow_by_id(workflow_id: str):
    """Get a specific workflow configuration by ID"""
    try:
        # Import the workflow get by id function
        from .database import get_workflow_by_id_from_mongo
        
        workflow_data = get_workflow_by_id_from_mongo(workflow_id)
        
        if not workflow_data:
            raise HTTPException(status_code=404, detail="Workflow configuration not found")
        
        return {
            "status": "success",
            "message": "Workflow configuration retrieved successfully",
            "workflow_data": workflow_data,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/workflow/debug/all")
async def debug_all_workflows():
    """Debug endpoint to see all workflow configurations in MongoDB"""
    try:
        from .database import workflow_collection
        
        # Get all workflow documents
        all_workflows = list(workflow_collection.find({}))
        
        # Convert ObjectId to string for JSON serialization
        for workflow in all_workflows:
            if '_id' in workflow:
                workflow['_id'] = str(workflow['_id'])
        
        return {
            "status": "success",
            "message": f"Found {len(all_workflows)} workflow configurations",
            "workflows": all_workflows,
            "count": len(all_workflows),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
