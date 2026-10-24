export function parseDecimal(value,decimals,label="amount"){
  if(typeof value!=="string"||!/^(0|[1-9]\d*)(\.\d+)?$/.test(value))throw new Error(`${label} must be a non-negative decimal string.`);
  const [whole,fraction=""]=value.split(".");
  if(fraction.length>decimals)throw new Error(`${label} exceeds ${decimals} decimal places.`);
  return BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+"0".repeat(decimals)).slice(0,decimals)||"0");
}
export function formatUnits(value,decimals){
  value=BigInt(value);const negative=value<0n;if(negative)value=-value;const base=10n**BigInt(decimals),whole=value/base,fraction=(value%base).toString().padStart(decimals,"0").replace(/0+$/,"");
  return `${negative?"-":""}${fraction?`${whole}.${fraction}`:whole.toString()}`;
}
export function ceilMulBps(value,bufferBps){return (BigInt(value)*(10000n+BigInt(bufferBps))+9999n)/10000n;}
export function toQuantity(value){value=BigInt(value);return `0x${value.toString(16)}`;}
export function fromQuantity(value,label="quantity"){if(typeof value!=="string"||!/^0x[0-9a-f]+$/i.test(value))throw new Error(`${label} is not a hex quantity.`);return BigInt(value);}
