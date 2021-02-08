import { deploy } from '../../../lib/helpers/deploy';
import {
  calculateAnalyticalInvariantForTwoTokens,
  calculateInvariant,
  calcInGivenOut,
  calcOutGivenIn,
  calculateOneTokenAccumulatedSwapFees,
} from '../../helpers/math/stable';
import { expectEqualWithError } from '../../helpers/relativeError';
import { bn, decimal, fp } from '../../../lib/helpers/numbers';
import { Contract } from 'ethers';

const MAX_RELATIVE_ERROR = 0.001; //Max relative error

//TODO: Test this math by checking  extremes values for the amplification field (0 and infinite)
//to verify that it equals constant sum and constant product (weighted) invariants.

describe('StableMath', function () {
  let mock: Contract;

  beforeEach(async function () {
    mock = await deploy('MockStableMath', { args: [] });
  });

  context('invariant', () => {
    context('two tokens', () => {
      it('returns invariant', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(12e18)];

        const result = await mock.invariant(amp, balances);
        const expectedInvariant = calculateInvariant(amp, balances);

        expectEqualWithError(result, bn(expectedInvariant.toFixed(0)), MAX_RELATIVE_ERROR);
      });
      it('returns invariant equals analytical solution', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(12e18)];

        const result = await mock.invariant(amp, balances);
        const expectedInvariant = calculateAnalyticalInvariantForTwoTokens(amp, balances);

        expectEqualWithError(result, bn(expectedInvariant.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
    context('three tokens', () => {
      it('returns invariant', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(12e18), bn(14e18)];

        const result = await mock.invariant(amp, balances);
        const expectedInvariant = calculateInvariant(amp, balances);

        expectEqualWithError(result, bn(expectedInvariant.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
  });

  context('in given out', () => {
    context('two tokens', () => {
      it('returns in given out', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(12e18)];
        const tokenIndexIn = 0;
        const tokenIndexOut = 1;
        const amountOut = bn(1e18);

        const result = await mock.inGivenOut(amp, balances, tokenIndexIn, tokenIndexOut, amountOut);
        const expectedAmountIn = calcInGivenOut(amp, balances, tokenIndexIn, tokenIndexOut, amountOut);

        expectEqualWithError(result, bn(expectedAmountIn.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
    context('three tokens', () => {
      it('returns in given out', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(12e18), bn(14e18)];
        const tokenIndexIn = 0;
        const tokenIndexOut = 1;
        const amountOut = bn(1e18);

        const result = await mock.inGivenOut(amp, balances, tokenIndexIn, tokenIndexOut, amountOut);
        const expectedAmountIn = calcInGivenOut(amp, balances, tokenIndexIn, tokenIndexOut, amountOut);

        expectEqualWithError(result, bn(expectedAmountIn.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
  });

  context('out given in', () => {
    context('two tokens', () => {
      it('returns out given in', async () => {
        const amp = bn(10e18);
        const balances = [bn(10e18), bn(11e18)];
        const tokenIndexIn = 0;
        const tokenIndexOut = 1;
        const amountIn = bn(1e18);

        const result = await mock.outGivenIn(amp, balances, tokenIndexIn, tokenIndexOut, amountIn);
        const expectedAmountOut = calcOutGivenIn(amp, balances, tokenIndexIn, tokenIndexOut, amountIn);

        expectEqualWithError(result, bn(expectedAmountOut.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
    context('three tokens', () => {
      it('returns out given in', async () => {
        const amp = bn(10e18);
        const balances = [bn(10e18), bn(11e18), bn(12e18)];
        const tokenIndexIn = 0;
        const tokenIndexOut = 1;
        const amountIn = bn(1e18);

        const result = await mock.outGivenIn(amp, balances, tokenIndexIn, tokenIndexOut, amountIn);
        const expectedAmountOut = calcOutGivenIn(amp, balances, tokenIndexIn, tokenIndexOut, amountIn);

        expectEqualWithError(result, bn(expectedAmountOut.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
  });

  context('protocol swap fees', () => {
    context('two tokens', () => {
      it('returns protocol swap fees', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(11e18)];
        const lastInvariant = bn(10e18);
        const tokenIndex = 0;

        const protocolSwapFee = fp(0.1);

        const result = await mock.calculateDueTokenProtocolSwapFee(
          amp,
          balances,
          lastInvariant,
          tokenIndex,
          protocolSwapFee
        );

        const expectedFeeAmount = calculateOneTokenAccumulatedSwapFees(amp, balances, lastInvariant, tokenIndex);
        const expectedProtocolFeeAmount = expectedFeeAmount.mul(decimal(protocolSwapFee).div(1e18));

        expectEqualWithError(result, bn(expectedProtocolFeeAmount.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
    context('three tokens', () => {
      it('returns protocol swap fees', async () => {
        const amp = bn(100e18);
        const balances = [bn(10e18), bn(11e18), bn(12e18)];
        const lastInvariant = bn(10e18);
        const tokenIndex = 0;

        const protocolSwapFee = fp(0.1);

        const result = await mock.calculateDueTokenProtocolSwapFee(
          amp,
          balances,
          lastInvariant,
          tokenIndex,
          protocolSwapFee
        );
        const expectedFeeAmount = calculateOneTokenAccumulatedSwapFees(amp, balances, lastInvariant, tokenIndex);

        const expectedProtocolFeeAmount = expectedFeeAmount.mul(decimal(protocolSwapFee).div(1e18));

        expectEqualWithError(result, bn(expectedProtocolFeeAmount.toFixed(0)), MAX_RELATIVE_ERROR);
      });
    });
  });
});