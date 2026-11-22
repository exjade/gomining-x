'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EvmVerifierError,
  ERC20_TRANSFER_TOPIC,
  EVM_TX_HASH_PATTERN,
  resolveEvmRpcUrl,
  verifyEvmTransaction,
  findIncomingEvmTransfer
} = require('../src/payments/evmVerifier');

const {
  SolanaVerifierError,
  SOLANA_SIGNATURE_PATTERN,
  resolveSolanaRpcUrl,
  verifySolanaTransaction,
  findIncomingSolanaTransfer
} = require('../src/payments/solanaVerifier');

const {
  OnChainVerifierError,
  VERIFICATION_STATUSES,
  buildUsedTxHashKey,
  createOnChainVerifier
} = require('../src/payments/onChainVerifier');

const TREASURY_EVM = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET_EVM = '0x9999999999999999999999999999999999999999';
const SENDER_EVM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BSC_USDT_MAINNET = '0x55d398326f99059fF775485246999027B3197955';
const BSC_USDT_TESTNET = '0x2222222222222222222222222222222222222222';
const POLYGON_USDT_MAINNET = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const FAKE_TOKEN_EVM = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

const TX_HASH_1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TX_HASH_2 = '0x2222222222222222222222222222222222222222222222222222222222222222';
const TX_HASH_MIXED = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789';

function padTopicAddress(addr) {
  return `0x${addr.toLowerCase().slice(2).padStart(64, '0')}`;
}

function encodeUint256Hex(valueBigInt) {
  return `0x${valueBigInt.toString(16).padStart(64, '0')}`;
}

function buildRpcEnv(overrides = {}) {
  return {
    PAYMENT_RPC_URL_BSC_TESTNET: 'https://rpc.bsc-testnet.example',
    PAYMENT_RPC_URL_BSC_MAINNET: 'https://rpc.bsc-mainnet.example',
    PAYMENT_RPC_URL_POLYGON_TESTNET: 'https://rpc.polygon-testnet.example',
    PAYMENT_RPC_URL_POLYGON_MAINNET: 'https://rpc.polygon-mainnet.example',
    PAYMENT_RPC_URL_ETHEREUM_TESTNET: 'https://rpc.ethereum-testnet.example',
    PAYMENT_RPC_URL_ETHEREUM_MAINNET: 'https://rpc.ethereum-mainnet.example',
    PAYMENT_RPC_URL_SOLANA_TESTNET: 'https://rpc.solana-devnet.example',
    PAYMENT_RPC_URL_SOLANA_MAINNET: 'https://rpc.solana-mainnet.example',
    ...overrides
  };
}

function createJsonRpcFetchMock(handlers) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.jsonrpc, '2.0');
    calls.push({ url, method: body.method, params: body.params });

    if (!Object.hasOwn(handlers, body.method)) {
      throw new Error(`Unmocked JSON-RPC method: ${body.method}`);
    }
    const handler = handlers[body.method];
    const output = typeof handler === 'function' ? await handler(body.params, url, calls) : handler;
    if (output && output.__httpStatus) {
      return {
        ok: output.__httpStatus >= 200 && output.__httpStatus < 300,
        status: output.__httpStatus,
        json: async () => output.body
      };
    }
    if (output && output.__rpcError) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: body.id, error: output.__rpcError })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: body.id, result: output })
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function buildEvmIntent(overrides = {}) {
  return {
    intentId: 'pi_evm_001',
    paymentNetwork: 'bsc',
    networkMode: 'mainnet',
    chainId: 56,
    paymentAsset: 'USDT',
    tokenContractAddress: BSC_USDT_MAINNET,
    expectedAmountAtomic: '100000000000000000000', // 100 USDT (18 dec)
    treasuryAddress: TREASURY_EVM,
    senderWallet: SENDER_EVM,
    status: 'AWAITING',
    requiredConfirmations: 15,
    createdAt: '2026-11-22T00:00:00.000Z',
    expiresAt: '2026-11-22T00:15:00.000Z',
    ...overrides
  };
}

// ============================================================================
// 1. EVM VERIFIER — USDT (18 DEC BSC / 6 DEC POLYGON) & NATIVES (BNB/POL/ETH)
// ============================================================================

test('evmVerifier: fail-closed when PAYMENT_RPC_URL_* is missing or invalid protocol', async () => {
  assert.throws(
    () => resolveEvmRpcUrl('bsc', 'mainnet', {}),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
  assert.throws(
    () => resolveEvmRpcUrl('polygon', 'testnet', { PAYMENT_RPC_URL_POLYGON_TESTNET: 'wss://bad.example' }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
  assert.throws(
    () => resolveEvmRpcUrl('ethereum', 'mainnet', { PAYMENT_RPC_URL_ETHEREUM_MAINNET: 'ftp://bad.example' }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );

  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent: buildEvmIntent(),
        txHash: TX_HASH_1,
        env: {},
        fetchImpl: createJsonRpcFetchMock({})
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
});

test('evmVerifier: BSC USDT 18 dec reaches READY_TO_SETTLE at 15/15 confirmations and PROCESSING at 6/15', async () => {
  const intent = buildEvmIntent();
  const receipt = {
    transactionHash: TX_HASH_1,
    blockNumber: '0x64', // block 100
    status: '0x1',
    from: SENDER_EVM,
    logs: [
      {
        address: BSC_USDT_MAINNET,
        removed: false,
        topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
        data: encodeUint256Hex(100000000000000000000n)
      }
    ]
  };
  const tx = { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' };

  // 15 confirmations: latestBlock = 114 -> 114 - 100 + 1 = 15
  const readyRes = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38', // 56
      eth_getTransactionReceipt: receipt,
      eth_getTransactionByHash: tx,
      eth_blockNumber: '0x72' // 114
    })
  });
  assert.equal(readyRes.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(readyRes.confirmations, 15);
  assert.equal(readyRes.requiredConfirmations, 15);
  assert.equal(readyRes.receivedAmountAtomic, '100000000000000000000');
  assert.equal(readyRes.fromAddress, SENDER_EVM);
  assert.equal(readyRes.blockNumber, 100);
  assert.equal(readyRes.txHash, TX_HASH_1);

  // 6 confirmations: latestBlock = 105 -> 105 - 100 + 1 = 6
  const processingRes = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: receipt,
      eth_getTransactionByHash: tx,
      eth_blockNumber: '0x69' // 105
    })
  });
  assert.equal(processingRes.verificationStatus, 'PROCESSING');
  assert.equal(processingRes.confirmations, 6);
  assert.equal(processingRes.requiredConfirmations, 15);
  assert.equal(processingRes.receivedAmountAtomic, '100000000000000000000');
});

