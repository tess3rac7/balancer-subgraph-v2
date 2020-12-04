import { BigInt, BigDecimal, Address, Bytes, store } from '@graphprotocol/graph-ts';
import { PoolCreated, Deposited, Withdrawn, AddLiquidityCall, RemoveLiquidityCall  } from '../types/Vault/Vault';
import { Balancer, Pool, PoolToken, Swap, TokenPrice, User, PoolTokenizer } from '../types/schema';
import {
  hexToDecimal,
  tokenToDecimal,
  createPoolShareEntity,
  createPoolTokenEntity,
  updatePoolLiquidity,
  saveTransaction,
  ZERO_BD,
  decrPoolCount,
} from './helpers';
import { LOG_CALL, LOG_JOIN, LOG_EXIT, LOG_SWAP, Transfer } from '../types/templates/Pool/Pool';

export function handleNewPool(event: PoolCreated): void {
  let vault = Balancer.load('2');

  // if no vault yet, set up blank initial
  if (vault == null) {
    vault = new Balancer('2');
    vault.color = 'Silver';
    vault.poolCount = 0;
    vault.finalizedPoolCount = 0;
    vault.txCount = BigInt.fromI32(0);
    vault.totalLiquidity = ZERO_BD;
    vault.totalSwapVolume = ZERO_BD;
    vault.totalSwapFee = ZERO_BD;
  }

  const pool = new Pool(event.params.poolId.toHexString());
  //pool.controller = event.params.caller
  //pool.publicSwap = false
  //pool.finalized = false
  pool.active = true;
  // TODO
  pool.swapFee = BigDecimal.fromString('0.000001');
  pool.totalWeight = ZERO_BD;
  pool.totalSwapVolume = ZERO_BD;
  pool.totalSwapFee = ZERO_BD;
  pool.liquidity = ZERO_BD;
  pool.tokenized = true;
  pool.createTime = event.block.timestamp.toI32();
  pool.tokensCount = BigInt.fromI32(0);
  pool.joinsCount = BigInt.fromI32(0);
  pool.exitsCount = BigInt.fromI32(0);
  pool.swapsCount = BigInt.fromI32(0);
  pool.vaultID = '2';
  pool.tokensList = [];
  pool.tx = event.transaction.hash;
  pool.save();

  vault.poolCount = vault.poolCount + 1;
  vault.save();

  const poolTokenizer = new PoolTokenizer(event.params.poolId.toHexString());
  poolTokenizer.totalShares = ZERO_BD;
  poolTokenizer.holdersCount = BigInt.fromI32(0);
  poolTokenizer.save();
}

export function handleAddLiquidity(call: AddLiquidityCall): void {
  const poolId = call.inputs.poolId.toHex();
  const pool = Pool.load(poolId);

  pool.joinsCount = pool.joinsCount.plus(BigInt.fromI32(1));
  const tokenAddresses = call.inputs.tokens
  const amounts = call.inputs.amounts
  for (let i: i32 = 0; i < tokenAddresses.length; i++) {
    let address = tokenAddresses[i];
    let poolTokenId = poolId.concat('-').concat(address.toHexString());
    let poolToken = PoolToken.load(poolTokenId)

    // adding initial liquidity
    if (poolToken == null) {
       createPoolTokenEntity(poolTokenId, poolId, address.toHexString())
       poolToken = PoolToken.load(poolTokenId)
    }

    const tokenAmountIn = tokenToDecimal(amounts[i].toBigDecimal(), poolToken.decimals);
    const newAmount = poolToken.balance.plus(tokenAmountIn);
    poolToken.balance = newAmount;
    poolToken.save();
  }

  pool.save();
  updatePoolLiquidity(poolId);
}

export function handleRemoveLiquidity(call: RemoveLiquidityCall): void {
  const poolId = call.inputs.poolId.toHex();
  const pool = Pool.load(poolId);

  pool.joinsCount = pool.joinsCount.plus(BigInt.fromI32(1));
  const tokenAddresses = call.inputs.tokens
  const amounts = call.inputs.amounts
  for (let i: i32 = 0; i < tokenAddresses.length; i++) {
    let address = tokenAddresses[i];
    let poolTokenId = poolId.concat('-').concat(address.toHexString());
    let poolToken = PoolToken.load(poolTokenId)

    const tokenAmountOut = tokenToDecimal(amounts[i].toBigDecimal(), poolToken.decimals);
    const newAmount = poolToken.balance.minus(tokenAmountOut);
    poolToken.balance = newAmount;
    poolToken.save();
  }

  pool.save();
  updatePoolLiquidity(poolId);
}

export function handleUserBalanceDeposited(event: Deposited): void {
  let user = User.load(event.params.user.toString());
  if (user == null) {
    user = new User(event.params.user.toString());
    user.save();
  }
}

