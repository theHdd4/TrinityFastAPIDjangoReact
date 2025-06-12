from minio import Minio
from minio.error import S3Error
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
import io
import json
from typing import List
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorCollection

from .deps import get_unique_dataframe_results_collection,get_summary_results_collection,get_validator_atoms_collection
from .mongodb_saver import save_feature_overview_results,save_feature_overview_unique_results,fetch_dimensions_dict

from .feature_overview.base import run_unique_count,run_feature_overview, output_store, unique_count


# MinIO client initialization
minio_client = Minio(
    "minioapi.quantmatrixai.com",
    access_key="admin_dev",
    secret_key="pass_dev",
    secure=False  # Set to True if using HTTPS
)

router = APIRouter()


@router.get("/ping")
async def ping():
    return {"msg": "Feature overview is alive"}


@router.post("/uniquecount")
async def feature_overview_uniquecountendpoint(
    bucket_name: str = Form(...),
    object_names: List[str] = Form(...),
    # dimension_json: str = Form(...),
    # id:str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    results_collection=Depends(get_unique_dataframe_results_collection),
    validator_collection: AsyncIOMotorCollection = Depends(get_validator_atoms_collection),
   
):
    try:

        dimensions = await fetch_dimensions_dict(validator_atom_id, file_key, validator_collection)




        dataframes = []
        for object_name in object_names:
            response = minio_client.get_object(bucket_name, object_name)
            content = response.read()
            if object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise ValueError(f"Unsupported file format: {object_name}")
            df.columns = df.columns.str.lower()
            dataframes.append(df)

        if not dataframes:
            raise ValueError("No valid files fetched from MinIO")

        combined_df = pd.concat(dataframes, ignore_index=True)
        result = run_unique_count(
            combined_df,
            dimensions
        )

        # Save the results
        await save_feature_overview_unique_results(unique_count, results_collection,validator_atom_id, file_key)
        




        return JSONResponse(content={"status": result,"dimensions": dimensions})
    
    except S3Error as e:
        return JSONResponse(status_code=500, content={"status": "FAILURE", "error": str(e)})

    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "FAILURE", "error": str(e)})





@router.post("/summary")
async def feature_overview_summaryendpoint(
    bucket_name: str = Form(...),
    object_names: List[str] = Form(...),
    # dimension_json: str = Form(...),
    # id:str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    create_hierarchy: bool = Form(False),
    create_summary: bool = Form(False),
    combination: str = Form(None),  # Optional specific combo
    results_collection=Depends(get_summary_results_collection),
    validator_collection: AsyncIOMotorCollection = Depends(get_validator_atoms_collection),
   
):
    try:
      
        dimensions = await fetch_dimensions_dict(validator_atom_id, file_key, validator_collection)
        
        combination_dict = None
        if combination:
            try:
                combination_dict = json.loads(combination)
                if not isinstance(combination_dict, dict):
                    raise ValueError("Combination must be a dictionary")
            except Exception as e:
                raise ValueError(f"Invalid combination format: {str(e)}")

        dataframes = []
        for object_name in object_names:
            response = minio_client.get_object(bucket_name, object_name)
            content = response.read()
            if object_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif object_name.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise ValueError(f"Unsupported file format: {object_name}")
            df.columns = df.columns.str.lower()
            dataframes.append(df)

        if not dataframes:
            raise ValueError("No valid files fetched from MinIO")

        combined_df = pd.concat(dataframes, ignore_index=True)
        result = run_feature_overview(
            combined_df,
            dimensions,
            create_hierarchy=create_hierarchy,
            selected_combination=combination_dict,
            create_summary=create_summary
        )

        # Save the results
        await save_feature_overview_results(output_store, results_collection,validator_atom_id, file_key)
        




        return JSONResponse(content={"status": result,"dimensions": dimensions})
    
    except S3Error as e:
        return JSONResponse(status_code=500, content={"status": "FAILURE", "error": str(e)})

    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "FAILURE", "error": str(e)})







@router.get("/unique_dataframe_results")
def get_feature_overview_unique_dataframe_results():
    if not unique_count:
        raise HTTPException(status_code=404, detail="No results available")

    result = {}
    for key, val in unique_count["unique_result"].items():
        if isinstance(val, pd.DataFrame):
            result[key] = val.to_dict(orient="records")
        else:
            result[key] = val

    return result




@router.get("/results")
def get_feature_overview_results():
    if not output_store:
        raise HTTPException(status_code=404, detail="No results available")

    result = {}
    for key, val in output_store["result"].items():
        if isinstance(val, pd.DataFrame):
            result[key] = val.to_dict(orient="records")
        else:
            result[key] = val

    return result
