import os
import uuid
import pandas as pd
from typing import List, Dict, Any, Tuple
from fastapi import UploadFile

UPLOAD_DIR = "./uploaded_dataframes"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def save_upload_file_tmp(upload_file: UploadFile) -> str:
    ext = os.path.splitext(upload_file.filename)[-1]
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    with open(file_path, "wb") as buffer:
        buffer.write(upload_file.file.read())
    return file_id, file_path

def parse_dataframe(file_path: str) -> Tuple[List[str], List[Dict[str, Any]], Dict[str, str]]:
    if file_path.endswith(".csv"):
        df = pd.read_csv(file_path)
    elif file_path.endswith(".xlsx"):
        df = pd.read_excel(file_path)
    else:
        raise ValueError("Unsupported file type")
    headers = list(df.columns)
    rows = df.to_dict(orient="records")
    column_types = {col: ("number" if pd.api.types.is_numeric_dtype(df[col]) else "text") for col in headers}
    return headers, rows, column_types

def save_dataframe(file_id: str, headers: List[str], rows: List[Dict[str, Any]], file_format: str = "csv") -> str:
    df = pd.DataFrame(rows, columns=headers)
    ext = ".csv" if file_format == "csv" else ".xlsx"
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    if file_format == "csv":
        df.to_csv(file_path, index=False)
    else:
        df.to_excel(file_path, index=False)
    return file_path
