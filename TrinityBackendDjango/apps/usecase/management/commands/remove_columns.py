from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Remove molecules_used and atoms_in_molecules columns from trinity_db_public_table_usecase'

    def handle(self, *args, **options):
        """
        Remove the unwanted columns from the usecase table.
        This command ensures deprecated columns are permanently removed.
        """
        self.stdout.write("🗑️ Removing deprecated columns (molecules_used, atoms_in_molecules)...")
        
        try:
            with connection.cursor() as cursor:
                # Check if columns exist first
                cursor.execute("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'usecase' 
                    AND column_name IN ('molecules_used', 'atoms_in_molecules')
                """)
                
                existing_columns = [row[0] for row in cursor.fetchall()]
                
                if not existing_columns:
                    self.stdout.write("✅ No deprecated columns found - schema is clean!")
                    return
                
                self.stdout.write(f"Found deprecated columns to remove: {existing_columns}")
                
                # Remove columns one by one
                for column in existing_columns:
                    cursor.execute(f"ALTER TABLE usecase DROP COLUMN IF EXISTS {column}")
                    self.stdout.write(f"✅ Removed column: {column}")
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully removed {len(existing_columns)} deprecated columns from usecase table"
                    )
                )
                
                # Verify the schema is now clean
                self.stdout.write("🔍 Verifying schema is clean...")
                cursor.execute("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'usecase'
                    ORDER BY ordinal_position
                """)
                
                remaining_columns = [row[0] for row in cursor.fetchall()]
                self.stdout.write(f"📊 Current columns ({len(remaining_columns)}): {remaining_columns}")
                
                # Check for any remaining deprecated columns
                deprecated_columns = ['molecules_used', 'atoms_in_molecules']
                still_deprecated = [col for col in remaining_columns if col in deprecated_columns]
                
                if still_deprecated:
                    self.stdout.write(
                        self.style.ERROR(f"❌ Still found deprecated columns: {still_deprecated}")
                    )
                else:
                    self.stdout.write(
                        self.style.SUCCESS("✅ Schema is now clean - no deprecated columns!")
                    )
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error removing columns: {str(e)}")
            )
            raise