test('evmVerifier: Polygon USDT 6 dec reaches READY_TO_SETTLE at 64/64 and PROCESSING at 20/64', async () => {
  const intent = buildEvmIntent({
    paymentNetwork: 'polygon',
    networkMode: 'mainnet',
    chainId: 137,
    tokenContractAddress: POLYGON_USDT_MAINNET,
    expectedAmountAtomic: '100000000', // 100 USDT (6 dec)
    requiredConfirmations: 64
  });
  const receipt = {
    transactionHash: TX_HASH_MIXED.toLowerCase(),
    blockNumber: '0x3e8', // 1000
    status: '0x1',
    from: SENDER_EVM,
    logs: [
      {
        address: POLYGON_USDT_MAINNET.toLowerCase(),
        topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
        data: encodeUint256Hex(100000000n)
      }
    ]
  };
  const tx = { hash: TX_HASH_MIXED.toLowerCase(), from: SENDER_EVM, to: POLYGON_USDT_MAINNET, value: '0x0' };

  const ready = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_MIXED,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x89', // 137
      eth_getTransactionReceipt: receipt,
      eth_getTransactionByHash: tx,
      eth_blockNumber: '0x427' // 1063 -> 1063 - 1000 + 1 = 64
    })
  });
  assert.equal(ready.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(ready.confirmations, 64);
  assert.equal(ready.requiredConfirmations, 64);
  assert.equal(ready.txHash, TX_HASH_MIXED.toLowerCase());

  const processing = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_MIXED,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x89',
      eth_getTransactionReceipt: receipt,
      eth_getTransactionByHash: tx,
      eth_blockNumber: '0x3fb' // 1019 -> 1019 - 1000 + 1 = 20
    })
  });
  assert.equal(processing.verificationStatus, 'PROCESSING');
  assert.equal(processing.confirmations, 20);
  assert.equal(processing.requiredConfirmations, 64);
});

test('evmVerifier: classifies UNDERPAID with exact BigInt shortfall, TX_REVERTED, mempool PROCESSING, and NOT_FOUND', async () => {
  const intent = buildEvmIntent({ expectedAmountAtomic: '100000000000000000000' });

  // UNDERPAID: sent 99 USDT (shortfall = 1 USDT = 1000000000000000000)
  const underpaid = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(99000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(underpaid.verificationStatus, 'UNDERPAID');
  assert.equal(underpaid.receivedAmountAtomic, '99000000000000000000');
  assert.equal(underpaid.shortfallAtomic, '1000000000000000000');

  // REVERTED
  const reverted = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x0',
        logs: []
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(reverted.verificationStatus, 'FAILED');
  assert.equal(reverted.reason, 'TX_REVERTED');

  // MEMPOOL PENDING
  const pending = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: null,
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(pending.verificationStatus, 'PROCESSING');
  assert.equal(pending.confirmations, 0);
  assert.equal(pending.reason, 'TX_PENDING_IN_MEMPOOL');

  // NOT_FOUND
  const missing = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: null,
      eth_getTransactionByHash: null,
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(missing.verificationStatus, 'NOT_FOUND');
  assert.equal(missing.confirmations, 0);
  assert.equal(missing.reason, 'TX_NOT_FOUND');
});

test('evmVerifier: blocks fake token contract attack, wrong recipient attack, removed logs, dirty topic bits, and chainId mismatch', async () => {
  const intent = buildEvmIntent();

  // Fake token contract emitting valid Transfer to treasury
  const fakeToken = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: FAKE_TOKEN_EVM,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: FAKE_TOKEN_EVM, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(fakeToken.verificationStatus, 'FAILED');
  assert.equal(fakeToken.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // Real USDT sent to wrong wallet
  const wrongRecipient = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(OTHER_WALLET_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(wrongRecipient.verificationStatus, 'FAILED');
  assert.equal(wrongRecipient.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // Removed log (reorged) + dirty upper topic bits are ignored
  const reorgAndDirty = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            removed: true,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          },
          {
            address: BSC_USDT_MAINNET,
            removed: false,
            topics: [
              ERC20_TRANSFER_TOPIC,
              padTopicAddress(SENDER_EVM),
              `0x0000000000000000000000ff${TREASURY_EVM.slice(2)}`
            ],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  assert.equal(reorgAndDirty.verificationStatus, 'FAILED');
  assert.equal(reorgAndDirty.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // Chain ID mismatch: RPC replies 0x61 (97 testnet) when intent requires 56 (mainnet)
  const wrongChainMock = createJsonRpcFetchMock({
    eth_chainId: '0x61'
  });
  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent,
        txHash: TX_HASH_1,
        env: buildRpcEnv(),
        fetchImpl: wrongChainMock
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_CHAIN_ID_MISMATCH'
  );
  // Fail-closed before querying receipt/logs
  assert.equal(wrongChainMock.calls.length, 1);
  assert.equal(wrongChainMock.calls[0].method, 'eth_chainId');

  // Stale RPC node where latestBlock < txBlock clamps confirmations to 0 -> PROCESSING
  const staleNode = await verifyEvmTransaction({
    intent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x100',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x90'
    })
  });
  assert.equal(staleNode.verificationStatus, 'PROCESSING');
  assert.equal(staleNode.confirmations, 0);
});

test('evmVerifier: validates native assets (BNB/POL/ETH) for READY_TO_SETTLE, UNDERPAID, and wrong recipient FAILED', async () => {
  const ethIntent = buildEvmIntent({
    paymentNetwork: 'ethereum',
    networkMode: 'testnet',
    chainId: 11155111,
    paymentAsset: 'ETH',
    tokenContractAddress: null,
    expectedAmountAtomic: '500000000000000000', // 0.5 ETH
    requiredConfirmations: 12
  });

  const valid = await verifyEvmTransaction({
    intent: ethIntent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0xaa36a7', // 11155111
      eth_getTransactionReceipt: { transactionHash: TX_HASH_1, blockNumber: '0x10', status: '0x1', logs: [] },
      eth_getTransactionByHash: {
        hash: TX_HASH_1,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        value: '0x6f05b59d3b20000' // 0.5 ETH
      },
      eth_blockNumber: '0x1b' // 27 - 16 + 1 = 12
    })
  });
  assert.equal(valid.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(valid.confirmations, 12);
  assert.equal(valid.receivedAmountAtomic, '500000000000000000');

  const underpaid = await verifyEvmTransaction({
    intent: ethIntent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0xaa36a7',
      eth_getTransactionReceipt: { transactionHash: TX_HASH_1, blockNumber: '0x10', status: '0x1', logs: [] },
      eth_getTransactionByHash: {
        hash: TX_HASH_1,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        value: '0x58d15e176280000' // 0.4 ETH
      },
      eth_blockNumber: '0x30'
    })
  });
  assert.equal(underpaid.verificationStatus, 'UNDERPAID');
  assert.equal(underpaid.shortfallAtomic, '100000000000000000');

  const wrongRecipient = await verifyEvmTransaction({
    intent: ethIntent,
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0xaa36a7',
      eth_getTransactionReceipt: { transactionHash: TX_HASH_1, blockNumber: '0x10', status: '0x1', logs: [] },
      eth_getTransactionByHash: {
        hash: TX_HASH_1,
        from: SENDER_EVM,
        to: OTHER_WALLET_EVM,
        value: '0x6f05b59d3b20000'
      },
      eth_blockNumber: '0x30'
    })
  });
  assert.equal(wrongRecipient.verificationStatus, 'FAILED');
  assert.equal(wrongRecipient.reason, 'WRONG_RECIPIENT_OR_TOKEN');
});

