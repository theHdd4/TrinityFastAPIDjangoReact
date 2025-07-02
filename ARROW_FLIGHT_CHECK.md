# Verifying Arrow Flight Integration

Follow these steps to confirm that the Arrow Flight server and client utilities work correctly.

1. **Build the containers**
   ```bash
   cd TrinityBackendDjango
   docker-compose up --build
   ```
   This installs `pyarrow` and starts a dedicated Flight service on port `8815`.

2. **Run the unit tests**
   ```bash
   pytest TrinityBackendFastAPI/tests/test_arrow_flight.py -q
   ```
   The tests launch an in-memory Flight server and perform an upload/download round trip.

3. **Interact manually** (optional)
   ```python
   from TrinityBackendFastAPI.app.utils.arrow_client import upload_dataframe, download_dataframe
   import pandas as pd

   df = pd.DataFrame({'a': [1, 2]})
   upload_dataframe(df, "demo/table")
   df_back = download_dataframe("demo/table")
   print(df_back)
   ```
   If the dataframe prints without errors, Arrow Flight is operational.

The Feature Overview atom will automatically fetch the latest dataset via Flight whenever a Data Upload & Validate atom precedes it.
