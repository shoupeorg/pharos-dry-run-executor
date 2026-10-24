function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export async function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(canonical(value))),hash=await crypto.subtle.digest("SHA-256",bytes);return`sha256:${[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("")}`;}