test('evmVerifier: findIncomingEvmTransfer clamps block range, skips used hashes, and rejects reverted native txs', async () => {
  // 1) USDT eth_getLogs scan clamping >maxBlockRange and skipping already-used txHash
  const usdtIntent = buildEvmIntent({
    paymentNetwork: 'bsc',
    networkMode: 'testnet',
    chainId: 97,
    tokenContractAddress: BSC_USDT_TESTNET,
    expectedAmountAtomic: '100000000000000000000'
  });

  let capturedLogFilter = null;
  const usdtScanFetch = createJsonRpcFetchMock({
    eth_chainId: '0x61',
    eth_blockNumber: '0x3e8', // 1000
    eth_getLogs: (params) => {
      capturedLogFilter = params[0];
      return [
        {
          address: BSC_USDT_TESTNET,
          transactionHash: TX_HASH_1,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        },
        {
          address: BSC_USDT_TESTNET,
          transactionHash: TX_HASH_2,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        }
      ];
    },
    eth_getTransactionReceipt: (params) => ({
      transactionHash: params[0],
      blockNumber: '0x3d0', // 976 -> 1000 - 976 + 1 = 25 >= 15
      status: '0x1',
      logs: [
        {
          address: BSC_USDT_TESTNET,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        }
      ]
    }),
    eth_getTransactionByHash: (params) => ({
      hash: params[0],
      from: SENDER_EVM,
      to: BSC_USDT_TESTNET,
      value: '0x0'
    })
  });

  const foundUsdt = await findIncomingEvmTransfer({
    intent: usdtIntent,
    fromBlock: 100, // diff 900 exceeds maxBlockRange=200 -> must clamp to 800..1000
    toBlock: 1000,
    maxBlockRange: 200,
    env: buildRpcEnv(),
    fetchImpl: usdtScanFetch,
    isTxHashUsed: async (hash) => hash === TX_HASH_1
  });
  assert.equal(capturedLogFilter.fromBlock, '0x320'); // 800
  assert.equal(capturedLogFilter.toBlock, '0x3e8'); // 1000
  assert.equal(foundUsdt.txHash, TX_HASH_2);
  assert.equal(foundUsdt.verificationStatus, 'READY_TO_SETTLE');

  // 2) Native BNB block scan ignores reverted tx and picks valid tx
  const bnbIntent = buildEvmIntent({
    paymentNetwork: 'bsc',
    networkMode: 'testnet',
    chainId: 97,
    paymentAsset: 'BNB',
    tokenContractAddress: null,
    expectedAmountAtomic: '1000000000000000000' // 1 BNB
  });

  const bnbScanFetch = createJsonRpcFetchMock({
    eth_chainId: '0x61',
    eth_blockNumber: '0x65', // 101
    eth_getBlockByNumber: (params) => {
      if (params[0] === '0x64') {
        return {
          number: '0x64',
          transactions: [
            { hash: TX_HASH_1, from: SENDER_EVM, to: TREASURY_EVM, value: '0xde0b6b3a7640000' }, // reverted
            { hash: TX_HASH_2, from: SENDER_EVM, to: TREASURY_EVM, value: '0xde0b6b3a7640000' } // valid
          ]
        };
      }
      return { number: params[0], transactions: [] };
    },
    eth_getTransactionReceipt: (params) => ({
      transactionHash: params[0],
      blockNumber: '0x64',
      status: params[0] === TX_HASH_1 ? '0x0' : '0x1',
      logs: []
    }),
    eth_getTransactionByHash: (params) => ({
      hash: params[0],
      from: SENDER_EVM,
      to: TREASURY_EVM,
      value: '0xde0b6b3a7640000'
    })
  });

  const foundBnb = await findIncomingEvmTransfer({
    intent: bnbIntent,
    fromBlock: 100,
    toBlock: 101,
    env: buildRpcEnv(),
    fetchImpl: bnbScanFetch
  });
  assert.equal(foundBnb.txHash, TX_HASH_2);
  assert.equal(foundBnb.verificationStatus, 'PROCESSING');
  assert.equal(EVM_TX_HASH_PATTERN.test(foundBnb.txHash), true);
});

// ============================================================================
// 2. SOLANA VERIFIER — SPL USDT (6 DEC) & NATIVE SOL (LAMPORTS, 9 DEC)
// ============================================================================

const TREASURY_SOL = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const SENDER_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const OTHER_SOL = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SOL_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const FAKE_SOL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_SIG_UPPER =
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d11111111111111111111111111111111111111111111';
const SOL_SIG_LOWER =
  '5eykt4usfv8p8njdtrepy1vzqkqzkvdpkuc147dw2n9d11111111111111111111111111111111111111111111';
const SOL_SIG_2 =
  '3Bxs4h24hYamQz9G2A2X3Bxs4h24hYamQz9G2A2X3Bxs4h24hYamQz9G2A2X3Bxs4h24hYamQz9G2A2X3Bxs4h24';
const SOL_SIG_OLD =
  '2Axs4h24hYamQz9G2A2X3Bxs4h24hYamQz9G2A2X3Bxs4h24hYamQz9G2A2X3Bxs4h24hYamQz9G2A2X3Bxs4h24';

function buildSolanaIntent(overrides = {}) {
  return {
    intentId: 'pi_sol_001',
    paymentNetwork: 'solana',
    networkMode: 'mainnet',
    chainId: 'solana-mainnet',
    paymentAsset: 'USDT',
    tokenContractAddress: SOL_USDT_MINT,
    expectedAmountAtomic: '100000000', // 100 USDT (6 dec)
    treasuryAddress: TREASURY_SOL,
    senderWallet: SENDER_SOL,
    status: 'AWAITING',
    requiredConfirmations: 1,
    createdAt: '2026-11-22T00:00:00.000Z',
    expiresAt: '2026-11-22T00:15:00.000Z',
    ...overrides
  };
}

test('solanaVerifier: fail-closed when RPC URL missing/invalid and validates case-sensitive Base58 signature', async () => {
  assert.throws(
    () => resolveSolanaRpcUrl('mainnet', {}),
    (err) => err instanceof SolanaVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
  assert.throws(
    () => resolveSolanaRpcUrl('testnet', { PAYMENT_RPC_URL_SOLANA_TESTNET: 'ws://bad.example' }),
    (err) => err instanceof SolanaVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
  await assert.rejects(
    () =>
      verifySolanaTransaction({
        intent: buildSolanaIntent(),
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({})
      }),
    (err) => err instanceof SolanaVerifierError && err.code === 'INVALID_TX_HASH'
  );
  assert.equal(SOLANA_SIGNATURE_PATTERN.test(SOL_SIG_UPPER), true);
  assert.equal(SOL_SIG_UPPER === SOL_SIG_LOWER, false);
});

test('solanaVerifier: SPL USDT validated via pre/postTokenBalances BigInt amount (ignoring uiAmount float) and handles new ATA', async () => {
  const intent = buildSolanaIntent({ expectedAmountAtomic: '12990000' }); // 12.99 USDT

  // Case 1: Existing ATA with misleading float uiAmount, exact atomic amount in BigInt
  const existingAtaMock = createJsonRpcFetchMock({
    getTransaction: (params) => {
      // Must preserve exact Base58 case and finalized jsonParsed options
      assert.equal(params[0], SOL_SIG_UPPER);
      assert.equal(params[1].encoding, 'jsonParsed');
      assert.equal(params[1].commitment, 'finalized');
      assert.equal(params[1].maxSupportedTransactionVersion, 0);
      return {
        slot: 300000100,
        transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL }] } },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: SOL_USDT_MINT,
              owner: TREASURY_SOL,
              uiTokenAmount: { amount: '50000000', decimals: 6, uiAmount: 999999.99 }
            }
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: SOL_USDT_MINT,
              owner: TREASURY_SOL,
              uiTokenAmount: { amount: '62990000', decimals: 6, uiAmount: 0.01 }
            }
          ]
        }
      };
    }
  });

  const res = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: existingAtaMock
  });
  assert.equal(res.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(res.confirmations, 1);
  assert.equal(res.requiredConfirmations, 1);
  assert.equal(res.receivedAmountAtomic, '12990000');
  assert.equal(res.slot, 300000100);
  assert.equal(res.txHash, SOL_SIG_UPPER);

  // Case 2: Newly created ATA (no preTokenBalances entry)
  const newAtaRes = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 300000101,
        transaction: { message: { accountKeys: [SENDER_SOL, TREASURY_SOL] } },
        meta: {
          err: null,
          preTokenBalances: [],
          postTokenBalances: [
            {
              accountIndex: 3,
              mint: SOL_USDT_MINT,
              owner: TREASURY_SOL,
              uiTokenAmount: { amount: '12990000', decimals: 6, uiAmount: 12.99 }
            }
          ]
        }
      }
    })
  });
  assert.equal(newAtaRes.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(newAtaRes.receivedAmountAtomic, '12990000');
});

