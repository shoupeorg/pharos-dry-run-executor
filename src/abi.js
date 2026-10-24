const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export function address(value,label="address"){if(typeof value!=="string"||!ADDRESS.test(value))throw new Error(`${label} must be a 20-byte EVM address.`);return value.toLowerCase();}
const word=value=>value.replace(/^0x/,"").padStart(64,"0");
export function encodeBalanceOf(owner){return `0x70a08231${word(address(owner))}`;}
export function encodeTransfer(recipient,amount){return `0xa9059cbb${word(address(recipient))}${BigInt(amount).toString(16).padStart(64,"0")}`;}
export function decodeTransfer(data){if(typeof data!=="string"||!/^0xa9059cbb[0-9a-f]{128}$/i.test(data))throw new Error("ERC-20 transfer calldata is malformed.");return{recipient:`0x${data.slice(34,74)}`.toLowerCase(),amount:BigInt(`0x${data.slice(74)}`).toString()};}
export function decodeUint(data,label="uint256"){if(typeof data!=="string"||!/^0x[0-9a-f]{64}$/i.test(data))throw new Error(`${label} return data is malformed.`);return BigInt(data).toString();}
export function decodeBool(data){if(data==="0x")return{kind:"EMPTY",compatible:true,value:null};if(!/^0x[0-9a-f]{64}$/i.test(data||""))return{kind:"MALFORMED",compatible:false,value:null};const n=BigInt(data);if(n===0n)return{kind:"FALSE",compatible:false,value:false};if(n===1n)return{kind:"TRUE",compatible:true,value:true};return{kind:"MALFORMED",compatible:false,value:null};}
export function decodeString(data,label="string"){
  if(typeof data!=="string"||!/^0x[0-9a-f]*$/i.test(data)||data.length<66)throw new Error(`${label} return data is malformed.`);
  const hex=data.slice(2);let start=0;
  const offset=Number(BigInt(`0x${hex.slice(0,64)}`));if(offset%32===0&&hex.length>=(offset+32)*2){const len=Number(BigInt(`0x${hex.slice(offset*2,(offset+32)*2)}`));const raw=hex.slice((offset+32)*2,(offset+32+len)*2);if(raw.length===len*2)return new TextDecoder().decode(Uint8Array.from(raw.match(/../g)||[],x=>parseInt(x,16)));}
  const raw=hex.slice(0,64).replace(/00+$/,"");return new TextDecoder().decode(Uint8Array.from(raw.match(/../g)||[],x=>parseInt(x,16)));
}
export function decodeRevert(error){
  const data=error?.data||error?.error?.data||null,message=error?.message||error?.error?.message||"Simulation failed without a reason.";
  if(typeof data==="string"&&data.startsWith("0x08c379a0")&&data.length>=202){try{return{kind:"ERROR_STRING",reason:decodeString(`0x${data.slice(10)}`,"Error(string)"),raw:data,message};}catch{}}
  if(typeof data==="string"&&data.startsWith("0x4e487b71")&&data.length>=74)return{kind:"PANIC",reason:`Panic(${BigInt(`0x${data.slice(10,74)}`)})`,raw:data,message};
  return{kind:"UNDECODED_REVERT",reason:message,raw:data,message};
}
