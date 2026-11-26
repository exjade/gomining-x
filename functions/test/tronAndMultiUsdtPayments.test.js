'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const paymentConfig = require('../src/payments/paymentConfig');
const evmVerifier = require('../src/payments/evmVerifier');
const paymentIntentService = require('../src/payments/paymentIntentService');
const onChainVerifier = require('../src/payments/onChainVerifier');
const paymentsIndex = require('../src/payments/index');

const OFFICIAL_TRON_USDT_MAINNET = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const OFFICIAL_TRON_USDT_HEX41 = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const OFFICIAL_TRON_USDT_HEX20 = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function makeTronBase58FromHex20(hex20) {
  const payload = Buffer.from(`41${hex20}`, 'hex');
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  const full = Buffer.concat([payload, hash2.subarray(0, 4)]);
  let leadingZeros = 0;
  for (const byte of full) {
    if (byte === 0) leadingZeros += 1;
    else break;
  }
  let value = BigInt(`0x${full.toString('hex')}`);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  return '1'.repeat(leadingZeros) + encoded;
}

const TREASURY_HEX20 = '1111111111111111111111111111111111111111';
const SENDER_HEX20 = '2222222222222222222222222222222222222222';
const OTHER_SENDER_HEX20 = '3333333333333333333333333333333333333333';
const FAKE_CONTRACT_HEX20 = '4444444444444444444444444444444444444444';
const TESTNET_USDT_HEX20 = '5555555555555555555555555555555555555555';

const TRON_TREASURY = makeTronBase58FromHex20(TREASURY_HEX20);
const TRON_SENDER = makeTronBase58FromHex20(SENDER_HEX20);
const TRON_OTHER_SENDER = makeTronBase58FromHex20(OTHER_SENDER_HEX20);
const TRON_FAKE_CONTRACT = makeTronBase58FromHex20(FAKE_CONTRACT_HEX20);
const TRON_TESTNET_USDT = makeTronBase58FromHex20(TESTNET_USDT_HEX20);

const EVM_TREASURY = '0x1111111111111111111111111111111111111111';
const SOLANA_TREASURY = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const VALID_TRON_TX_HASH = 'a'.repeat(64);
const VALID_TRON_TX_HASH_2 = 'b'.repeat(64);
const VALID_EVM_TX_HASH = `0x${'c'.repeat(64)}`;

function padTopicHex20(hex20) {
  return hex20.toLowerCase().padStart(64, '0');
}

function encodeUint256Hex(amountBigInt) {
  return amountBigInt.toString(16).padStart(64, '0');
}

function createMockDb(usedTxDocs = {}) {
  const store = new Map(Object.entries(usedTxDocs));
  return {
    collection(name) {
      assert.equal(name, 'usedTxHashes');
      return {
        doc(id) {
          return {
            async get() {
              const data = store.get(id);
              return {
                exists: data !== undefined,
                data: () => data
              };
            }
          };
        }
      };
    }
  };
}

function buildTronIntent(overrides = {}) {
  return {
    intentId: 'pi_tron_001',
    status: 'AWAITING',
    paymentNetwork: 'tron',
    networkMode: 'mainnet',
    chainId: 'tron-mainnet',
    paymentAsset: 'USDT',
    expectedAmountAtomic: '100000000',
    treasuryAddress: TRON_TREASURY,
    tokenContractAddress: OFFICIAL_TRON_USDT_MAINNET,
    senderWallet: TRON_SENDER,
    requiredConfirmations: 20,
    createdAt: '2026-11-26T00:00:00.000Z',
    expiresAt: '2026-11-26T01:00:00.000Z',
    ...overrides
  };
}

// ============================================================================
// TASK 1: Catalog, Base58Check TRON validation, EVM RPC env, Spot Pricing
// ============================================================================