test('solanaVerifier: classifies confirmed-not-finalized as PROCESSING, meta.err as FAILED, fake mint as FAILED, and NOT_FOUND', async () => {
  const intent = buildSolanaIntent();

  // Still confirmed (not finalized) -> PROCESSING (0/1)
  const awaitingFinal = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: null,
      getSignatureStatuses: {
        value: [{ slot: 300000200, err: null, confirmationStatus: 'confirmed' }]
      }
    })
  });
  assert.equal(awaitingFinal.verificationStatus, 'PROCESSING');
  assert.equal(awaitingFinal.confirmations, 0);
  assert.equal(awaitingFinal.requiredConfirmations, 1);
  assert.equal(awaitingFinal.reason, 'AWAITING_FINALIZATION');

  // Missing completely -> NOT_FOUND
  const notFound = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: null,
      getSignatureStatuses: { value: [null] }
    })
  });
  assert.equal(notFound.verificationStatus, 'NOT_FOUND');
  assert.equal(notFound.reason, 'TX_NOT_FOUND');

  // meta.err non-null -> FAILED (TX_FAILED_ONCHAIN)
  const failedMeta = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 300000201,
        transaction: { message: { accountKeys: [SENDER_SOL, TREASURY_SOL] } },
        meta: { err: { InstructionError: [0, 'Custom'] }, preTokenBalances: [], postTokenBalances: [] }
      }
    })
  });
  assert.equal(failedMeta.verificationStatus, 'FAILED');
  assert.equal(failedMeta.reason, 'TX_FAILED_ONCHAIN');

  // Fake SPL mint attack sent to treasury -> FAILED (WRONG_RECIPIENT_OR_TOKEN)
  const fakeMint = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 300000202,
        transaction: { message: { accountKeys: [SENDER_SOL, TREASURY_SOL] } },
        meta: {
          err: null,
          preTokenBalances: [],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: FAKE_SOL_MINT,
              owner: TREASURY_SOL,
              uiTokenAmount: { amount: '100000000', decimals: 6 }
            }
          ]
        }
      }
    })
  });
  assert.equal(fakeMint.verificationStatus, 'FAILED');
  assert.equal(fakeMint.reason, 'WRONG_RECIPIENT_OR_TOKEN');
});

test('solanaVerifier: validates native SOL lamports (READY_TO_SETTLE, UNDERPAID, wrong recipient FAILED) and autonomous scan', async () => {
  const solIntent = buildSolanaIntent({
    networkMode: 'testnet',
    chainId: 'solana-devnet',
    paymentAsset: 'SOL',
    tokenContractAddress: null,
    expectedAmountAtomic: '1500000000' // 1.5 SOL in lamports
  });

  // Valid SOL transfer with jsonParsed { pubkey } accountKeys
  const ready = await verifySolanaTransaction({
    intent: solIntent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 999001,
        transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL }] } },
        meta: { err: null, preBalances: [5000000000, 1000000000], postBalances: [3499995000, 2500000000] }
      }
    })
  });
  assert.equal(ready.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(ready.receivedAmountAtomic, '1500000000');

  // Underpaid SOL transfer
  const underpaid = await verifySolanaTransaction({
    intent: solIntent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 999002,
        transaction: { message: { accountKeys: [SENDER_SOL, TREASURY_SOL] } },
        meta: { err: null, preBalances: [5000000000, 1000000000], postBalances: [3999995000, 2000000000] }
      }
    })
  });
  assert.equal(underpaid.verificationStatus, 'UNDERPAID');
  assert.equal(underpaid.receivedAmountAtomic, '1000000000');
  assert.equal(underpaid.shortfallAtomic, '500000000');

  // Wrong recipient SOL transfer
  const wrongRecip = await verifySolanaTransaction({
    intent: solIntent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 999003,
        transaction: { message: { accountKeys: [SENDER_SOL, OTHER_SOL] } },
        meta: { err: null, preBalances: [5000000000, 1000000000], postBalances: [3499995000, 2500000000] }
      }
    })
  });
  assert.equal(wrongRecip.verificationStatus, 'FAILED');
  assert.equal(wrongRecip.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // Autonomous scan clamps limit to 50, skips err!=null, skips old blockTime, skips used signature
  const createdAtSec = Math.floor(Date.parse(solIntent.createdAt) / 1000);
  let capturedLimit = null;
  const found = await findIncomingSolanaTransfer({
    intent: solIntent,
    limit: 999,
    env: buildRpcEnv(),
    isTxHashUsed: async (sig) => sig === SOL_SIG_UPPER,
    fetchImpl: createJsonRpcFetchMock({
      getSignaturesForAddress: (params) => {
        assert.equal(params[0], TREASURY_SOL);
        capturedLimit = params[1].limit;
        assert.equal(params[1].commitment, 'finalized');
        return [
          { signature: SOL_SIG_OLD, err: null, blockTime: createdAtSec - 120 }, // too old
          { signature: SOL_SIG_LOWER, err: { InstructionError: [0, 'Fail'] }, blockTime: createdAtSec + 10 }, // failed
          { signature: SOL_SIG_UPPER, err: null, blockTime: createdAtSec + 15 }, // already used
          { signature: SOL_SIG_2, err: null, blockTime: createdAtSec + 20 } // valid
        ];
      },
      getTransaction: (params) => {
        assert.equal(params[0], SOL_SIG_2);
        return {
          slot: 999005,
          transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL }] } },
          meta: { err: null, preBalances: [5000000000, 1000000000], postBalances: [3499995000, 2500000000] }
        };
      }
    })
  });
  assert.equal(capturedLimit, 50);
  assert.equal(found.txHash, SOL_SIG_2);
  assert.equal(found.verificationStatus, 'READY_TO_SETTLE');
});

