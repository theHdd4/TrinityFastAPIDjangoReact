# database.py
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError
from typing import Optional, Dict, Any, List
import logging
from .config import Settings
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
from datetime import datetime, date




logger = logging.getLogger(__name__)

class ValidatorAtomRepository:
    """Database operations for validator atoms and column classifications"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.source_db_name = settings.mongo_source_database  # validator_atoms_db
        self.collection_name = settings.mongo_column_classifications_collection  # column_classifications
    
    def get_database(self):
        """Get MongoDB database connection"""
        try:
            client = MongoClient(
                self.settings.mongo_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            return client[self.source_db_name]
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise
    
    async def get_column_classifications(self, validator_atom_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve column classifications for a specific validator_atom_id
        """
        try:
            db = self.get_database()
            collection = db[self.collection_name]
            
            # Query for the validator atom
            query = {"validator_atom_id": validator_atom_id}
            projection = {
                "_id": 0,  # Exclude MongoDB ObjectId
                "validator_atom_id": 1,
                "file_key": 1,
                "final_classification": 1,
                "classification_metadata": 1,
                "created_at": 1,
                "updated_at": 1,
                "status": 1
            }
            
            result = collection.find_one(query, projection)
            
            # Close connection
            db.client.close()
            
            if result:
                logger.info(f"Found classifications for validator_atom_id: {validator_atom_id}")
                return result
            else:
                logger.warning(f"No classifications found for validator_atom_id: {validator_atom_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error querying column classifications: {str(e)}")
            raise
    
    async def list_available_validator_atoms(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get list of available validator atoms for selection
        """
        try:
            db = self.get_database()
            collection = db[self.collection_name]
            
            # Get distinct validator_atom_ids with basic info
            pipeline = [
                {"$match": {"status": {"$in": ["completed", "active"]}}},
                {"$project": {
                    "_id": 0,
                    "validator_atom_id": 1,
                    "file_key": 1,
                    "created_at": 1,
                    "status": 1
                }},
                {"$limit": limit}
            ]
            
            results = list(collection.aggregate(pipeline))
            db.client.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error listing validator atoms: {str(e)}")
            raise