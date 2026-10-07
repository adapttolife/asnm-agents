import * as fs from 'fs';

// Create /locks directory if it doesn't exist
try {
    await fs.promises.mkdir('./locks', { recursive: true });
} catch (err) {
    console.error('Error creating locks directory:', err);
};

// Get all locks
export const all = async () => {
    try {
        const files = await fs.promises.readdir('./locks');
        return files.filter(file => file.endsWith('.lock')).map(file => file.replace('.lock', ''));
    } catch (err) {
        console.error('Error reading lock files:', err);
        return [];
    };
};

// Get if a lock exists
export const get = async (lockName) => {
    const lockFilePath = `./locks/${lockName}.lock`;
    try {
        const lockFile = await fs.promises.access(lockFilePath, fs.constants.F_OK)
            .then(() => true)
            .catch(() => false);
        if (lockFile) return true;
    } catch (err) {
        console.error(`Error checking lock file ${lockFilePath}:`, err);
        return true;
    };
    return false;
};

// Set a lock
export const set = async (lockName) => {
    const lockFilePath = `./locks/${lockName}.lock`;
    try {
        await fs.promises.writeFile(lockFilePath, 'locked', { flag: 'wx' });
        return true;
    } catch (err) {
        if (err.code === 'EEXIST') {
            console.error(`Lock file ${lockFilePath} already exists.`);
            return false;
        };
        console.error(`Error creating lock file ${lockFilePath}:`, err);
        return false;
    };
};

// Remove a lock
export const remove = async (lockName) => {
    const lockFilePath = `./locks/${lockName}.lock`;
    try {
        await fs.promises.unlink(lockFilePath);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`Lock file ${lockFilePath} does not exist.`);
            return false;
        };
        console.error(`Error removing lock file ${lockFilePath}:`, err);
        return false;
    };
};

export default {
    all,
    get,
    set,
    remove,
    exists: get,
    delete: remove,
    del: remove,
};