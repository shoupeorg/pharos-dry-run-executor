import{NETWORK,SIMULATION_TTL_MS}from"./constants.js";
import{address,decodeBool,decodeRevert,decodeTransfer,encodeTransfer}from"./abi.js";
import{ceilMulBps,formatUnits,parseDecimal,toQuantity}from"./math.js";
import{digest}from"./digest.js";

const allowedRaw=new Set(["chainId","from","to","value","data"]);
function integer(value,label,min,max){if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label} must be an integer from ${min} to ${max}.`);return value;}
export async function normalize(input){
  const mode=input?.mode;
  if(!["native","erc20","advanced"].includes(mode))throw new Error("mode must be native, erc20, or advanced.");
  const chainId=Number(input.chainId??NETWORK.chainId);if(chainId!==NETWORK.chainId)throw new Error(`Only chain ID ${NETWORK.chainId} is supported.`);
  const from=address(input.from,"sender"),bufferBps=integer(Number(input.gasBufferBps??2000),"gasBufferBps",0,10000);
  const ceiling= input.gasPriceCeilingGwei==null||input.gasPriceCeilingGwei===""?null:parseDecimal(input.gasPriceCeilingGwei,9,"gasPriceCeilingGwei").toString();
  const reserve=parseDecimal(input.minimumRetainedNative??"0",18,"minimumRetainedNative").toString();
  let transaction,template={mode};
  if(mode==="native"){
    const to=address(input.to,"recipient"),amount=parseDecimal(input.amount,18,"amount");transaction={chainId,from,to,value:toQuantity(amount),data:"0x"};template={mode,amountAtomic:amount.toString(),decimals:18,symbol:"PROS"};
  }else if(mode==="erc20"){
    const token=address(input.token,"token contract"),to=address(input.to,"recipient"),decimals=integer(Number(input.tokenDecimals??6),"tokenDecimals",0,255),amount=parseDecimal(input.amount,decimals,"amount");const data=encodeTransfer(to,amount);const round=decodeTransfer(data);if(round.recipient!==to||round.amount!==amount.toString())throw new Error("Encoded transfer did not round-trip.");transaction={chainId,from,to:token,value:"0x0",data};template={mode,token,recipient:to,amountAtomic:amount.toString(),decimals,symbol:input.tokenSymbol||null};
  }else{
    if(!input.rawTransaction||typeof input.rawTransaction!=="object"||Array.isArray(input.rawTransaction))throw new Error("rawTransaction must be an object.");
    for(const key of Object.keys(input.rawTransaction))if(!allowedRaw.has(key))throw new Error(`Unsupported raw transaction field: ${key}.`);
    if(Number(input.rawTransaction.chainId)!==NETWORK.chainId)throw new Error(`Raw transaction chainId must be ${NETWORK.chainId}.`);
    transaction={chainId:NETWORK.chainId,from:address(input.rawTransaction.from,"raw from"),to:address(input.rawTransaction.to,"raw to"),value:String(input.rawTransaction.value??"0x0").toLowerCase(),data:String(input.rawTransaction.data??"0x").toLowerCase()};
    if(transaction.from!==from)throw new Error("Advanced sender conflicts with raw transaction from.");if(!/^0x[0-9a-f]+$/i.test(transaction.value)||!/^0x([0-9a-f]{2})*$/i.test(transaction.data))throw new Error("Raw value/data must be canonical hex.");
  }
  const constraints={minimumRetainedNativeWei:reserve,gasBufferBps:bufferBps,gasPriceCeilingWei:ceiling};
  return{mode,transaction,template,constraints,transactionDigest:await digest(transaction),constraintsDigest:await digest(constraints)};
}

function callOutcome(settled){if(settled.status==="rejected")return{status:"TRANSPORT_FAILURE",error:settled.reason?.message||String(settled.reason)};const value=settled.value;if(value?.error)return{status:"REVERT",revert:decodeRevert(value.error)};return{status:"SUCCESS",returnData:value?.result??null};}
function estimateOutcome(settled){if(settled.status==="rejected")return{status:"TRANSPORT_FAILURE",error:settled.reason?.message||String(settled.reason)};const value=settled.value;if(value?.error)return{status:"REVERT",revert:decodeRevert(value.error)};if(!/^\d+$/.test(String(value?.gas)))return{status:"UNAVAILABLE",error:"Gas estimate was missing."};return{status:"SUCCESS",gas:String(value.gas)};}

export async function decide(normalized,evidence,now=new Date()){
  const reasons=[],call=callOutcome(evidence.call),estimate=estimateOutcome(evidence.estimate);let decision="GO";
  if(evidence.chainId!==NETWORK.chainId){decision="INSUFFICIENT_DATA";reasons.push("Chain identity was not verified.");}
  if(call.status==="REVERT"){decision="NO_GO";reasons.push(call.revert.reason);}else if(call.status!=="SUCCESS"){decision="INSUFFICIENT_DATA";reasons.push(`eth_call ${call.status.toLowerCase().replaceAll("_"," ")}.`);}
  if(estimate.status==="REVERT"){decision="NO_GO";reasons.push(`Gas estimation reverted: ${estimate.revert.reason}`);}else if(estimate.status!=="SUCCESS"&&decision==="GO"){decision="INSUFFICIENT_DATA";reasons.push("Gas estimate is unavailable.");}
  let returnCompatibility=null;if(normalized.mode==="erc20"&&call.status==="SUCCESS"){returnCompatibility=decodeBool(call.returnData);if(returnCompatibility.kind==="FALSE"){decision="NO_GO";reasons.push("ERC-20 transfer returned false.");}else if(returnCompatibility.kind==="MALFORMED"){decision="INSUFFICIENT_DATA";reasons.push("ERC-20 transfer returned malformed data.");}else if(returnCompatibility.kind==="EMPTY")reasons.push("ERC-20 returned empty data; accepted only as legacy-compatible call success.");}
  const gasPrice=BigInt(evidence.gasPriceWei||0),gas=estimate.status==="SUCCESS"?BigInt(estimate.gas):null,bufferedGas=gas==null?null:ceilMulBps(gas,normalized.constraints.gasBufferBps),estimatedGasCost=gas==null?null:gas*gasPrice,bufferedGasBudget=bufferedGas==null?null:bufferedGas*gasPrice,value=BigInt(normalized.transaction.value),reserve=BigInt(normalized.constraints.minimumRetainedNativeWei),nativeBalance=evidence.senderNativeBalanceWei==null?null:BigInt(evidence.senderNativeBalanceWei),required=bufferedGasBudget==null?null:value+bufferedGasBudget+reserve;
  if(normalized.constraints.gasPriceCeilingWei!==null&&gasPrice>BigInt(normalized.constraints.gasPriceCeilingWei)){decision="NO_GO";reasons.push("Observed gas price exceeds the configured ceiling.");}
  if(nativeBalance===null){decision="INSUFFICIENT_DATA";reasons.push("Sender native balance is unavailable.");}else if(required!==null&&nativeBalance<required){decision="NO_GO";reasons.push("Sender native balance cannot cover value, buffered gas budget, and retained reserve.");}
  const effects=buildEffects(normalized,evidence,estimatedGasCost,call.status);
  if(decision==="GO")reasons.unshift("Both eth_call and gas estimation succeeded and native affordability constraints passed.");
  const completedAt=now.toISOString(),expiresAt=new Date(now.getTime()+SIMULATION_TTL_MS).toISOString();
  const pinning=evidence.observationPinning||{};
  return{engineVersion:"dry-run-executor/1.1.0",decision,reasons,transaction:normalized.transaction,transactionDigest:normalized.transactionDigest,constraints:normalized.constraints,constraintsDigest:normalized.constraintsDigest,simulation:{call,estimate,returnCompatibility},cost:{gasEstimate:gas?.toString()??null,bufferedGasLimit:bufferedGas?.toString()??null,gasPriceWei:evidence.gasPriceWei??null,estimatedGasCostWei:estimatedGasCost?.toString()??null,bufferedGasBudgetWei:bufferedGasBudget?.toString()??null,nativeValueWei:value.toString(),requiredNativeBalanceWei:required?.toString()??null,remainingAfterBufferedBudgetWei:nativeBalance!==null&&required!==null?(nativeBalance-value-bufferedGasBudget).toString():null,feeDisclosure:"gas × gas price is a modeled budget, not the exact eventual fee; native value is separate."},effects,block:evidence.block,freshness:{simulatedAt:completedAt,expiresAt,ethCallPinned:pinning.ethCall===true,estimateGasPinned:pinning.estimateGas===true,gasPricePinned:pinning.gasPrice===true},traceAvailable:false,limitations:["Exact post-state unavailable: Chain MCP exposes no tracing or state-diff tool.",pinning.estimateGas===true?"Gas estimation is pinned to the recorded block; gas price remains live and unpinned.":"Gas estimate and gas price are live but unpinned."]};
}

function buildEffects(n,e,estimatedGasCost,callStatus){
  if(n.mode==="advanced")return[{asset:"UNKNOWN",provenance:"UNAVAILABLE",before:"UNKNOWN",expectedAfter:"UNKNOWN",explanation:"Arbitrary call effects require tracing or a verified adapter."}];
  if(callStatus!=="SUCCESS"){
    if(n.mode==="erc20"&&e.senderTokenBalanceRaw!=null&&e.recipientTokenBalanceRaw!=null){const sender=BigInt(e.senderTokenBalanceRaw),recipient=BigInt(e.recipientTokenBalanceRaw);return[
      {account:n.transaction.from,asset:e.tokenSymbol||n.template.symbol||"TOKEN",provenance:"REVERTED_CALL_MODEL",before:formatUnits(sender,e.tokenDecimals),expectedAfter:formatUnits(sender,e.tokenDecimals),explanation:"The simulated token call reverted, so no token state transition is modeled. No transaction was sent."},
      {account:n.template.recipient,asset:e.tokenSymbol||n.template.symbol||"TOKEN",provenance:"REVERTED_CALL_MODEL",before:formatUnits(recipient,e.tokenDecimals),expectedAfter:formatUnits(recipient,e.tokenDecimals),explanation:"The simulated token call reverted, so no token state transition is modeled. No transaction was sent."}
    ];}
    return[{account:n.transaction.from,asset:"PROS",provenance:"UNAVAILABLE",before:e.senderNativeBalanceWei==null?"UNKNOWN":formatUnits(e.senderNativeBalanceWei,18),expectedAfter:"UNKNOWN",explanation:"The call did not succeed; no state change is predicted and no transaction was sent."}];
  }
  const self=(n.mode==="native"?n.transaction.to:n.template.recipient)===n.transaction.from;
  if(n.mode==="native"){
    const sender=BigInt(e.senderNativeBalanceWei),recipient=e.recipientNativeBalanceWei==null?null:BigInt(e.recipientNativeBalanceWei),value=BigInt(n.transaction.value),fee=estimatedGasCost??0n;
    if(e.recipientCode&&e.recipientCode!=="0x")return[{asset:"PROS",provenance:"MODELED_LIMITED",before:formatUnits(sender,18),expectedAfter:"UNKNOWN",explanation:"Recipient has contract bytecode; simple EOA balance modeling is not used."}];
    return self?[{account:n.transaction.from,asset:"PROS",provenance:"MODELED",before:formatUnits(sender,18),expectedAfter:formatUnits(sender-fee,18),explanation:"Self-transfer leaves value with the same account; only modeled gas cost reduces balance."}]:[
      {account:n.transaction.from,asset:"PROS",provenance:"MODELED",before:formatUnits(sender,18),expectedAfter:formatUnits(sender-value-fee,18),explanation:"Modeled as value plus estimated gas cost; not observed post-state."},
      {account:n.transaction.to,asset:"PROS",provenance:"MODELED",before:recipient==null?"UNKNOWN":formatUnits(recipient,18),expectedAfter:recipient==null?"UNKNOWN":formatUnits(recipient+value,18),explanation:"EOA recipient increase modeled by value; not observed post-state."}
    ];
  }
  if(e.senderTokenBalanceRaw==null||e.recipientTokenBalanceRaw==null)return[{asset:e.tokenSymbol||n.template.symbol||"TOKEN",provenance:"UNAVAILABLE",before:"UNKNOWN",expectedAfter:"UNKNOWN",explanation:"Token pre-balances are unavailable; exact post-state is unavailable."}];
  const sender=BigInt(e.senderTokenBalanceRaw),recipient=BigInt(e.recipientTokenBalanceRaw),amount=BigInt(n.template.amountAtomic),exact=e.tokenSemanticsStandard===true;
  const warning=exact?"Assumes verified standard ERC-20 semantics; exact post-state still unavailable without tracing.":"Token hooks, fees, rebasing, or proxy behavior are not ruled out; exact post-state unavailable.";
  return self?[{account:n.transaction.from,asset:e.tokenSymbol||n.template.symbol||"TOKEN",provenance:"MODELED_ASSUMPTION",before:formatUnits(sender,e.tokenDecimals),expectedAfter:formatUnits(sender,e.tokenDecimals),explanation:`Self-transfer modeled unchanged. ${warning}`}]:[
    {account:n.transaction.from,asset:e.tokenSymbol||n.template.symbol||"TOKEN",provenance:"MODELED_ASSUMPTION",before:formatUnits(sender,e.tokenDecimals),expectedAfter:exact?formatUnits(sender-amount,e.tokenDecimals):"UNKNOWN",explanation:warning},
    {account:n.template.recipient,asset:e.tokenSymbol||n.template.symbol||"TOKEN",provenance:"MODELED_ASSUMPTION",before:formatUnits(recipient,e.tokenDecimals),expectedAfter:exact?formatUnits(recipient+amount,e.tokenDecimals):"UNKNOWN",explanation:warning}
  ];
}

export async function authorizeUnsigned(report,request,now=new Date()){
  if(!report||typeof report!=="object"||!report.transaction||!report.constraints||!report.simulation||!report.freshness||!report.transactionDigest||!report.constraintsDigest)throw Object.assign(new Error("Unsigned preparation blocked: simulation report is incomplete."),{status:409});
  if(report.historical===true)throw Object.assign(new Error("Unsigned preparation blocked: historical report requires a fresh simulation."),{status:409});
  if(report.decision!=="GO")throw Object.assign(new Error(`Unsigned preparation blocked: decision is ${report.decision}.`),{status:409});
  if(report.simulation.call?.status!=="SUCCESS"||report.simulation.estimate?.status!=="SUCCESS")throw Object.assign(new Error("Unsigned preparation blocked: simulation evidence is incomplete."),{status:409});
  if(report.transaction.chainId!==NETWORK.chainId)throw Object.assign(new Error("Unsigned preparation blocked: wrong chain."),{status:409});
  if(report.transactionDigest!==await digest(report.transaction)||report.constraintsDigest!==await digest(report.constraints))throw Object.assign(new Error("Unsigned preparation blocked: report integrity check failed."),{status:409});
  const normalized=await normalize(request);
  if(report.transactionDigest!==normalized.transactionDigest)throw Object.assign(new Error("Unsigned preparation blocked: transaction digest changed."),{status:409});
  if(report.constraintsDigest!==normalized.constraintsDigest)throw Object.assign(new Error("Unsigned preparation blocked: constraints digest changed."),{status:409});
  const expiry=Date.parse(report.freshness.expiresAt);if(!Number.isFinite(expiry)||expiry<=now.getTime())throw Object.assign(new Error("Unsigned preparation blocked: simulation expired."),{status:409});
  return{kind:"UNSIGNED_TRANSACTION",authorizedByReportId:report.id,transaction:report.transaction,transactionDigest:report.transactionDigest,constraintsDigest:report.constraintsDigest,expiresAt:report.freshness.expiresAt,warning:"Unsigned only. This application cannot sign or broadcast it."};
}