// ============================================================================
// 3. ORCHESTRATOR, ANTI-REPLAY usedTxHashes, AUTONOMOUS DISCOVERY & TTL
// ============================================================================

function createInMemoryUsedTxDb(initialDocs = {}) {
  const store = new Map(Object.entries(initialDocs));
  return {
    collection(name) {
      return {
        doc(id) {
          const fullKey = `${name}/${id}`;
          return {
            async get() {
              const hasDoc = store.has(fullKey);
              const val = hasDoc ? structuredClone(store.get(fullKey)) : undefined;
              return {
                exists: hasDoc,
                id,
                data: () => val
              };
            }
          };
        }
      };
    }
  };
}

test('onChainVerifier: buildUsedTxHashKey normalizes EVM lowercase, preserves Solana Base58 case, and rejects unsafe Firestore IDs', () => {
  // EVM case-insensitivity
  const kUpper = buildUsedTxHashKey(56, TX_HASH_MIXED);
  const kLower = buildUsedTxHashKey('56', TX_HASH_MIXED.toLowerCase());
  assert.equal(kUpper, `56_${TX_HASH_MIXED.toLowerCase()}`);
  assert.equal(kUpper, kLower);

  // Solana case-sensitivity preserved
  const kSolUpper = buildUsedTxHashKey('solana-mainnet', SOL_SIG_UPPER);
  const kSolLower = buildUsedTxHashKey('solana-mainnet', SOL_SIG_LOWER);
  assert.equal(kSolUpper, `solana-mainnet_${SOL_SIG_UPPER}`);
  assert.equal(kSolLower, `solana-mainnet_${SOL_SIG_LOWER}`);
  assert.notEqual(kSolUpper, kSolLower);

  // Reject unsafe Firestore doc IDs & unsupported chainIds
  for (const [chain, hash] of [
    ['56/evil', TX_HASH_1],
    ['..', TX_HASH_1],
    ['999999', TX_HASH_1],
    ['56', `${TX_HASH_1.slice(0, 60)}/abcde`],
    ['solana-devnet', 'bad signature with spaces']
  ]) {
    assert.throws(
      () => buildUsedTxHashKey(chain, hash),
      (err) => err instanceof OnChainVerifierError
    );
  }
});

test('onChainVerifier: anti-replay blocks txHash owned by another intent (409) without RPC call, but allows same intent re-verification', async () => {
  const usedKey = buildUsedTxHashKey(56, TX_HASH_1);
  const db = createInMemoryUsedTxDb({
    [`usedTxHashes/${usedKey}`]: { intentId: 'pi_other_intent', txHash: TX_HASH_1 }
  });

  const rpcSpy = createJsonRpcFetchMock({
    eth_chainId: '0x38',
    eth_getTransactionReceipt: {
      transactionHash: TX_HASH_1,
      blockNumber: '0x64',
      status: '0x1',
      logs: [
        {
          address: BSC_USDT_MAINNET,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        }
      ]
    },
    eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
    eth_blockNumber: '0x80'
  });

  const verifier = createOnChainVerifier({
    db,
    env: buildRpcEnv(),
    now: () => Date.parse('2026-11-22T00:05:00.000Z'),
    fetchImpl: rpcSpy
  });

  // Different intent trying to replay TX_HASH_1 (even in mixed uppercase) -> 409 TX_HASH_ALREADY_USED, 0 RPC calls
  await assert.rejects(
    () =>
      verifier.verifyIntentPayment({
        intent: buildEvmIntent({ intentId: 'pi_attacker' }),
        txHash: TX_HASH_1.toUpperCase().replace('0X', '0x')
      }),
    (err) => err instanceof OnChainVerifierError && err.code === 'TX_HASH_ALREADY_USED' && err.statusCode === 409
  );
  assert.equal(rpcSpy.calls.length, 0);

  // Same intentId re-verifying its own txHash -> succeeds cleanly
  const sameOwnerRes = await verifier.verifyIntentPayment({
    intent: buildEvmIntent({ intentId: 'pi_other_intent' }),
    txHash: TX_HASH_1
  });
  assert.equal(sameOwnerRes.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(sameOwnerRes.intentId, 'pi_other_intent');
  assert.equal(sameOwnerRes.usedTxKey, usedKey);
  assert.equal(sameOwnerRes.checkedAt, '2026-11-22T00:05:00.000Z');
});

test('onChainVerifier: rejects terminal intent statuses (SETTLED, CANCELLED, FAILED) without calling RPC', async () => {
  const rpcSpy = createJsonRpcFetchMock({});
  const verifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => Date.parse('2026-11-22T00:05:00.000Z'),
    fetchImpl: rpcSpy
  });

  for (const terminalStatus of ['SETTLED', 'CANCELLED', 'FAILED']) {
    await assert.rejects(
      () =>
        verifier.verifyIntentPayment({
          intent: buildEvmIntent({ status: terminalStatus }),
          txHash: TX_HASH_1
        }),
      (err) => err instanceof OnChainVerifierError && err.code === 'INTENT_TERMINAL_STATUS' && err.statusCode === 409
    );
  }
  assert.equal(rpcSpy.calls.length, 0);
});

