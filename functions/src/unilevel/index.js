'use strict';

const unilevelRates = require('./unilevelRates');
const calculateEligibleProfit = require('./calculateEligibleProfit');
const calculateDistribution = require('./calculateDistribution');
const dailyMiningProfitService = require('./dailyMiningProfitService');
const finalizeDailyMiningProfitModule = require('./finalizeDailyMiningProfit');
const unilevelSettlementService = require('./unilevelSettlementService');
const onMiningProfitFinalizedModule = require('./onMiningProfitFinalized');
const unilevelReadApi = require('./unilevelReadApi');

module.exports = Object.freeze({
  ...unilevelRates,
  ...calculateEligibleProfit,
  ...calculateDistribution,
  ...dailyMiningProfitService,
  ...finalizeDailyMiningProfitModule,
  ...unilevelSettlementService,
  ...onMiningProfitFinalizedModule,
  ...unilevelReadApi
});
