import{Client}from"@modelcontextprotocol/sdk/client/index.js";
import{StreamableHTTPClientTransport}from"@modelcontextprotocol/sdk/client/streamableHttp.js";
import{NETWORK,USDC}from"./constants.js";
import{decodeString,decodeUint,encodeBalanceOf}from"./abi.js";
import{normalize,decide}from"./engine.js";

const REQUIRED=["get_chain_info","get_block","get_balance","get_code","get_gas_price","eth_call","estimate_gas"];
export function parseToolResult(result,tool){const text=result?.content?.find(x=>x.type==="text")?.text;if(!text)throw new Error(`${tool} returned no JSON text.`);try{return JSON.parse(text);}catch{throw new Error(`${tool} returned invalid JSON.`)}}
async function session(run){const client=new Client({name:"pharos-dry-run-executor",version:"1.2.0"}),transport=new StreamableHTTPClientTransport(new URL(NETWORK.mcpUrl),{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(25000)})});try{await client.connect(transport);const{tools}=await client.listTools();const available=new Set(tools.map(x=>x.name)),missing=REQUIRED.filter(x=>!available.has(x));if(missing.length)throw new Error(`Chain MCP missing required tools: ${missing.join(", ")}.`);const call=async(name,args={})=>parseToolResult(await client.callTool({name,arguments:args}),name);return await run(call,tools);}finally{try{await transport.terminateSession()}catch{}try{await client.close()}catch{}}}
const pickBlock=block=>({hex:block.number,decimal:BigInt(block.number).toString(),hash:block.hash,timestamp:new Date(Number(BigInt(block.timestamp))*1000).toISOString()});
const requireResult=(value,label)=>{if(value?.error)throw new Error(`${label} failed: ${value.error.message||"unknown error"}`);return value};

async function orchestrate(input,call,tools){
  const schema=name=>tools.find(x=>x.name===name)?.inputSchema?.properties||{};
  const supportsBlock=name=>Object.hasOwn(schema(name),"block");
  const at=(name,args,block)=>supportsBlock(name)?{...args,block}:args;
  const chain=requireResult(await call("get_chain_info"),"get_chain_info");if(chain.chainId!==NETWORK.chainId)throw new Error(`Expected chain ${NETWORK.chainId}; received ${chain.chainId}.`);
  const blockRaw=requireResult(await call("get_block",{block:"latest",includeTransactions:false}),"get_block"),block=pickBlock(blockRaw),base={...input};
  let metadata=null;
  if(input.mode==="erc20"){
    const token=input.token;
    const [code,name,symbol,decimals]=await Promise.all([
      call("get_code",at("get_code",{address:token},block.hex)),call("eth_call",at("eth_call",{transaction:{to:token,data:"0x06fdde03"}},block.hex)),call("eth_call",at("eth_call",{transaction:{to:token,data:"0x95d89b41"}},block.hex)),call("eth_call",at("eth_call",{transaction:{to:token,data:"0x313ce567"}},block.hex))
    ]);
    if(requireResult(code,"token code").code==="0x")throw new Error("Token target has no bytecode at the observation block.");
    metadata={name:decodeString(requireResult(name,"name()").result,"name()"),symbol:decodeString(requireResult(symbol,"symbol()").result,"symbol()"),decimals:Number(decodeUint(requireResult(decimals,"decimals()").result,"decimals()"))};
    base.tokenDecimals=metadata.decimals;base.tokenSymbol=metadata.symbol;
  }
  const normalized=await normalize(base),tx={from:normalized.transaction.from,to:normalized.transaction.to,value:normalized.transaction.value,data:normalized.transaction.data};
  const balanceRecipient=normalized.mode==="erc20"?normalized.template.recipient:normalized.transaction.to;
  const tasks={
    senderCode:call("get_code",at("get_code",{address:normalized.transaction.from},block.hex)),recipientCode:call("get_code",at("get_code",{address:balanceRecipient},block.hex)),senderNative:call("get_balance",at("get_balance",{address:normalized.transaction.from},block.hex)),gasPrice:call("get_gas_price"),call:call("eth_call",at("eth_call",{transaction:tx},block.hex)),estimate:call("estimate_gas",{transaction:tx})
  };
  if(normalized.mode==="native")tasks.recipientNative=call("get_balance",at("get_balance",{address:normalized.transaction.to},block.hex));
  if(normalized.mode==="erc20"){
    tasks.senderToken=call("eth_call",at("eth_call",{transaction:{to:normalized.template.token,data:encodeBalanceOf(normalized.transaction.from)}},block.hex));
    tasks.recipientToken=call("eth_call",at("eth_call",{transaction:{to:normalized.template.token,data:encodeBalanceOf(normalized.template.recipient)}},block.hex));
  }
  const entries=Object.entries(tasks),settled=await Promise.allSettled(entries.map(([,p])=>p)),results=Object.fromEntries(entries.map(([k],i)=>[k,settled[i]]));
  const fulfilled=k=>results[k]?.status==="fulfilled"?results[k].value:null;
  const senderCode=fulfilled("senderCode");if(!senderCode||senderCode.error)throw new Error("Sender bytecode read unavailable.");if(senderCode.code!=="0x")throw new Error("Supported templates require an EOA sender; the supplied sender has bytecode.");
  const senderNative=fulfilled("senderNative"),gasPrice=fulfilled("gasPrice");
  const evidence={chainId:chain.chainId,block,mcpEndpoint:NETWORK.mcpUrl,senderNativeBalanceWei:senderNative?.balanceWei??null,recipientNativeBalanceWei:fulfilled("recipientNative")?.balanceWei??null,recipientCode:fulfilled("recipientCode")?.code??null,gasPriceWei:gasPrice?.error?null:(gasPrice?.gasPriceWei??null),gasPriceObservation:results.gasPrice,call:results.call,estimate:results.estimate,tokenSymbol:metadata?.symbol??null,tokenDecimals:metadata?.decimals??null,senderTokenBalanceRaw:fulfilled("senderToken")?.result?decodeUint(fulfilled("senderToken").result,"sender balanceOf"):null,recipientTokenBalanceRaw:fulfilled("recipientToken")?.result?decodeUint(fulfilled("recipientToken").result,"recipient balanceOf"):null,tokenSemanticsStandard:normalized.mode==="erc20"&&normalized.template.token===USDC.toLowerCase()&&metadata?.symbol==="USDC"&&metadata?.decimals===6,observationPinning:{ethCall:supportsBlock("eth_call"),estimateGas:supportsBlock("estimate_gas"),gasPrice:supportsBlock("get_gas_price")},toolTrace:entries.map(([name],i)=>({operation:name,status:settled[i].status,tool:name==="call"?"eth_call":name==="estimate"?"estimate_gas":name,pinned:(name==="call"?supportsBlock("eth_call"):name==="estimate"?supportsBlock("estimate_gas"):supportsBlock(name))}))};
  const report=await decide(normalized,evidence);return{...report,id:crypto.randomUUID(),workspaceId:String(input.workspaceId||"default"),request:base,evidence,historical:false,createdAt:new Date().toISOString(),toolSchemas:{ethCallBlockSupported:supportsBlock("eth_call"),estimateGasBlockSupported:supportsBlock("estimate_gas"),tracingAvailable:tools.some(x=>/trace|state.?diff/i.test(x.name))}};
}
export async function simulateLive(input,adapter=null){if(adapter){if(typeof adapter.call!=="function"||!Array.isArray(adapter.tools))throw new Error("Injected MCP adapter requires call and tools.");return orchestrate(input,adapter.call,adapter.tools);}return session((call,tools)=>orchestrate(input,call,tools));}