test('onChainVerifier: discoverAndVerifyIncomingPayment finds EVM USDT and Solana SPL deposits while skipping usedTxHashes', async () => {
  // 1) EVM USDT autonomous discovery skipping TX_HASH_1 used by another intent
  const evmUsedKey = buildUsedTxHashKey(56, TX_HASH_1);
  const evmDb = createInMemoryUsedTxDb({
    [`usedTxHashes/${evmUsedKey}`]: { intentId: 'pi_prior_order' }
  });
  const evmVerifier = createOnChainVerifier({
    db: evmDb,
    env: buildRpcEnv(),
    now: () => Date.parse('2026-11-22T00:06:00.000Z'),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_blockNumber: '0x100',
      eth_getLogs: [
        {
          address: BSC_USDT_MAINNET,
          transactionHash: TX_HASH_1,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        },
        {
          address: BSC_USDT_MAINNET,
          transactionHash: TX_HASH_2,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        }
      ],
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_2,
        blockNumber: '0xe0', // 256 - 224 + 1 = 33 >= 15
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_2, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' }
    })
  });

  const discoveredEvm = await evmVerifier.discoverAndVerifyIncomingPayment({
    intent: buildEvmIntent({ intentId: 'pi_new_order', txHash: null })
  });
  assert.equal(discoveredEvm.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(discoveredEvm.txHash, TX_HASH_2);
  assert.equal(discoveredEvm.usedTxKey, buildUsedTxHashKey(56, TX_HASH_2));
  assert.equal(discoveredEvm.checkedAt, '2026-11-22T00:06:00.000Z');

  // 2) Solana SPL autonomous discovery skipping SOL_SIG_UPPER used by another intent
  const solUsedKey = buildUsedTxHashKey('solana-mainnet', SOL_SIG_UPPER);
  const solDb = createInMemoryUsedTxDb({
    [`usedTxHashes/${solUsedKey}`]: { intentId: 'pi_prior_sol' }
  });
  const createdAtSec = Math.floor(Date.parse('2026-11-22T00:00:00.000Z') / 1000);
  const solVerifier = createOnChainVerifier({
    db: solDb,
    env: buildRpcEnv(),
    now: () => Date.parse('2026-11-22T00:07:00.000Z'),
    fetchImpl: createJsonRpcFetchMock({
      getSignaturesForAddress: [
        { signature: SOL_SIG_UPPER, err: null, blockTime: createdAtSec + 5 },
        { signature: SOL_SIG_2, err: null, blockTime: createdAtSec + 10 }
      ],
      getTransaction: {
        slot: 400000001,
        transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL }] } },
        meta: {
          err: null,
          preTokenBalances: [],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: SOL_USDT_MINT,
              owner: TREASURY_SOL,
              uiTokenAmount: { amount: '100000000', decimals: 6 }
            }
          ]
        }
      }
    })
  });

  const discoveredSol = await solVerifier.discoverAndVerifyIncomingPayment({
    intent: buildSolanaIntent({ intentId: 'pi_new_sol', txHash: null })
  });
  assert.equal(discoveredSol.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(discoveredSol.txHash, SOL_SIG_2);
  assert.equal(discoveredSol.usedTxKey, buildUsedTxHashKey('solana-mainnet', SOL_SIG_2));

  // 3) When intent already has txHash, delegates directly to verifyIntentPayment without scanning
  const directSpy = createJsonRpcFetchMock({
    eth_chainId: '0x38',
    eth_getTransactionReceipt: {
      transactionHash: TX_HASH_2,
      blockNumber: '0xe0',
      status: '0x1',
      logs: [
        {
          address: BSC_USDT_MAINNET,
          topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
          data: encodeUint256Hex(100000000000000000000n)
        }
      ]
    },
    eth_getTransactionByHash: { hash: TX_HASH_2, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
    eth_blockNumber: '0x100'
  });
  const directVerifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => Date.parse('2026-11-22T00:08:00.000Z'),
    fetchImpl: directSpy
  });
  const delegated = await directVerifier.discoverAndVerifyIncomingPayment({
    intent: buildEvmIntent({ intentId: 'pi_has_tx', txHash: TX_HASH_2 })
  });
  assert.equal(delegated.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(directSpy.calls.some((c) => c.method === 'eth_getLogs'), false);
});

test('onChainVerifier: TTL marks NOT_FOUND after expiresAt as EXPIRED, preserves on-chain status after expiresAt, and strictly forbids CONFIRMED', async () => {
  const afterExpiryMs = Date.parse('2026-11-22T00:20:00.000Z'); // > expiresAt 00:15:00Z
  const beforeExpiryMs = Date.parse('2026-11-22T00:10:00.000Z');

  // 1) NOT_FOUND after expiresAt -> EXPIRED
  const expiredVerifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => afterExpiryMs,
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: null,
      eth_getTransactionByHash: null,
      eth_blockNumber: '0x100',
      eth_getLogs: []
    })
  });
  const expiredDirect = await expiredVerifier.verifyIntentPayment({
    intent: buildEvmIntent(),
    txHash: TX_HASH_1
  });
  assert.equal(expiredDirect.verificationStatus, 'EXPIRED');

  const expiredDiscover = await expiredVerifier.discoverAndVerifyIncomingPayment({
    intent: buildEvmIntent({ txHash: null })
  });
  assert.equal(expiredDiscover.verificationStatus, 'EXPIRED');

  // 2) No deposit found BEFORE expiresAt -> NOT_FOUND
  const activeDiscoverVerifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => beforeExpiryMs,
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_blockNumber: '0x100',
      eth_getLogs: []
    })
  });
  const activeNotFound = await activeDiscoverVerifier.discoverAndVerifyIncomingPayment({
    intent: buildEvmIntent({ txHash: null })
  });
  assert.equal(activeNotFound.verificationStatus, 'NOT_FOUND');

  // 3) On-chain tx found AFTER expiresAt (PROCESSING & READY_TO_SETTLE) preserves on-chain status
  const lateProcessingVerifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => afterExpiryMs,
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x68' // 5/15 confirmations
    })
  });
  const lateProcessing = await lateProcessingVerifier.verifyIntentPayment({
    intent: buildEvmIntent(),
    txHash: TX_HASH_1
  });
  assert.equal(lateProcessing.verificationStatus, 'PROCESSING');

  const lateReadyVerifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => afterExpiryMs,
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(100000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });
  const lateReady = await lateReadyVerifier.verifyIntentPayment({
    intent: buildEvmIntent(),
    txHash: TX_HASH_1
  });
  assert.equal(lateReady.verificationStatus, 'READY_TO_SETTLE');

  // 4) Strict anti-CONFIRMED invariant (SCRUM-229)
  assert.deepEqual(Object.values(VERIFICATION_STATUSES), [
    'NOT_FOUND',
    'PROCESSING',
    'READY_TO_SETTLE',
    'UNDERPAID',
    'FAILED',
    'EXPIRED'
  ]);
  assert.equal(Object.hasOwn(VERIFICATION_STATUSES, 'CONFIRMED'), false);
  assert.equal(Object.values(VERIFICATION_STATUSES).includes('CONFIRMED'), false);
  for (const res of [expiredDirect, expiredDiscover, activeNotFound, lateProcessing, lateReady]) {
    assert.notEqual(res.verificationStatus, 'CONFIRMED');
  }
});

// ============================================================================
// 4. ADVERSARIAL HARDENING & ERROR-PATH COVERAGE (FINAL REVIEW FIX PASS)
// ============================================================================

const TREASURY_SOL_USDT_ATA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

test('solanaVerifier [CRITICAL-1]: findIncomingSolanaTransfer discovers SPL USDT via Treasury ATA (getTokenAccountsByOwner) when treasuryAddress has no direct signatures', async () => {
  const intent = buildSolanaIntent({ intentId: 'pi_sol_ata_001', expectedAmountAtomic: '100000000' });
  const createdAtSec = Math.floor(Date.parse(intent.createdAt) / 1000);

  const found = await findIncomingSolanaTransfer({
    intent,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getSignaturesForAddress: (params) => {
        // Direct treasury owner has 0 signatures after ATA already exists
        if (params[0] === TREASURY_SOL) return [];
        if (params[0] === TREASURY_SOL_USDT_ATA) {
          return [{ signature: SOL_SIG_2, err: null, blockTime: createdAtSec + 15 }];
        }
        return [];
      },
      getTokenAccountsByOwner: (params) => {
        assert.equal(params[0], TREASURY_SOL);
        assert.equal(params[1].mint, SOL_USDT_MINT);
        return {
          context: { slot: 500000 },
          value: [{ pubkey: TREASURY_SOL_USDT_ATA, account: {} }]
        };
      },
      getTransaction: (params) => {
        assert.equal(params[0], SOL_SIG_2);
        return {
          slot: 500001,
          transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL_USDT_ATA }] } },
          meta: {
            err: null,
            preTokenBalances: [
              {
                accountIndex: 1,
                mint: SOL_USDT_MINT,
                owner: TREASURY_SOL,
                uiTokenAmount: { amount: '200000000', decimals: 6 }
              }
            ],
            postTokenBalances: [
              {
                accountIndex: 1,
                mint: SOL_USDT_MINT,
                owner: TREASURY_SOL,
                uiTokenAmount: { amount: '300000000', decimals: 6 }
              }
            ]
          }
        };
      }
    })
  });

  assert.ok(found);
  assert.equal(found.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(found.txHash, SOL_SIG_2);
  assert.equal(found.receivedAmountAtomic, '100000000');
});

