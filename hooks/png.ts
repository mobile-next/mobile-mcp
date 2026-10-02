// width and height from a PNG's IHDR chunk, big-endian at bytes 16..23
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	return { width: view.getUint32(16), height: view.getUint32(20) };
}

const MAX_CELLS = 255;
// cell height / cell width of the terminal font, measured 17.3px / 8.1px; no API reports it, so tune per font
export const CELL_ASPECT = 2.14;

function clampCells(n: number): number {
	return Math.max(1, Math.min(MAX_CELLS, Math.floor(n)));
}

// the largest box of cells that keeps the picture's aspect and fits inside maxColumns x maxRows
export function fitInside(columnsLimit: number, rowsLimit: number, width: number, height: number): { columns: number; rows: number } {
	const maxColumns = clampCells(columnsLimit);
	const maxRows = clampCells(rowsLimit);
	const rowsAtFullWidth = (maxColumns * height) / width / CELL_ASPECT;
	if (rowsAtFullWidth <= maxRows) {
		return { columns: clampCells(maxColumns), rows: clampCells(rowsAtFullWidth) };
	}

	const columnsAtFullHeight = (maxRows * width * CELL_ASPECT) / height;

	return { columns: clampCells(columnsAtFullHeight), rows: clampCells(maxRows) };
}
