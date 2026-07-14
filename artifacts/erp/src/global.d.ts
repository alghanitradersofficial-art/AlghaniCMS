declare module 'file-saver' {
  export function saveAs(data: Blob | File, filename?: string): void;
  export default { saveAs };
}
