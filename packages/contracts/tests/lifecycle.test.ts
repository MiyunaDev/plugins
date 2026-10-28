import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PluginLifecycleState,
  isValidTransition,
  PERMITTED_TRANSITIONS,
} from '../src/lifecycle.js';

describe('Plugin Lifecycle State Machine Contract', () => {
  describe('Valid Transitions', () => {
    test('DISCOVERED -> INSTALLED is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.DISCOVERED, PluginLifecycleState.INSTALLED), true);
    });

    test('INSTALLED -> INACTIVE is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.INSTALLED, PluginLifecycleState.INACTIVE), true);
    });

    test('INACTIVE -> ACTIVATING is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.INACTIVE, PluginLifecycleState.ACTIVATING), true);
    });

    test('ACTIVATING -> ACTIVE is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.ACTIVATING, PluginLifecycleState.ACTIVE), true);
    });

    test('ACTIVE -> DEACTIVATING is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.ACTIVE, PluginLifecycleState.DEACTIVATING), true);
    });

    test('DEACTIVATING -> INACTIVE is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.DEACTIVATING, PluginLifecycleState.INACTIVE), true);
    });

    test('INACTIVE -> UNINSTALLING -> UNINSTALLED is valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.INACTIVE, PluginLifecycleState.UNINSTALLING), true);
      assert.equal(isValidTransition(PluginLifecycleState.UNINSTALLING, PluginLifecycleState.UNINSTALLED), true);
    });

    test('ERROR recovery transitions are valid', () => {
      assert.equal(isValidTransition(PluginLifecycleState.ERROR, PluginLifecycleState.INACTIVE), true);
      assert.equal(isValidTransition(PluginLifecycleState.ERROR, PluginLifecycleState.UNINSTALLING), true);
    });
  });

  describe('Invalid Transitions Prevention', () => {
    test('UNINSTALLED cannot jump directly to ACTIVE', () => {
      assert.equal(isValidTransition(PluginLifecycleState.UNINSTALLED, PluginLifecycleState.ACTIVE), false);
    });

    test('ACTIVE cannot transition directly to INSTALLED', () => {
      assert.equal(isValidTransition(PluginLifecycleState.ACTIVE, PluginLifecycleState.INSTALLED), false);
    });

    test('ACTIVE cannot transition directly to UNINSTALLED', () => {
      assert.equal(isValidTransition(PluginLifecycleState.ACTIVE, PluginLifecycleState.UNINSTALLED), false);
    });

    test('DISCOVERED cannot transition directly to ACTIVE', () => {
      assert.equal(isValidTransition(PluginLifecycleState.DISCOVERED, PluginLifecycleState.ACTIVE), false);
    });
  });

  describe('Transition Matrix Completeness', () => {
    test('every lifecycle state has an entry in PERMITTED_TRANSITIONS', () => {
      const allStates = Object.values(PluginLifecycleState);
      for (const state of allStates) {
        assert.ok(PERMITTED_TRANSITIONS[state] !== undefined, `Missing state in PERMITTED_TRANSITIONS: ${state}`);
      }
    });
  });
});