test('Task 1.1: isValidTronAddress, tronBase58ToHex41, hex41ToTronBase58 & isAddressValidForFamily', () => {
  assert.equal(typeof paymentConfig.isValidTronAddress, 'function');
  assert.equal(typeof paymentConfig.tronBase58ToHex41, 'function');
  assert.equal(typeof paymentConfig.hex41ToTronBase58, 'function');
  assert.equal(typeof paymentConfig.isAddressValidForFamily, 'function');

  // Official USDT TRC-20 mainnet address
  assert.equal(paymentConfig.isValidTronAddress(OFFICIAL_TRON_USDT_MAINNET), true);
  assert.equal(paymentConfig.tronBase58ToHex41(OFFICIAL_TRON_USDT_MAINNET), OFFICIAL_TRON_USDT_HEX41);
  assert.equal(paymentConfig.hex41ToTronBase58(OFFICIAL_TRON_USDT_HEX41), OFFICIAL_TRON_USDT_MAINNET);
  assert.equal(paymentConfig.hex41ToTronBase58(`0x${OFFICIAL_TRON_USDT_HEX41}`), OFFICIAL_TRON_USDT_MAINNET);

  // Fixture addresses round-trip
  assert.equal(paymentConfig.isValidTronAddress(TRON_TREASURY), true);
  assert.equal(paymentConfig.tronBase58ToHex41(TRON_TREASURY), `41${TREASURY_HEX20}`);
  assert.equal(paymentConfig.hex41ToTronBase58(`41${TREASURY_HEX20}`), TRON_TREASURY);

  // Tampered checksum rejected
  const tampered = `${OFFICIAL_TRON_USDT_MAINNET.slice(0, -1)}${OFFICIAL_TRON_USDT_MAINNET.endsWith('t') ? 's' : 't'}`;
  assert.equal(paymentConfig.isValidTronAddress(tampered), false);

  // Non-TRON addresses rejected
  const zeroTron = makeTronBase58FromHex20('0'.repeat(40));
  for (const invalid of [
    '',
    '   ',
    null,
    undefined,
    EVM_TREASURY,
    SOLANA_TREASURY,
    '11111111111111111111111111111111',
    zeroTron,
    'Tshort',
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
  ]) {
    assert.equal(paymentConfig.isValidTronAddress(invalid), false, `Must reject invalid TRON address: ${String(invalid)}`);
  }

  // 3-family dispatch
  assert.equal(paymentConfig.isAddressValidForFamily(EVM_TREASURY, 'evm'), true);
  assert.equal(paymentConfig.isAddressValidForFamily(TRON_TREASURY, 'evm'), false);
  assert.equal(paymentConfig.isAddressValidForFamily(SOLANA_TREASURY, 'solana'), true);
  assert.equal(paymentConfig.isAddressValidForFamily(TRON_TREASURY, 'tron'), true);
  assert.equal(paymentConfig.isAddressValidForFamily(EVM_TREASURY, 'tron'), false);
  assert.equal(paymentConfig.isAddressValidForFamily(TRON_TREASURY, 'unknown'), false);
});

