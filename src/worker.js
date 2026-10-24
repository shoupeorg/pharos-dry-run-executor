import{ENGINE_VERSION,NETWORK}from"./constants.js";import{simulateLive}from"./mcp.js";import{authorizeUnsigned}from"./engine.js";import{getReport,listReports,saveReport}from"./store.js";import{markdown}from"./exports.js";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function body(req){try{return await req.json()}catch{throw Object.assign(new Error("Request body must be valid JSON."),{status:400})}}
async function route(req,env){const url=new URL(req.url),parts=url.pathname.split("/").filter(Boolean);
 if(url.pathname==="/api/meta")return json({engineVersion:ENGINE_VERSION,network:NETWORK,readOnly:true,signing:false,broadcast:false,templates:["native","erc20","advanced"],tracing:false});
 if(url.pathname==="/api/examples")return json({success:"/evidence/v1-live-success.json",failure:"/evidence/v1-live-failure.json",gateRejection:"/evidence/v1-live-gate-rejection.json"});
 if(url.pathname==="/api/simulate"&&req.method==="POST"){const input=await body(req),report=await simulateLive(input);await saveReport(env.DB,report);return json(report,201);}
 if(url.pathname==="/api/reports"&&req.method==="GET")return json({reports:await listReports(env.DB,url.searchParams.get("workspace")||"default")});
 if(parts[0]==="api"&&parts[1]==="reports"&&parts[2]){const report=await getReport(env.DB,parts[2]);if(!report)return json({error:"Report not found."},404);
   if(parts.length===3&&req.method==="GET")return json({...report,historical:true});
   if(parts[3]==="markdown"&&req.method==="GET")return new Response(markdown(report),{headers:{"content-type":"text/markdown; charset=utf-8","content-disposition":`attachment; filename="dry-run-${report.id}.md"`}});
   if(parts[3]==="json"&&req.method==="GET")return new Response(JSON.stringify({...report,historical:true},null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="dry-run-${report.id}.json"`}});
   if(parts[3]==="prepare"&&req.method==="POST"){const unsigned=await authorizeUnsigned(report,await body(req));return json(unsigned);}
 }
 return env.ASSETS.fetch(req);
}
export default{async fetch(req,env){try{return await route(req,env)}catch(error){return json({error:error.message,gate:"BLOCKED",readOnly:true},error.status||400)}}};