export function handleUserBalanceWithdrawn(event: Withdrawn): void {
  let user = User.load(event.params.user.toString());
  if (user == null) {
    user = new User(event.params.user.toString());
    user.save();
  }
}

/************************************
 ************** SWAPS ***************
 ************************************/

export function handleSwap(event: LOG_SWAP): void {
  const poolId = event.address.toHex();

  const tokenIn = event.params.tokenIn.toHex();
  const poolTokenInId = poolId.concat('-').concat(tokenIn.toString());
  const poolTokenIn = PoolToken.load(poolTokenInId);
  const tokenAmountIn = tokenToDecimal(event.params.tokenAmountIn.toBigDecimal(), poolTokenIn.decimals);
  const newAmountIn = poolTokenIn.balance.plus(tokenAmountIn);
  poolTokenIn.balance = newAmountIn;
  poolTokenIn.save();

  const tokenOut = event.params.tokenOut.toHex();
  const poolTokenOutId = poolId.concat('-').concat(tokenOut.toString());
  const poolTokenOut = PoolToken.load(poolTokenOutId);
  const tokenAmountOut = tokenToDecimal(event.params.tokenAmountOut.toBigDecimal(), poolTokenOut.decimals);
  const newAmountOut = poolTokenOut.balance.minus(tokenAmountOut);
  poolTokenOut.balance = newAmountOut;
  poolTokenOut.save();

  updatePoolLiquidity(poolId);

  const swapId = event.transaction.hash.toHexString().concat('-').concat(event.logIndex.toString());
  let swap = Swap.load(swapId);
  if (swap == null) {
    swap = new Swap(swapId);
  }

  const pool = Pool.load(poolId);
  const tokensList: Array<Bytes> = pool.tokensList;
  let tokenOutPriceValue = ZERO_BD;
  const tokenOutPrice = TokenPrice.load(tokenOut);

  if (tokenOutPrice != null) {
    tokenOutPriceValue = tokenOutPrice.price;
  } else {
    for (let i: i32 = 0; i < tokensList.length; i++) {
      const tokenPriceId = tokensList[i].toHexString();
      if (!tokenOutPriceValue.gt(ZERO_BD) && tokenPriceId !== tokenOut) {
        const tokenPrice = TokenPrice.load(tokenPriceId);
        if (tokenPrice !== null && tokenPrice.price.gt(ZERO_BD)) {
          const poolTokenId = poolId.concat('-').concat(tokenPriceId);
          const poolToken = PoolToken.load(poolTokenId);
          tokenOutPriceValue = tokenPrice.price // TODO incorrect
            .times(poolToken.balance)
            //.div(poolToken.denormWeight)
            //.times(poolTokenOut.denormWeight)
            .div(poolTokenOut.balance);
        }
      }
    }
  }

  let totalSwapVolume = pool.totalSwapVolume;
  let totalSwapFee = pool.totalSwapFee;
  const liquidity = pool.liquidity;
  let swapValue = ZERO_BD;
  let swapFeeValue = ZERO_BD;

  if (tokenOutPriceValue.gt(ZERO_BD)) {
    swapValue = tokenOutPriceValue.times(tokenAmountOut);
    swapFeeValue = swapValue.times(pool.swapFee);
    totalSwapVolume = totalSwapVolume.plus(swapValue);
    totalSwapFee = totalSwapFee.plus(swapFeeValue);

    const factory = Balancer.load('1');
    factory.totalSwapVolume = factory.totalSwapVolume.plus(swapValue);
    factory.totalSwapFee = factory.totalSwapFee.plus(swapFeeValue);
    factory.save();

    pool.totalSwapVolume = totalSwapVolume;
    pool.totalSwapFee = totalSwapFee;
  }
  pool.swapsCount = pool.swapsCount + BigInt.fromI32(1);
  if (newAmountIn.equals(ZERO_BD) || newAmountOut.equals(ZERO_BD)) {
    decrPoolCount(true);
    pool.active = false;
  }
  pool.save();

  swap.caller = event.params.caller;
  swap.tokenIn = event.params.tokenIn;
  swap.tokenInSym = poolTokenIn.symbol;
  swap.tokenOut = event.params.tokenOut;
  swap.tokenOutSym = poolTokenOut.symbol;
  swap.tokenAmountIn = tokenAmountIn;
  swap.tokenAmountOut = tokenAmountOut;
  swap.poolAddress = event.address.toHex();
  swap.userAddress = event.transaction.from.toHex();
  swap.poolTotalSwapVolume = totalSwapVolume;
  swap.poolTotalSwapFee = totalSwapFee;
  swap.poolLiquidity = liquidity;
  swap.value = swapValue;
  swap.feeValue = swapFeeValue;
  swap.timestamp = event.block.timestamp.toI32();
  swap.save();

  saveTransaction(event, 'swap');
}