test('Task 1.2: resolvePaymentRoute supports tron, arbitrum, optimism, avalanche with exact Mainnet/Testnet specs', () => {
  const mainnetEnv = {
    PAYMENT_NETWORK_MODE: 'mainnet',
    TREASURY_EVM_ADDRESS: EVM_TREASURY,
    TREASURY_SOLANA_ADDRESS: SOLANA_TREASURY,
    TREASURY_TRON_ADDRESS: TRON_TREASURY
  };

  // TRON Mainnet USDT + TRX
  const tronUsdt = paymentConfig.resolvePaymentRoute({ networkId: 'tron', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(tronUsdt.family, 'tron');
  assert.equal(tronUsdt.chainId, 'tron-mainnet');
  assert.equal(tronUsdt.recommended, true);
  assert.equal(tronUsdt.requiredConfirmations, 20);
  assert.equal(tronUsdt.assetDecimals, 6);
  assert.equal(tronUsdt.isNative, false);
  assert.equal(tronUsdt.tokenContractAddress, OFFICIAL_TRON_USDT_MAINNET);
  assert.equal(tronUsdt.treasuryAddress, TRON_TREASURY);
  assert.equal(tronUsdt.explorerBaseUrl, 'https://tronscan.org');
  assert.equal(tronUsdt.explorerTxPath, '/#/transaction/');

  const tronTrx = paymentConfig.resolvePaymentRoute({ networkId: 'tron', assetSymbol: 'TRX', env: mainnetEnv });
  assert.equal(tronTrx.isNative, true);
  assert.equal(tronTrx.assetDecimals, 6);
  assert.equal(tronTrx.tokenContractAddress, null);

  // TRON fail-closed treasury
  assert.throws(
    () => paymentConfig.resolvePaymentRoute({
      networkId: 'tron',
      assetSymbol: 'USDT',
      env: { PAYMENT_NETWORK_MODE: 'mainnet' }
    }),
    (err) => err instanceof paymentConfig.PaymentConfigError && err.code === 'TREASURY_NOT_CONFIGURED'
  );

  // TRON Testnet (Nile)
  const tronTestEnv = {
    PAYMENT_NETWORK_MODE: 'testnet',
    TREASURY_TRON_ADDRESS: TRON_TREASURY,
    PAYMENT_TESTNET_USDT_TRON_CONTRACT: TRON_TESTNET_USDT
  };
  const tronTestUsdt = paymentConfig.resolvePaymentRoute({ networkId: 'tron', assetSymbol: 'USDT', env: tronTestEnv });
  assert.equal(tronTestUsdt.chainId, 'tron-nile');
  assert.equal(tronTestUsdt.explorerBaseUrl, 'https://nile.tronscan.org');
  assert.equal(tronTestUsdt.explorerTxPath, '/#/transaction/');
  assert.equal(tronTestUsdt.tokenContractAddress, TRON_TESTNET_USDT);

  assert.throws(
    () => paymentConfig.resolvePaymentRoute({
      networkId: 'tron',
      assetSymbol: 'USDT',
      env: { PAYMENT_NETWORK_MODE: 'testnet', TREASURY_TRON_ADDRESS: TRON_TREASURY }
    }),
    (err) => err instanceof paymentConfig.PaymentConfigError && err.code === 'TOKEN_CONTRACT_NOT_CONFIGURED'
  );

  // Arbitrum Mainnet + Testnet
  const arbUsdt = paymentConfig.resolvePaymentRoute({ networkId: 'arbitrum', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(arbUsdt.family, 'evm');
  assert.equal(arbUsdt.chainId, 42161);
  assert.equal(arbUsdt.recommended, true);
  assert.equal(arbUsdt.requiredConfirmations, 20);
  assert.equal(arbUsdt.assetDecimals, 6);
  assert.equal(arbUsdt.tokenContractAddress, '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
  assert.equal(arbUsdt.explorerBaseUrl, 'https://arbiscan.io');
  assert.equal(arbUsdt.explorerTxPath, '/tx/');

  const arbEth = paymentConfig.resolvePaymentRoute({ networkId: 'arbitrum', assetSymbol: 'ETH', env: mainnetEnv });
  assert.equal(arbEth.isNative, true);
  assert.equal(arbEth.assetDecimals, 18);

  const arbTest = paymentConfig.resolvePaymentRoute({
    networkId: 'arbitrum',
    assetSymbol: 'USDT',
    env: {
      PAYMENT_NETWORK_MODE: 'testnet',
      TREASURY_EVM_ADDRESS: EVM_TREASURY,
      PAYMENT_TESTNET_USDT_ARBITRUM_CONTRACT: '0x2222222222222222222222222222222222222222'
    }
  });
  assert.equal(arbTest.chainId, 421614);
  assert.equal(arbTest.explorerBaseUrl, 'https://sepolia.arbiscan.io');

  // Optimism Mainnet + Testnet
  const optUsdt = paymentConfig.resolvePaymentRoute({ networkId: 'optimism', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(optUsdt.family, 'evm');
  assert.equal(optUsdt.chainId, 10);
  assert.equal(optUsdt.recommended, true);
  assert.equal(optUsdt.requiredConfirmations, 20);
  assert.equal(optUsdt.assetDecimals, 6);
  assert.equal(optUsdt.tokenContractAddress, '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58');
  assert.equal(optUsdt.explorerBaseUrl, 'https://optimistic.etherscan.io');

  const optTest = paymentConfig.resolvePaymentRoute({
    networkId: 'optimism',
    assetSymbol: 'USDT',
    env: {
      PAYMENT_NETWORK_MODE: 'testnet',
      TREASURY_EVM_ADDRESS: EVM_TREASURY,
      PAYMENT_TESTNET_USDT_OPTIMISM_CONTRACT: '0x3333333333333333333333333333333333333333'
    }
  });
  assert.equal(optTest.chainId, 11155420);
  assert.equal(optTest.explorerBaseUrl, 'https://sepolia-optimism.etherscan.io');

  // Avalanche Mainnet + Testnet
  const avaxUsdt = paymentConfig.resolvePaymentRoute({ networkId: 'avalanche', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(avaxUsdt.family, 'evm');
  assert.equal(avaxUsdt.chainId, 43114);
  assert.equal(avaxUsdt.recommended, true);
  assert.equal(avaxUsdt.requiredConfirmations, 12);
  assert.equal(avaxUsdt.assetDecimals, 6);
  assert.equal(avaxUsdt.tokenContractAddress, '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7');
  assert.equal(avaxUsdt.explorerBaseUrl, 'https://snowtrace.io');

  const avaxNative = paymentConfig.resolvePaymentRoute({ networkId: 'avalanche', assetSymbol: 'AVAX', env: mainnetEnv });
  assert.equal(avaxNative.isNative, true);
  assert.equal(avaxNative.assetDecimals, 18);

  const avaxTest = paymentConfig.resolvePaymentRoute({
    networkId: 'avalanche',
    assetSymbol: 'USDT',
    env: {
      PAYMENT_NETWORK_MODE: 'testnet',
      TREASURY_EVM_ADDRESS: EVM_TREASURY,
      PAYMENT_TESTNET_USDT_AVALANCHE_CONTRACT: '0x4444444444444444444444444444444444444444'
    }
  });
  assert.equal(avaxTest.chainId, 43113);
  assert.equal(avaxTest.explorerBaseUrl, 'https://testnet.snowtrace.io');
});

test('Task 1.3: resolveEvmRpcUrl supports arbitrum, optimism, avalanche (mainnet & testnet) and spot pricing supports TRX & AVAX', async () => {
  const env = {
    PAYMENT_RPC_URL_ARBITRUM_MAINNET: 'https://arbitrum-one-rpc.publicnode.com',
    PAYMENT_RPC_URL_ARBITRUM_TESTNET: 'https://arbitrum-sepolia-rpc.publicnode.com',
    PAYMENT_RPC_URL_OPTIMISM_MAINNET: 'https://optimism-rpc.publicnode.com',
    PAYMENT_RPC_URL_OPTIMISM_TESTNET: 'https://optimism-sepolia-rpc.publicnode.com',
    PAYMENT_RPC_URL_AVALANCHE_MAINNET: 'https://avalanche-c-chain-rpc.publicnode.com',
    PAYMENT_RPC_URL_AVALANCHE_TESTNET: 'https://avalanche-fuji-c-chain-rpc.publicnode.com'
  };

  assert.equal(evmVerifier.resolveEvmRpcUrl('arbitrum', 'mainnet', env), env.PAYMENT_RPC_URL_ARBITRUM_MAINNET);
  assert.equal(evmVerifier.resolveEvmRpcUrl('arbitrum', 'testnet', env), env.PAYMENT_RPC_URL_ARBITRUM_TESTNET);
  assert.equal(evmVerifier.resolveEvmRpcUrl('optimism', 'mainnet', env), env.PAYMENT_RPC_URL_OPTIMISM_MAINNET);
  assert.equal(evmVerifier.resolveEvmRpcUrl('optimism', 'testnet', env), env.PAYMENT_RPC_URL_OPTIMISM_TESTNET);
  assert.equal(evmVerifier.resolveEvmRpcUrl('avalanche', 'mainnet', env), env.PAYMENT_RPC_URL_AVALANCHE_MAINNET);
  assert.equal(evmVerifier.resolveEvmRpcUrl('avalanche', 'testnet', env), env.PAYMENT_RPC_URL_AVALANCHE_TESTNET);

  const requestedUrls = [];
  const spotProvider = paymentIntentService.createDefaultSpotPriceProvider({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes('ids=tron')) {
        return { ok: true, async json() { return { tron: { usd: 0.25 } }; } };
      }
      if (url.includes('ids=avalanche-2')) {
        return { ok: true, async json() { return { 'avalanche-2': { usd: 35.5 } }; } };
      }
      if (url.includes('ids=ethereum')) {
        return { ok: true, async json() { return { ethereum: { usd: 3200 } }; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    }
  });

  const trxQuote = await spotProvider({ assetSymbol: 'TRX', networkId: 'tron' });
  assert.equal(trxQuote.priceUsd, '0.25');
  const avaxQuote = await spotProvider({ assetSymbol: 'AVAX', networkId: 'avalanche' });
  assert.equal(avaxQuote.priceUsd, '35.5');
  const ethArbQuote = await spotProvider({ assetSymbol: 'ETH', networkId: 'arbitrum' });
  assert.equal(ethArbQuote.priceUsd, '3200');
  assert.equal(requestedUrls.length, 3);
});

// ============================================================================
// TASK 2: tronVerifier.js & onChainVerifier.js 3-family dispatch
// ============================================================================

test('Task 2.1: tronVerifier resolveTronRpcUrl fail-closed, optional TRON-PRO-API-KEY header & secret redaction', async () => {
  const tronVerifier = require('../src/payments/tronVerifier');

  assert.throws(
    () => tronVerifier.resolveTronRpcUrl('mainnet', {}),
    (err) => err instanceof tronVerifier.TronVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
  assert.throws(
    () => tronVerifier.resolveTronRpcUrl('testnet', { PAYMENT_RPC_URL_TRON_TESTNET: 'ftp://bad.host' }),
    (err) => err instanceof tronVerifier.TronVerifierError && err.code === 'RPC_URL_NOT_CONFIGURED'
  );
  assert.equal(
    tronVerifier.resolveTronRpcUrl('mainnet', { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io/' }),
    'https://api.trongrid.io'
  );

  // Verify TRON-PRO-API-KEY header is attached when configured and redacted if fetch throws containing it
  const capturedHeaders = [];
  const secretKey = 'super-secret-trongrid-api-key-999';
  const envWithKey = {
    PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io',
    PAYMENT_TRONGRID_API_KEY: secretKey
  };

  await assert.rejects(
    () => tronVerifier.verifyTronTransaction({
      intent: buildTronIntent(),
      txHash: VALID_TRON_TX_HASH,
      env: envWithKey,
      fetchImpl: async (_url, opts) => {
        capturedHeaders.push(opts.headers);
        throw new Error(`connect failed to https://api.trongrid.io with ${secretKey}`);
      }
    }),
    (err) => {
      assert.ok(err instanceof tronVerifier.TronVerifierError);
      assert.equal(err.code, 'RPC_REQUEST_FAILED');
      assert.equal(err.message.includes(secretKey), false, 'API key must NEVER leak in error message');
      assert.equal(err.message.includes('api.trongrid.io'), false, 'RPC URL must NEVER leak in error message');
      return true;
    }
  );
  assert.equal(capturedHeaders[0]['TRON-PRO-API-KEY'], secretKey);
});

test('Task 2.2: verifyTronTransaction USDT TRC-20 happy path, PROCESSING, OUT_OF_ENERGY, UNDERPAID, fake contract, wrong recipient, SENDER_MISMATCH', async () => {
  const tronVerifier = require('../src/payments/tronVerifier');
  const env = { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io' };

  function makeMockFetch({
    txRet = 'SUCCESS',
    receiptResult = 'SUCCESS',
    txBlock = 1000,
    nowBlock = 1025,
    logContract = OFFICIAL_TRON_USDT_HEX20,
    fromHex20 = SENDER_HEX20,
    toHex20 = TREASURY_HEX20,
    amountAtomic = 100_000_000n,
    extraLogs = []
  } = {}) {
    return async (url) => {
      if (url.endsWith('/wallet/gettransactionbyid')) {
        return {
          ok: true,
          async json() {
            return { txID: VALID_TRON_TX_HASH, ret: [{ contractRet: txRet }] };
          }
        };
      }
      if (url.endsWith('/wallet/gettransactioninfobyid')) {
        return {
          ok: true,
          async json() {
            return {
              id: VALID_TRON_TX_HASH,
              blockNumber: txBlock,
              receipt: { result: receiptResult },
              log: [
                {
                  address: logContract,
                  topics: [TRANSFER_TOPIC, padTopicHex20(fromHex20), padTopicHex20(toHex20)],
                  data: encodeUint256Hex(amountAtomic)
                },
                ...extraLogs
              ]
            };
          }
        };
      }
      if (url.endsWith('/wallet/getnowblock')) {
        return {
          ok: true,
          async json() {
            return { block_header: { raw_data: { number: nowBlock } } };
          }
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
  }

  // 1. Happy path READY_TO_SETTLE (confirmations = 26 >= 20)
  const ready = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH.toUpperCase(),
    env,
    fetchImpl: makeMockFetch()
  });
  assert.equal(ready.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(ready.confirmations, 26);
  assert.equal(ready.txHash, VALID_TRON_TX_HASH);
  assert.equal(ready.receivedAmountAtomic, '100000000');
  assert.equal(ready.fromAddress, TRON_SENDER);
  assert.equal(ready.blockNumber, 1000);

  // 2. Partial confirmations -> PROCESSING (5 < 20)
  const processing = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ txBlock: 1000, nowBlock: 1004 })
  });
  assert.equal(processing.verificationStatus, 'PROCESSING');
  assert.equal(processing.confirmations, 5);
  assert.equal(processing.reason, 'AWAITING_CONFIRMATIONS');

  // 3. Reverted / OUT_OF_ENERGY -> FAILED
  const outOfEnergy = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ receiptResult: 'OUT_OF_ENERGY' })
  });
  assert.equal(outOfEnergy.verificationStatus, 'FAILED');
  assert.equal(outOfEnergy.receivedAmountAtomic, '0');

  const reverted = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ txRet: 'REVERT', receiptResult: 'REVERT' })
  });
  assert.equal(reverted.verificationStatus, 'FAILED');

  // 4. UNDERPAID with exact shortfallAtomic
  const underpaid = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent({ expectedAmountAtomic: '100000000' }),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ amountAtomic: 99_500_000n })
  });
  assert.equal(underpaid.verificationStatus, 'UNDERPAID');
  assert.equal(underpaid.receivedAmountAtomic, '99500000');
  assert.equal(underpaid.shortfallAtomic, '500000');

  // 5. Fake TRC-20 contract -> FAILED
  const fakeContract = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ logContract: FAKE_CONTRACT_HEX20 })
  });
  assert.equal(fakeContract.verificationStatus, 'FAILED');
  assert.equal(fakeContract.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // 6. Wrong treasury recipient -> FAILED
  const wrongRecipient = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ toHex20: OTHER_SENDER_HEX20 })
  });
  assert.equal(wrongRecipient.verificationStatus, 'FAILED');
  assert.equal(wrongRecipient.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // 7. SENDER_MISMATCH -> FAILED
  const senderMismatch = await tronVerifier.verifyTronTransaction({
    intent: buildTronIntent(),
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl: makeMockFetch({ fromHex20: OTHER_SENDER_HEX20 })
  });
  assert.equal(senderMismatch.verificationStatus, 'FAILED');
  assert.equal(senderMismatch.reason, 'SENDER_MISMATCH');
  assert.equal(senderMismatch.fromAddress, TRON_OTHER_SENDER);
});

