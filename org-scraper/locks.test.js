import assert from 'node:assert/strict';
import * as locks from './locks.js';

test('Locks', async () => {
    const initialLocks = await locks.all();
    const setResult = await locks.set('test');
    const lockExists = await locks.get('test');
    const locksAfterSetting = await locks.all();
    const removeResult = await locks.remove('test');
    const lockExistsAfterRemoving = await locks.get('test');
    const locksAfterRemoving = await locks.all();

    assert.ok(!initialLocks.includes('test'));
    assert.ok(setResult);
    assert.ok(lockExists);
    assert.ok(locksAfterSetting.includes('test'));
    assert.ok(removeResult);
    assert.ok(!lockExistsAfterRemoving);
    assert.ok(!locksAfterRemoving.includes('test'));
});