test('solanaVerifier [CRITICAL-2]: blocks internal Treasury SPL sweep and closed-ATA net-zero exploits', async () => {
  const intent = buildSolanaIntent({ expectedAmountAtomic: '100000000' });

  // Internal sweep: Treasury ATA #1 drops 100 USDT, Treasury ATA #2 gains 100 USDT -> net = 0 -> FAILED
  const sweepRes = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 600001,
        transaction: { message: { accountKeys: [TREASURY_SOL, OTHER_SOL] } },
        meta: {
          err: null,
          preTokenBalances: [
            { accountIndex: 2, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '500000000', decimals: 6 } },
            { accountIndex: 3, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '0', decimals: 6 } }
          ],
          postTokenBalances: [
            { accountIndex: 2, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '400000000', decimals: 6 } },
            { accountIndex: 3, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '100000000', decimals: 6 } }
          ]
        }
      }
    })
  });
  assert.equal(sweepRes.verificationStatus, 'FAILED');
  assert.equal(sweepRes.reason, 'WRONG_RECIPIENT_OR_TOKEN');
  assert.equal(sweepRes.receivedAmountAtomic, '0');

  // Closed ATA in preTokenBalances absent from postTokenBalances: net 0 -> FAILED
  const closedAtaRes = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 600002,
        transaction: { message: { accountKeys: [TREASURY_SOL, OTHER_SOL] } },
        meta: {
          err: null,
          preTokenBalances: [
            { accountIndex: 2, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '100000000', decimals: 6 } }
          ],
          postTokenBalances: [
            { accountIndex: 3, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '100000000', decimals: 6 } }
          ]
        }
      }
    })
  });
  assert.equal(closedAtaRes.verificationStatus, 'FAILED');
  assert.equal(closedAtaRes.reason, 'WRONG_RECIPIENT_OR_TOKEN');
});

test('solanaVerifier [IMPORTANT-1]: validates intent.senderWallet and prevents cross-user payment hijacking in findIncomingSolanaTransfer', async () => {
  // Invalid senderWallet rejected fail-closed
  await assert.rejects(
    () =>
      verifySolanaTransaction({
        intent: buildSolanaIntent({ senderWallet: 'not-a-valid-sol-wallet!' }),
        txHash: SOL_SIG_UPPER,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({})
      }),
    (err) => err instanceof SolanaVerifierError && err.code === 'INVALID_INTENT'
  );

  // Autonomous scan skips a finalized deposit sent by a different wallet when intent.senderWallet is bound
  const attackerIntent = buildSolanaIntent({
    paymentAsset: 'SOL',
    networkMode: 'testnet',
    chainId: 'solana-devnet',
    tokenContractAddress: null,
    expectedAmountAtomic: '1000000000',
    senderWallet: OTHER_SOL // Attacker's wallet, NOT SENDER_SOL (victim)
  });
  const createdAtSec = Math.floor(Date.parse(attackerIntent.createdAt) / 1000);

  const hijacked = await findIncomingSolanaTransfer({
    intent: attackerIntent,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getSignaturesForAddress: [{ signature: SOL_SIG_2, err: null, blockTime: createdAtSec + 10 }],
      getTransaction: {
        slot: 700001,
        transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL }] } },
        meta: { err: null, preBalances: [5000000000, 1000000000], postBalances: [3999995000, 2000000000] }
      }
    })
  });
  assert.equal(hijacked, null);
});