test('Task 2.3: verifyTronTransaction native TRX TransferContract (6 decimals sun)', async () => {
  const tronVerifier = require('../src/payments/tronVerifier');
  const env = { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io' };

  const trxIntent = buildTronIntent({
    paymentAsset: 'TRX',
    tokenContractAddress: null,
    expectedAmountAtomic: '50000000'
  });

  const fetchImpl = async (url) => {
    if (url.endsWith('/wallet/gettransactionbyid')) {
      return {
        ok: true,
        async json() {
          return {
            txID: VALID_TRON_TX_HASH,
            ret: [{ contractRet: 'SUCCESS' }],
            raw_data: {
              contract: [
                {
                  type: 'TransferContract',
                  parameter: {
                    value: {
                      owner_address: `41${SENDER_HEX20}`,
                      to_address: `41${TREASURY_HEX20}`,
                      amount: 50_000_000
                    }
                  }
                }
              ]
            }
          };
        }
      };
    }
    if (url.endsWith('/wallet/gettransactioninfobyid')) {
      return { ok: true, async json() { return { id: VALID_TRON_TX_HASH, blockNumber: 2000 }; } };
    }
    if (url.endsWith('/wallet/getnowblock')) {
      return { ok: true, async json() { return { block_header: { raw_data: { number: 2020 } } }; } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const res = await tronVerifier.verifyTronTransaction({
    intent: trxIntent,
    txHash: VALID_TRON_TX_HASH,
    env,
    fetchImpl
  });
  assert.equal(res.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(res.confirmations, 21);
  assert.equal(res.receivedAmountAtomic, '50000000');
  assert.equal(res.fromAddress, TRON_SENDER);
});

test('Task 2.4: findIncomingTronTransfer discovers TRC-20 & TRX transfers, enforces anti-replay & re-verifies on-chain', async () => {
  const tronVerifier = require('../src/payments/tronVerifier');
  const env = { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io' };

  const usedSet = new Set([VALID_TRON_TX_HASH]);
  const verifiedCalls = [];

  const fetchImpl = async (url, opts) => {
    if (url.includes(`/v1/accounts/${TRON_TREASURY}/transactions/trc20`)) {
      return {
        ok: true,
        async json() {
          return {
            success: true,
            data: [
              {
                transaction_id: VALID_TRON_TX_HASH,
                from: TRON_SENDER,
                to: TRON_TREASURY,
                value: '100000000',
                block_timestamp: Date.parse('2026-11-26T00:05:00.000Z')
              },
              {
                transaction_id: VALID_TRON_TX_HASH_2,
                from: TRON_SENDER,
                to: TRON_TREASURY,
                value: '100000000',
                block_timestamp: Date.parse('2026-11-26T00:06:00.000Z')
              }
            ]
          };
        }
      };
    }
    if (url.endsWith('/wallet/gettransactionbyid')) {
      const parsed = JSON.parse(opts.body);
      verifiedCalls.push(parsed.value);
      return { ok: true, async json() { return { txID: parsed.value, ret: [{ contractRet: 'SUCCESS' }] }; } };
    }
    if (url.endsWith('/wallet/gettransactioninfobyid')) {
      const parsed = JSON.parse(opts.body);
      return {
        ok: true,
        async json() {
          return {
            id: parsed.value,
            blockNumber: 5000,
            receipt: { result: 'SUCCESS' },
            log: [
              {
                address: OFFICIAL_TRON_USDT_HEX20,
                topics: [TRANSFER_TOPIC, padTopicHex20(SENDER_HEX20), padTopicHex20(TREASURY_HEX20)],
                data: encodeUint256Hex(100_000_000n)
              }
            ]
          };
        }
      };
    }
    if (url.endsWith('/wallet/getnowblock')) {
      return { ok: true, async json() { return { block_header: { raw_data: { number: 5025 } } }; } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const found = await tronVerifier.findIncomingTronTransfer({
    intent: buildTronIntent(),
    limit: 25,
    env,
    fetchImpl,
    isTxHashUsed: async (hash) => usedSet.has(hash)
  });

  assert.ok(found, 'Must discover unused matching TRC-20 transfer');
  assert.equal(found.txHash, VALID_TRON_TX_HASH_2);
  assert.equal(found.verificationStatus, 'READY_TO_SETTLE');
  assert.deepEqual(verifiedCalls, [VALID_TRON_TX_HASH_2], 'Used txHash must be skipped and candidate must be re-verified via verifyTronTransaction');
});

test('Task 2.5: onChainVerifier buildUsedTxHashKey, 3-family dispatch (TRON + Arbitrum/Optimism/Avalanche), anti-replay & index error mapping', async () => {
  // 6 new EVM chainIds + 2 TRON chainIds
  for (const evmChainId of [42161, 421614, 10, 11155420, 43114, 43113]) {
    assert.equal(
      onChainVerifier.buildUsedTxHashKey(evmChainId, `0x${'C'.repeat(64)}`),
      `${evmChainId}_${VALID_EVM_TX_HASH}`
    );
  }
  assert.equal(
    onChainVerifier.buildUsedTxHashKey('tron-mainnet', VALID_TRON_TX_HASH.toUpperCase()),
    `tron-mainnet_${VALID_TRON_TX_HASH}`
  );
  assert.equal(
    onChainVerifier.buildUsedTxHashKey('tron-nile', VALID_TRON_TX_HASH),
    `tron-nile_${VALID_TRON_TX_HASH}`
  );
  assert.throws(
    () => onChainVerifier.buildUsedTxHashKey('tron-mainnet', `0x${VALID_TRON_TX_HASH}`),
    (err) => err instanceof onChainVerifier.OnChainVerifierError && err.code === 'INVALID_TX_HASH'
  );

  // Anti-replay check in verifyIntentPayment for TRON
  const dbWithReplay = createMockDb({
    [`tron-mainnet_${VALID_TRON_TX_HASH}`]: { intentId: 'pi_other_intent' }
  });
  const verifierReplay = onChainVerifier.createOnChainVerifier({
    db: dbWithReplay,
    env: { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io' },
    fetchImpl: async () => { throw new Error('Should not query RPC on replay'); }
  });
  await assert.rejects(
    () => verifierReplay.verifyIntentPayment({ intent: buildTronIntent(), txHash: VALID_TRON_TX_HASH }),
    (err) => err instanceof onChainVerifier.OnChainVerifierError && err.code === 'TX_HASH_ALREADY_USED'
  );

  // Happy path verifyIntentPayment + discoverAndVerifyIncomingPayment for TRON
  const verifierOk = onChainVerifier.createOnChainVerifier({
    db: createMockDb(),
    env: { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io' },
    now: () => Date.parse('2026-11-26T00:10:00.000Z'),
    fetchImpl: async (url) => {
      if (url.includes('/transactions/trc20')) {
        return {
          ok: true,
          async json() {
            return {
              data: [{ transaction_id: VALID_TRON_TX_HASH, from: TRON_SENDER, to: TRON_TREASURY, value: '100000000', block_timestamp: Date.parse('2026-11-26T00:05:00.000Z') }]
            };
          }
        };
      }
      if (url.endsWith('/wallet/gettransactionbyid')) {
        return { ok: true, async json() { return { txID: VALID_TRON_TX_HASH, ret: [{ contractRet: 'SUCCESS' }] }; } };
      }
      if (url.endsWith('/wallet/gettransactioninfobyid')) {
        return {
          ok: true,
          async json() {
            return {
              id: VALID_TRON_TX_HASH,
              blockNumber: 100,
              receipt: { result: 'SUCCESS' },
              log: [{ address: OFFICIAL_TRON_USDT_HEX20, topics: [TRANSFER_TOPIC, padTopicHex20(SENDER_HEX20), padTopicHex20(TREASURY_HEX20)], data: encodeUint256Hex(100_000_000n) }]
            };
          }
        };
      }
      if (url.endsWith('/wallet/getnowblock')) {
        return { ok: true, async json() { return { block_header: { raw_data: { number: 125 } } }; } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const direct = await verifierOk.verifyIntentPayment({ intent: buildTronIntent(), txHash: VALID_TRON_TX_HASH });
  assert.equal(direct.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(direct.usedTxKey, `tron-mainnet_${VALID_TRON_TX_HASH}`);

  const discovered = await verifierOk.discoverAndVerifyIncomingPayment({ intent: buildTronIntent() });
  assert.equal(discovered.verificationStatus, 'READY_TO_SETTLE');
  assert.equal(discovered.txHash, VALID_TRON_TX_HASH);

  // TronVerifierError maps cleanly in payments/index.js mapToHttpsError
  const { TronVerifierError } = require('../src/payments/tronVerifier');
  const mapped = paymentsIndex.mapToHttpsError(new TronVerifierError('INVALID_TX_HASH', 'bad tron tx', 400));
  assert.equal(mapped.code, 'invalid-argument');
  assert.equal(mapped.details?.reasonCode, 'INVALID_TX_HASH');
});

test('Review I-05: tronVerifier pre-filters TRX spam, aggregates split TRC-20 transfers, and fails closed when gettransactionbyid is empty', async () => {
  const tronVerifier = require('../src/payments/tronVerifier');
  const env = { PAYMENT_RPC_URL_TRON_MAINNET: 'https://api.trongrid.io' };

  // I-05a: Native TRX scan pre-filters dust/unrelated txs before calling verifyTronTransactionInternal
  const spamHash = 'e'.repeat(64);
  const wrongRecipientHash = 'f'.repeat(64);
  const goodTrxHash = '1'.repeat(64);
  const verifiedTxIds = [];

  const trxScanFetch = async (url, opts) => {
    if (url.includes(`/v1/accounts/${TRON_TREASURY}/transactions?`)) {
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                txID: spamHash,
                block_timestamp: Date.parse('2026-11-26T00:05:00.000Z'),
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [{ type: 'TransferContract', parameter: { value: { owner_address: `41${SENDER_HEX20}`, to_address: `41${TREASURY_HEX20}`, amount: 1 } } }]
                }
              },
              {
                txID: wrongRecipientHash,
                block_timestamp: Date.parse('2026-11-26T00:05:10.000Z'),
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [{ type: 'TransferContract', parameter: { value: { owner_address: `41${SENDER_HEX20}`, to_address: `41${OTHER_SENDER_HEX20}`, amount: 50_000_000 } } }]
                }
              },
              {
                txID: goodTrxHash,
                block_timestamp: Date.parse('2026-11-26T00:05:20.000Z'),
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [{ type: 'TransferContract', parameter: { value: { owner_address: `41${SENDER_HEX20}`, to_address: `41${TREASURY_HEX20}`, amount: 50_000_000 } } }]
                }
              }
            ]
          };
        }
      };
    }
    if (url.endsWith('/wallet/gettransactionbyid')) {
      const id = JSON.parse(opts.body).value;
      verifiedTxIds.push(id);
      return {
        ok: true,
        async json() {
          return {
            txID: id,
            ret: [{ contractRet: 'SUCCESS' }],
            raw_data: {
              contract: [{ type: 'TransferContract', parameter: { value: { owner_address: `41${SENDER_HEX20}`, to_address: `41${TREASURY_HEX20}`, amount: 50_000_000 } } }]
            }
          };
        }
      };
    }
    if (url.endsWith('/wallet/gettransactioninfobyid')) {
      const id = JSON.parse(opts.body).value;
      return { ok: true, async json() { return { id, blockNumber: 3000 }; } };
    }
    if (url.endsWith('/wallet/getnowblock')) {
      return { ok: true, async json() { return { block_header: { raw_data: { number: 3025 } } }; } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const trxFound = await tronVerifier.findIncomingTronTransfer({
    intent: buildTronIntent({ paymentAsset: 'TRX', tokenContractAddress: null, expectedAmountAtomic: '50000000' }),
    env,
    fetchImpl: trxScanFetch
  });
  assert.ok(trxFound);
  assert.equal(trxFound.txHash, goodTrxHash);
  assert.deepEqual(verifiedTxIds, [goodTrxHash], 'Dust and wrong-recipient TRX rows must be pre-filtered without RPC verify calls');

  // I-05b: Split TRC-20 payment (50 + 50 USDT in same tx) aggregated & discovered
  const splitHash = '2'.repeat(64);
  const splitFetch = async (url, opts) => {
    if (url.includes('/transactions/trc20')) {
      return {
        ok: true,
        async json() {
          return {
            data: [
              { transaction_id: splitHash, from: TRON_SENDER, to: TRON_TREASURY, value: '50000000', block_timestamp: Date.parse('2026-11-26T00:05:00.000Z') },
              { transaction_id: splitHash, from: TRON_SENDER, to: TRON_TREASURY, value: '50000000', block_timestamp: Date.parse('2026-11-26T00:05:00.000Z') }
            ]
          };
        }
      };
    }
    if (url.endsWith('/wallet/gettransactionbyid')) {
      const id = JSON.parse(opts.body).value;
      return { ok: true, async json() { return { txID: id, ret: [{ contractRet: 'SUCCESS' }] }; } };
    }
    if (url.endsWith('/wallet/gettransactioninfobyid')) {
      const id = JSON.parse(opts.body).value;
      return {
        ok: true,
        async json() {
          return {
            id,
            blockNumber: 4000,
            receipt: { result: 'SUCCESS' },
            log: [
              { address: OFFICIAL_TRON_USDT_HEX20, topics: [TRANSFER_TOPIC, padTopicHex20(SENDER_HEX20), padTopicHex20(TREASURY_HEX20)], data: encodeUint256Hex(50_000_000n) },
              { address: OFFICIAL_TRON_USDT_HEX20, topics: [TRANSFER_TOPIC, padTopicHex20(SENDER_HEX20), padTopicHex20(TREASURY_HEX20)], data: encodeUint256Hex(50_000_000n) }
            ]
          };
        }
      };
    }
    if (url.endsWith('/wallet/getnowblock')) {
      return { ok: true, async json() { return { block_header: { raw_data: { number: 4025 } } }; } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const splitFound = await tronVerifier.findIncomingTronTransfer({
    intent: buildTronIntent({ expectedAmountAtomic: '100000000' }),
    env,
    fetchImpl: splitFetch
  });
  assert.ok(splitFound, 'Split TRC-20 transfer rows sharing one transaction_id must be aggregated before filtering');
  assert.equal(splitFound.txHash, splitHash);
  assert.equal(splitFound.receivedAmountAtomic, '100000000');

  // I-05c: Fail closed with RPC_REQUEST_FAILED when gettransactionbyid returns {} for TRC-20
  await assert.rejects(
    () => tronVerifier.verifyTronTransaction({
      intent: buildTronIntent(),
      txHash: VALID_TRON_TX_HASH,
      env,
      fetchImpl: async (url) => {
        if (url.endsWith('/wallet/gettransactionbyid')) return { ok: true, async json() { return {}; } };
        if (url.endsWith('/wallet/gettransactioninfobyid')) {
          return {
            ok: true,
            async json() {
              return {
                id: VALID_TRON_TX_HASH,
                blockNumber: 100,
                receipt: { result: 'SUCCESS' },
                log: [{ address: OFFICIAL_TRON_USDT_HEX20, topics: [TRANSFER_TOPIC, padTopicHex20(SENDER_HEX20), padTopicHex20(TREASURY_HEX20)], data: encodeUint256Hex(100_000_000n) }]
              };
            }
          };
        }
        return { ok: true, async json() { return { block_header: { raw_data: { number: 125 } } }; } };
      }
    }),
    (err) => err instanceof tronVerifier.TronVerifierError && err.code === 'RPC_REQUEST_FAILED'
  );
});
