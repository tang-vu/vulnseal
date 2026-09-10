// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CostModel, createConstructorContext, QueryContext, sampleContractAddress } from '@midnight-ntwrk/compact-runtime';
// The runner supplies bindings from this invocation's fresh compilation.
assert.ok(process.env.VULNSEAL_ESCROW_BINDINGS, 'Run node experiments/escrow/check.mjs');
const { Contract, ledger } = await import(process.env.VULNSEAL_ESCROW_BINDINGS);

const bytes = (value) => new Uint8Array(32).fill(value);
const owner = bytes(1);
const color = bytes(2);
const payee = { bytes: bytes(3) };
const token = { tag: 'unshielded', raw: Buffer.from(color).toString('hex') };
const max = (1n << 64n) - 1n;

function simulator(selectedColor = color) {
  const contract = new Contract({ ownerSecret: ({ privateState }) => [privateState, privateState] });
  const initial = contract.initialState(createConstructorContext(owner, '0'.repeat(64)), selectedColor);
  const address = sampleContractAddress();
  let state = initial.currentContractState.data;
  return {
    ledger: () => ledger(state),
    // Each call is a separate simulated transaction. Balances are explicitly
    // injected chain inputs, never inferred from the bookkeeping counter.
    call(name, args = [], balance = 0n, actor = owner, balanceToken = token) {
      const query = new QueryContext(state, address);
      query.block = { ...query.block, balance: new Map([[balanceToken, balance]]) };
      const result = contract.impureCircuits[name]({
        currentPrivateState: actor,
        currentZswapLocalState: initial.currentZswapLocalState,
        currentQueryContext: query,
        costModel: CostModel.initialCostModel(),
      }, ...args);
      state = result.context.currentQueryContext.state;
      return result.context.currentQueryContext.effects;
    },
  };
}

function noTransfer(effects) {
  for (const value of Object.values(effects)) assert.equal(value instanceof Map ? value.size : value.length, 0);
}

test('deposit requests exact token input; authorize emits no transfer; release binds exact user output', () => {
  const sim = simulator();
  const deposit = sim.call('deposit', [7n]);
  assert.deepEqual([...deposit.unshieldedInputs], [[token, 7n]]);
  assert.equal(deposit.unshieldedOutputs.size, 0);
  assert.equal(deposit.claimedUnshieldedSpends.size, 0);
  const second = sim.call('deposit', [5n], 7n);
  assert.deepEqual([...second.unshieldedInputs], [[token, 5n]]);
  noTransfer(sim.call('authorize', [12n, payee], 12n));
  assert.equal(sim.ledger().available, 12n);
  assert.equal(sim.ledger().authorized, 12n);
  assert.equal(sim.ledger().released, false);
  const release = sim.call('release', [], 12n);
  assert.deepEqual([...release.unshieldedOutputs], [[token, 12n]]);
  assert.deepEqual([...release.claimedUnshieldedSpends], [
    [[token, { tag: 'user', address: Buffer.from(payee.bytes).toString('hex') }], 12n],
  ]);
  assert.equal(release.unshieldedInputs.size, 0);
  assert.equal(release.unshieldedMints.size, 0);
  assert.equal(sim.ledger().available, 0n);
  assert.equal(sim.ledger().released, true);
  assert.throws(() => sim.call('release', [], 100n), /No releasable authorization/);
  assert.throws(() => sim.call('deposit', [1n]), /already authorized or released/);
  assert.throws(() => sim.call('authorize', [12n, payee]), /already authorized or released/);
});

test('authorization does not manufacture actual balance, including a different token balance', () => {
  const sim = simulator();
  sim.call('deposit', [10n]);
  sim.call('authorize', [10n, payee]);
  for (const amount of [0n, 9n]) {
    assert.throws(() => sim.call('release', [], amount), /Insufficient actual token balance/);
    assert.equal(sim.ledger().released, false);
    assert.equal(sim.ledger().available, 10n);
  }
  assert.throws(() => sim.call('release', [], 100n, owner, { ...token, raw: '04'.repeat(32) }), /Insufficient actual token balance/);
  assert.deepEqual([...sim.call('release', [], 100n).unshieldedOutputs], [[token, 10n]]);
});

test('owner, amount, recipient, and phase constraints reject invalid transitions', () => {
  const sim = simulator();
  assert.throws(() => sim.call('release'), /No releasable authorization/);
  assert.throws(() => sim.call('deposit', [0n]), /Empty deposit/);
  assert.throws(() => sim.call('deposit', [10n], 0n, bytes(9)), /Wrong escrow owner/);
  sim.call('deposit', [10n]);
  for (const amount of [0n, 9n, 11n]) assert.throws(() => sim.call('authorize', [amount, payee]), /Authorize the full funded amount/);
  assert.throws(() => sim.call('authorize', [10n, { bytes: bytes(0) }]), /Empty recipient/);
  assert.throws(() => sim.call('authorize', [10n, payee], 10n, bytes(9)), /Wrong escrow owner/);
  sim.call('authorize', [10n, payee]);
  assert.throws(() => sim.call('authorize', [10n, { bytes: bytes(4) }]), /already authorized or released/);
  assert.throws(() => sim.call('deposit', [1n]), /already authorized or released/);
  assert.throws(() => sim.call('release', [], 10n, bytes(9)), /Wrong escrow owner/);
  assert.deepEqual(sim.ledger().recipient, payee);
  sim.call('release', [], 10n);
});

test('native zero color excluded and aggregate funding bounded to uint64', () => {
  assert.throws(() => simulator(bytes(0)), /Native NIGHT is excluded/);
  const sim = simulator();
  sim.call('deposit', [max]);
  assert.throws(() => sim.call('deposit', [1n]), /Prototype funding limit exceeded/);
  assert.equal(sim.ledger().available, max);
  noTransfer(sim.call('authorize', [max, payee]));
  assert.deepEqual([...sim.call('release', [], max).unshieldedOutputs], [[token, max]]);
});