test('evmVerifier & solanaVerifier [IMPORTANT-2]: reject HTTP 200 JSON-RPC payloads lacking result or returning Arrays (fail-closed RPC_REQUEST_FAILED)', async () => {
  const missingResultFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ code: 429, message: 'Too many requests' })
  });
  const arrayPayloadFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [{ jsonrpc: '2.0', id: 1, result: null }]
  });

  await assert.rejects(
    () => verifySolanaTransaction({ intent: buildSolanaIntent(), txHash: SOL_SIG_UPPER, env: buildRpcEnv(), fetchImpl: missingResultFetch }),
    (err) => err instanceof SolanaVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
  await assert.rejects(
    () => verifySolanaTransaction({ intent: buildSolanaIntent(), txHash: SOL_SIG_UPPER, env: buildRpcEnv(), fetchImpl: arrayPayloadFetch }),
    (err) => err instanceof SolanaVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
  await assert.rejects(
    () => verifyEvmTransaction({ intent: buildEvmIntent(), txHash: TX_HASH_1, env: buildRpcEnv(), fetchImpl: missingResultFetch }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
  await assert.rejects(
    () => verifyEvmTransaction({ intent: buildEvmIntent(), txHash: TX_HASH_1, env: buildRpcEnv(), fetchImpl: arrayPayloadFetch }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
});

test('solanaVerifier [IMPORTANT-3]: finalized status in getSignatureStatuses retries getTransaction once and fails closed (never NOT_FOUND) if body unavailable', async () => {
  const intent = buildSolanaIntent({ expectedAmountAtomic: '100000000' });

  // 1) Transient finalization race: 1st getTransaction returns null, status is finalized, 2nd getTransaction succeeds
  let txCallCount = 0;
  const raceRecovered = await verifySolanaTransaction({
    intent,
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: () => {
        txCallCount += 1;
        if (txCallCount === 1) return null;
        return {
          slot: 800001,
          transaction: { message: { accountKeys: [SENDER_SOL, TREASURY_SOL] } },
          meta: {
            err: null,
            preTokenBalances: [],
            postTokenBalances: [
              { accountIndex: 2, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '100000000', decimals: 6 } }
            ]
          }
        };
      },
      getSignatureStatuses: {
        value: [{ slot: 800001, err: null, confirmationStatus: 'finalized' }]
      }
    })
  });
  assert.equal(txCallCount, 2);
  assert.equal(raceRecovered.verificationStatus, 'READY_TO_SETTLE');

  // 2) Pruned/non-archival RPC: status finalized but retry getTransaction still null -> RPC_REQUEST_FAILED (not NOT_FOUND)
  await assert.rejects(
    () =>
      verifySolanaTransaction({
        intent,
        txHash: SOL_SIG_UPPER,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({
          getTransaction: null,
          getSignatureStatuses: {
            value: [{ slot: 800002, err: null, confirmationStatus: 'finalized' }]
          }
        })
      }),
    (err) => err instanceof SolanaVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
});

test('evmVerifier [RE-GRADED IMPORTANT]: native tx missing from lagging node when receipt exists (or mismatched tx.hash) throws RPC_REQUEST_FAILED instead of false FAILED', async () => {
  const bnbIntent = buildEvmIntent({
    paymentNetwork: 'bsc',
    networkMode: 'mainnet',
    chainId: 56,
    paymentAsset: 'BNB',
    tokenContractAddress: null,
    expectedAmountAtomic: '1000000000000000000'
  });

  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent: bnbIntent,
        txHash: TX_HASH_1,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({
          eth_chainId: '0x38',
          eth_getTransactionReceipt: { transactionHash: TX_HASH_1, blockNumber: '0x64', status: '0x1', logs: [] },
          eth_getTransactionByHash: null,
          eth_blockNumber: '0x80'
        })
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );

  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent: bnbIntent,
        txHash: TX_HASH_1,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({
          eth_chainId: '0x38',
          eth_getTransactionReceipt: { transactionHash: TX_HASH_1, blockNumber: '0x64', status: '0x1', logs: [] },
          eth_getTransactionByHash: { hash: TX_HASH_2, from: SENDER_EVM, to: TREASURY_EVM, value: '0xde0b6b3a7640000' },
          eth_blockNumber: '0x80'
        })
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
});

test('coverage [IMPORTANT-4]: RPC transport errors, split EVM logs, Solana status err/processed/v0 loadedAddresses, and orchestrator edge cases', async () => {
  // 1) RPC HTTP 500 & JSON-RPC error object & network rejection
  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent: buildEvmIntent(),
        txHash: TX_HASH_1,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({ eth_chainId: { __httpStatus: 503, body: {} } })
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent: buildEvmIntent(),
        txHash: TX_HASH_1,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({ eth_chainId: { __rpcError: { code: -32000, message: 'rate limit' } } })
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
  await assert.rejects(
    () =>
      verifySolanaTransaction({
        intent: buildSolanaIntent(),
        txHash: SOL_SIG_UPPER,
        env: buildRpcEnv(),
        fetchImpl: async () => {
          throw new Error('ECONNRESET');
        }
      }),
    (err) => err instanceof SolanaVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );

  // 2) EVM split ERC-20 Transfer logs summed in one tx + requiredConfirmations downgrade clamped to catalog minimum (15)
  const splitRes = await verifyEvmTransaction({
    intent: buildEvmIntent({ requiredConfirmations: 1 }), // attempt to downgrade BSC 15 -> 1 must be ignored
    txHash: TX_HASH_1,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(40000000000000000000n)
          },
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(60000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x68' // 5 confirmations < 15
    })
  });
  assert.equal(splitRes.verificationStatus, 'PROCESSING');
  assert.equal(splitRes.requiredConfirmations, 15);
  assert.equal(splitRes.receivedAmountAtomic, '100000000000000000000');

  // 3) EVM receipt.transactionHash mismatch fails closed
  await assert.rejects(
    () =>
      verifyEvmTransaction({
        intent: buildEvmIntent(),
        txHash: TX_HASH_1,
        env: buildRpcEnv(),
        fetchImpl: createJsonRpcFetchMock({
          eth_chainId: '0x38',
          eth_getTransactionReceipt: { transactionHash: TX_HASH_2, blockNumber: '0x64', status: '0x1', logs: [] },
          eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
          eth_blockNumber: '0x80'
        })
      }),
    (err) => err instanceof EvmVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );

  // 4) Solana getSignatureStatuses err !== null -> FAILED, 'processed' -> PROCESSING, v0 loadedAddresses SOL -> READY_TO_SETTLE
  const statusErr = await verifySolanaTransaction({
    intent: buildSolanaIntent(),
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: null,
      getSignatureStatuses: { value: [{ slot: 900001, err: { InsufficientFundsForRent: {} }, confirmationStatus: 'confirmed' }] }
    })
  });
  assert.equal(statusErr.verificationStatus, 'FAILED');
  assert.equal(statusErr.reason, 'TX_FAILED_ONCHAIN');

  const statusProcessed = await verifySolanaTransaction({
    intent: buildSolanaIntent(),
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: null,
      getSignatureStatuses: { value: [{ slot: 900002, err: null, confirmationStatus: 'processed' }] }
    })
  });
  assert.equal(statusProcessed.verificationStatus, 'PROCESSING');
  assert.equal(statusProcessed.reason, 'AWAITING_FINALIZATION');

  const v0Loaded = await verifySolanaTransaction({
    intent: buildSolanaIntent({
      networkMode: 'testnet',
      chainId: 'solana-devnet',
      paymentAsset: 'SOL',
      tokenContractAddress: null,
      expectedAmountAtomic: '1000000000'
    }),
    txHash: SOL_SIG_UPPER,
    env: buildRpcEnv(),
    fetchImpl: createJsonRpcFetchMock({
      getTransaction: {
        slot: 900003,
        transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }] } },
        meta: {
          err: null,
          loadedAddresses: { writable: [TREASURY_SOL], readonly: [] },
          preBalances: [5000000000, 1000000000],
          postBalances: [3999995000, 2000000000]
        }
      }
    })
  });
  assert.equal(v0Loaded.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(v0Loaded.receivedAmountAtomic, '1000000000');

  // 5) Orchestrator input validation, Timestamp expiresAt, FAILED/UNDERPAID preserved after expiresAt, empty Solana scan
  assert.throws(() => createOnChainVerifier({}), TypeError);
  const verifier = createOnChainVerifier({
    db: createInMemoryUsedTxDb(),
    env: buildRpcEnv(),
    now: () => Date.parse('2026-11-22T00:20:00.000Z'),
    fetchImpl: createJsonRpcFetchMock({
      getSignaturesForAddress: [],
      getTokenAccountsByOwner: { value: [] },
      eth_chainId: '0x38',
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH_1,
        blockNumber: '0x64',
        status: '0x1',
        logs: [
          {
            address: BSC_USDT_MAINNET,
            topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
            data: encodeUint256Hex(50000000000000000000n)
          }
        ]
      },
      eth_getTransactionByHash: { hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' },
      eth_blockNumber: '0x80'
    })
  });

  await assert.rejects(
    () => verifier.verifyIntentPayment({ intent: buildEvmIntent({ status: 'CONFIRMED' }), txHash: TX_HASH_1 }),
    (err) => err instanceof OnChainVerifierError && err.code === 'INVALID_INTENT'
  );
  await assert.rejects(
    () => verifier.verifyIntentPayment({ intent: buildEvmIntent({ expectedAmountAtomic: '0' }), txHash: TX_HASH_1 }),
    (err) => err instanceof OnChainVerifierError && err.code === 'INVALID_INTENT'
  );
  await assert.rejects(
    () => verifier.discoverAndVerifyIncomingPayment({ intent: buildEvmIntent({ status: 'SETTLED' }) }),
    (err) => err instanceof OnChainVerifierError && err.code === 'INTENT_TERMINAL_STATUS'
  );

  // UNDERPAID preserved even after expiresAt (with Firestore Timestamp-style { toDate() })
  const lateUnderpaid = await verifier.verifyIntentPayment({
    intent: buildEvmIntent({ expiresAt: { toDate: () => new Date('2026-11-22T00:15:00.000Z') } }),
    txHash: TX_HASH_1
  });
  assert.equal(lateUnderpaid.verificationStatus, 'UNDERPAID');
  assert.equal(lateUnderpaid.shortfallAtomic, '50000000000000000000');

  // Empty Solana SPL scan after expiresAt -> EXPIRED
  const emptySolExpired = await verifier.discoverAndVerifyIncomingPayment({
    intent: buildSolanaIntent({ txHash: null })
  });
  assert.equal(emptySolExpired.verificationStatus, 'EXPIRED');
  assert.equal(emptySolExpired.txHash, null);
});
