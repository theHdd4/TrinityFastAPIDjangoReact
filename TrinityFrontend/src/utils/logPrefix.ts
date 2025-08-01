export function logMinioPrefix(objectName: string) {
  if (!objectName) return;
  const parts = objectName.split('/');
  if (parts.length >= 3) {
    const prefix = parts.slice(0, 3).join('/');
    console.log('MinIO prefix', prefix);
  }
}
